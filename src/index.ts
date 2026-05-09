// @ts-ignore
import parquet from 'parquetjs-lite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { analyzeDomain } from './detector.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read file for domain list
const PARQUET_FILE = path.join(__dirname, '../domenii.parquet');

async function extractDomainsFromParquet(filePath: string): Promise<string[]> {
    const domains: string[] = [];
    try {
        const reader = await parquet.ParquetReader.openFile(filePath);
        const cursor = reader.getCursor();
        let record = null;

        while ((record = await cursor.next())) {
            const domainValue = record.domain || record.url || record.Domain || Object.values(record)[0];
            if (domainValue && typeof domainValue === 'string') {
                domains.push(domainValue.trim());
            }
        }
        await reader.close();
        console.log(`Extracted ${domains.length} domains.`);
        return domains;
    } catch (error: any) {
        console.error(`Error reading Parquet file: ${error.message}`);
        return [];
    }
}

async function main() {
    console.log("Start Web Scraping");

    // 1. Domain Extraction
    const domains = await extractDomainsFromParquet(PARQUET_FILE);
    if (domains.length === 0) {
        console.log("No domains to process. Exiting.");
        return;
    }

    const results = [];
    const techCounter = new Map<string, number>();

    // Speed Configuration
    const BATCH_SIZE = 10; // How many domains to process simultaneously (may use a lot of RAM)

    console.log(`\nStart processing (${BATCH_SIZE} domains simultaneously`);

    // 2. Processing
    for (let i = 0; i < domains.length; i += BATCH_SIZE) {
        const batch = domains.slice(i, i + BATCH_SIZE);

        console.log(`\nProcessing the batch ${Math.floor(i / BATCH_SIZE) + 1} (domains ${i + 1} - ${Math.min(i + BATCH_SIZE, domains.length)} from ${domains.length})`);

        const batchResults = await Promise.all(
            batch.map(async (domain) => {
                try {
                    return await analyzeDomain(domain!);
                } catch (err) {
                    // In case one domain fails, we log the error but continue with the rest
                    return { domain, technologies: [], error: String(err) };
                }
            })
        );

        for (const result of batchResults) {
            results.push(result);

            if (result.technologies && result.technologies.length > 0) {
                for (const tech of result.technologies) {
                    const currentCount = techCounter.get(tech.name) || 0;
                    techCounter.set(tech.name, currentCount + 1);
                }
            } else {
                console.log(`No technologies found (or error) for: ${result.domain}`);
            }
        }
    }

    // 3. JSON Output
    const jsonOutputPath = path.join(__dirname, '../raport_complet.json');
    fs.writeFileSync(jsonOutputPath, JSON.stringify(results, null, 2));
    console.log(`\nThe output was saved in: ${jsonOutputPath}`);

    

    console.log("\nScraping completed");
    console.log(`Processed domains: ${domains.length}`);

    console.log(`Unique technologies found: ${techCounter.size}`);
}

main().catch(console.error);