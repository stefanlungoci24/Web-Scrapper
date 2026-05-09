Web Scraper

1. Presentation

The objective of this project was to build a scalable detection engine capable of identifying the web technologies used by a dataset of 200 domains.

Rather than relying on basic HTML parsing, the final product is a headless browser scraper. It is engineered to bypass basic anti-bot protections, evaluate Single-Page Applications and process data efficiently without overloading system memory.

In the beginning I started by gathering the signatures for detection myself, but seeing I would only get 3 to 5 technologies detected for various sites, I resorted to using Wappalyzer's `technologies` folder, full of signatures from all over the internet. Wappalyzer is an open-source tool that has pushed this project's capabilities close to comemrcial performance, by simply borrowing their dataset.

2. Challenges

I have faced various challenges whilst building this application. For starters, I started with a basic scraper using `axios` and `cheerio` to fetch HTML and match Regex patterns. The problem was that modern sites use modern frameworks such as React, Next.js where the HTML is nearly empty and the content is injected via JavaScript. To solve this issue I started using `Puppeteer`. To extract the full HTML from the site I made it wait to finish loading background scripts.

Another challenged I have faced was the invisible JS variables. Many tools used in modern sites such as Analytics leave no visible HTML tags. Fortunately, the Wappalyzer dataset contains rules to detect these through JavaScript global variables. I injected an evaluation script `page.evaluate` directly into the Puppeteer context to scan the browser's memory. One problem I had here was the fact that Wappalyzer checks for deep-nested propreties such as "Shopify.page.name" and evaluating this on a non-shopify site throws an error . For that reason I pre-processed the JSON database using a Set to extract the root variables ("Shopify" in this context).

Puppeteer is a great tool, but basic instances of it are flagged by Cloudflare and similar services. For that reason I integrated a plugin `puppeteer-extra-plugin-stealth` to allow it to bypass the basic Web Application Firewall.

Many domains threw `net::ERR_CERT_AUTHORITY_INVALID`, causing Puppeteer to stop. To bypass this I used `--ignore-certificate-errors` directly in Chrome's launch arguments.

Iterating sequentially through the domain list took a very long time and my solution to this problem was to run the domains in batches of 10 to be at the limit where I am not out of memory, but where I can run the app in an optimal way. The engine launches 10 concurrent browser instances, waits for the entire batch to be finished and moves to the next one.

One thing which crashed the applications many times was the existence of PCRE regex flags which are not compatible with JavaScript's engine. For example the flag `(?i)` crashed the application. My solution was to write a function `testPattern` which replaces the flag with the native flag `i`.

3. Results

The engine succesfully processed the dataset and identified 326 unique technologies. The results are outputted to `raport_complet.json`, containing the proof of existence for each technology. This is the result for a scraper operating strictly on the rendered front-end. 

To scale this project to millions of domains I would need to move to a cloud-based architecture and a system which can redirect domains to machines dynamically, based on their performance. Also I would need to expand on the logic of the application, to be able to fetch data not only from the front-end, but also the back-end. A good way to bypass the anti-bot systems would be to use proxys so that each request appears to ble from a different IP address.

To discover new techonologies in the future, I would sync my dataset to Wappalyzer's and to other open-source projects. I would also flag the tags and the cookies that the system does not recognize, in case they start appearing on many domains, because that would be a new technology.
