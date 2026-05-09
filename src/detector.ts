import vanillaPuppeteer from 'puppeteer';
import { addExtra } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { DetectionResult, TechnologyFound } from './types.js';


const puppeteer = addExtra(vanillaPuppeteer as any);
puppeteer.use(StealthPlugin());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Loading Technology Database
const TECH_DATABASE: Record<string, any> = {};
const techFolder = path.join(__dirname, 'technologies');

try {
    const files = fs.readdirSync(techFolder);
    for (const file of files) {
        if (file.endsWith('.json')) {
            const content = JSON.parse(fs.readFileSync(path.join(techFolder, file), 'utf8'));
            Object.assign(TECH_DATABASE, content);
        }
    }
    console.log(`Loaded ${Object.keys(TECH_DATABASE).length} technologies.`);
} catch (err) {
    console.error(`Error loading database:`, (err as Error).message);
}

// Pre-processing JavaScript variables
const jsPathsToTest = new Set<string>();
for (const rules of Object.values(TECH_DATABASE)) {
    const r = rules as any;
    if (r.js) {
        for (const jsPath of Object.keys(r.js)) {
            // Splitting to get the root variable (Shopify.Analytics.page => Shopify)
            const rootVar = jsPath.split('.')[0];
            if (rootVar) jsPathsToTest.add(rootVar);
        }
    }
}
const jsPathsArray = Array.from(jsPathsToTest);

// Regex Helper 
function testPattern(pattern: any, text: string): boolean {
    if (!pattern || !text) return false;
    try {
        let cleanP = String(pattern).split('\\;')[0];
        if (!cleanP) return false;
        // Removing regex flags for safety
        cleanP = cleanP.replace(/\(\?[i]\)/g, '');
        return new RegExp(cleanP, 'i').test(text);
    } catch (err) {
        return false;
    }
}

// Main Detection Function
export async function analyzeDomain(domain: string): Promise<DetectionResult> {
    const url = domain.startsWith('http') ? domain : `https://${domain}`;
    const found: TechnologyFound[] = [];

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1366, height: 768 });
        let responseHeaders: Record<string, string> = {};
        page.on('response', (response: any) => {
            if (response.url() === url || response.url() === url + '/') {
                responseHeaders = response.headers();
            }
        });
        const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 50000 });
        if (!response) throw new Error("No response from server.");

        // HTML and Cookies extraction
        const html = await page.content();
        const $ = cheerio.load(html);
        const cookies = await page.cookies();

        // JavaScript Variables Extraction
        const foundJsVars = await page.evaluate((paths) => {
            const results: Record<string, boolean> = {};
            for (const path of paths) {
                if (typeof (window as any)[path] !== 'undefined') {
                    results[path] = true;
                }
            }
            return results;
        }, jsPathsArray);

        // Detecting Technologies
        for (const [name, rules] of Object.entries(TECH_DATABASE)) {
            const r = rules as any;

            // JavaScript Variables Check
            if (r.js) {
                for (const [jsPath, pattern] of Object.entries(r.js)) {
                    const rootVar = jsPath.split('.')[0];
                    if (rootVar && foundJsVars[rootVar]) {
                        found.push({ name, proof: `JS Global Variable found: ${rootVar}` });
                    }
                }
            }

            // HTML Check
            if (r.html) {
                const patterns: any[] = Array.isArray(r.html) ? r.html : [r.html];
                if (patterns.some((p: any) => testPattern(p, html))) {
                    found.push({ name, proof: 'Matched in HTML' });
                    continue;
                }
            }

            // META Check
            if (r.meta) {
                let metaFound = false;
                for (const [metaName, pattern] of Object.entries(r.meta)) {
                    const content = $(`meta[name="${metaName}" i], meta[property="${metaName}" i]`).attr('content');
                    if (content && testPattern(pattern, content)) {
                        found.push({ name, proof: `Meta: ${metaName}` });
                        metaFound = true;
                        break;
                    }
                }
                if (metaFound) continue;
            }

            // Scripts Check
            if (r.scriptSrc) {
                const patterns: any[] = Array.isArray(r.scriptSrc) ? r.scriptSrc : [r.scriptSrc];
                let scriptFound = false;
                $('script').each((_, el) => {
                    const src = $(el).attr('src');
                    if (src && patterns.some((p: any) => testPattern(p, src))) {
                        scriptFound = true;
                    }
                });
                if (scriptFound) {
                    found.push({ name, proof: 'Script source URL' });
                    continue;
                }
            }

            // Headers Check
            if (r.headers) {
                for (const [hName, pattern] of Object.entries(r.headers)) {
                    const value = responseHeaders[hName.toLowerCase()];
                    if (value && testPattern(pattern, value)) {
                        found.push({ name, proof: `Header: ${hName}` });
                    }
                }
            }

            // Cookies check
            if (r.cookies) {
                for (const [cookieName, pattern] of Object.entries(r.cookies)) {
                    const foundCookie = cookies.find(c => c.name.toLowerCase() === cookieName.toLowerCase());
                    if (foundCookie) {
                        const patternStr = typeof pattern === 'string' ? pattern : (pattern as any).pattern;
                        if (patternStr && testPattern(patternStr, foundCookie.value)) {
                            found.push({ name, proof: `Cookie value: ${cookieName}` });
                        } else if (!patternStr) {
                            found.push({ name, proof: `Cookie exists: ${cookieName}` });
                        }
                    }
                }
            }
        }

        await browser.close();

        const unique = Array.from(new Map(found.map(item => [item.name, item])).values());
        console.log(`${domain}: Found ${unique.length} technologies.`);

        return { domain, technologies: unique };

    } catch (error: any) {
        console.error(`Error ${domain}: ${error.message}`);
        await browser.close();
        return { domain, technologies: [], error: error.message };
    }
}