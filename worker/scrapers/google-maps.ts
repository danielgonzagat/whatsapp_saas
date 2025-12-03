import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser } from 'puppeteer';

puppeteer.use(StealthPlugin());

export interface ScrapedLead {
  name: string;
  phone: string;
  address: string;
  category: string;
  rating?: number;
  reviews?: number;
  website?: string;
}

export async function scrapeGoogleMaps(query: string, limit: number = 20): Promise<ScrapedLead[]> {
  let browser: Browser | null = null;
  const leads: ScrapedLead[] = [];

  try {
    const args = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
    ];

    if (process.env.PROXY_URL) {
        args.push(`--proxy-server=${process.env.PROXY_URL}`);
    }

    browser = await puppeteer.launch({
      headless: true,
      args
    });

    const page = await browser.newPage();
    
    // Rotate User Agents
    const userAgents = [
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    ];
    const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
    await page.setUserAgent(randomUA);
    
    if (process.env.PROXY_USERNAME && process.env.PROXY_PASSWORD) {
        await page.authenticate({
            username: process.env.PROXY_USERNAME,
            password: process.env.PROXY_PASSWORD
        });
    }
    
    await page.setViewport({ width: 1280, height: 800 });

    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    console.log(`[MAPS] Navigating to: ${searchUrl}`);
    
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    try {
        const consentSelector = 'form[action*="consent"] button';
        if (await page.$(consentSelector)) {
            await page.click(consentSelector);
            await page.waitForNavigation({ waitUntil: 'networkidle2' });
        }
    } catch (e) { }

    const feedSelector = 'div[role="feed"]'; 
    try {
      await page.waitForSelector(feedSelector, { timeout: 10000 });
    } catch (e) {
      console.error("[MAPS] Could not find results feed. Maybe no results?");
      return [];
    }

    // Auto-scroll to load items
    console.log("[MAPS] Scrolling to load results...");
    await page.evaluate(async (selector, limit) => {
      const wrapper = document.querySelector(selector);
      if (!wrapper) return;

      await new Promise<void>((resolve, reject) => {
        let totalHeight = 0;
        let distance = 100;
        let timer = setInterval(() => {
          const scrollHeight = wrapper.scrollHeight;
          wrapper.scrollBy(0, distance);
          totalHeight += distance;

          const items = document.querySelectorAll('div[role="article"]');
          if (items.length >= limit || totalHeight >= scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 200);
        setTimeout(() => { clearInterval(timer); resolve(); }, 30000);
      });
    }, feedSelector, limit);

    await new Promise(r => setTimeout(r, 2000));

    // Process items with clicking for details
    const items = await page.$$('div[role="article"]');
    console.log(`[MAPS] Found ${items.length} items. Processing details...`);

    for (let i = 0; i < Math.min(items.length, limit); i++) {
        try {
            const currentItems = await page.$$('div[role="article"]');
            const item = currentItems[i];
            if (!item) continue;

            await item.scrollIntoView();
            await item.click();
            
            // Wait for details
            try {
                await page.waitForSelector('button[data-item-id^="phone"]', { timeout: 2000 });
            } catch (e) {
                await new Promise(r => setTimeout(r, 1000));
            }

            const details = await page.evaluate(() => {
                const text = document.body.innerText;
                const lines = text.split('\n');
                const phoneRegex = /(\+\d{1,3}|0)\s?\d{2,3}\s?\d{3,4}\s?\d{3,4}/;
                const phoneMatch = text.match(phoneRegex);
                const phone = phoneMatch ? phoneMatch[0] : "";
                const name = document.querySelector('h1')?.innerText || "";
                return { name, phone };
            });

            // Fallback
            const listText = await item.evaluate(el => el.innerText);
            const listLines = listText.split('\n');
            const name = details.name || listLines[0] || "Unknown";
            const phone = details.phone || listLines.find(l => l.match(/(\+\d{1,3}|0)\s?\d{2,3}/)) || "";
            const category = listLines.find(l => l.includes("•"))?.split("•")[1]?.trim() || "Unknown";
            const address = listLines.find(l => l.includes("Av") || l.includes("Rua")) || "";

            leads.push({ name, phone, address, category });

            // Back to list
            const backButton = await page.$('button[aria-label="Back"]');
            if (backButton) {
                await backButton.click();
                await page.waitForSelector(feedSelector);
            }
        } catch (err) {
            console.error(`[MAPS] Error processing item ${i}:`, err);
        }
    }
    
    console.log(`[MAPS] Extracted ${leads.length} leads with details.`);

  } catch (err) {
    console.error("[MAPS] Scraping failed:", err);
  } finally {
    if (browser) await browser.close();
  }

  return leads;
}
