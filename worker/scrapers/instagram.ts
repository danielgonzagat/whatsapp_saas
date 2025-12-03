import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser } from 'puppeteer';

puppeteer.use(StealthPlugin());

export interface ScrapedLead {
  name: string;
  phone: string;
  address: string;
  category: string;
  metadata?: any;
}

export async function scrapeInstagram(query: string, limit: number = 5): Promise<ScrapedLead[]> {
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
    
    await page.setViewport({ width: 375, height: 812, isMobile: true }); // Mobile view for IG

    // Search for the hashtag or user
    // Note: IG scraping without login is very limited. We try to access public tags or profiles.
    const searchUrl = `https://www.instagram.com/explore/tags/${encodeURIComponent(query.replace('#', ''))}/`;
    console.log(`[IG] Navigating to: ${searchUrl}`);
    
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    // Check for login wall
    try {
        await page.waitForSelector('input[name="username"]', { timeout: 5000 });
        console.warn("[IG] Login wall detected. Public scraping might be limited.");
        // If we have credentials, we could login here.
    } catch (e) {
        // No login wall immediately
    }

    // Try to find posts
    try {
        await page.waitForSelector('article a', { timeout: 10000 });
    } catch (e) {
        console.error("[IG] No posts found or blocked.");
        return [];
    }

    // Extract post links
    const postLinks = await page.evaluate((limit) => {
        const links = Array.from(document.querySelectorAll('article a'));
        return links.slice(0, limit).map(a => (a as HTMLAnchorElement).href);
    }, limit);

    console.log(`[IG] Found ${postLinks.length} posts. Analyzing profiles...`);

    for (const link of postLinks) {
        try {
            const newPage = await browser.newPage();
            await newPage.setUserAgent(randomUA);
            await newPage.goto(link, { waitUntil: 'networkidle2' });

            // Get username from post
            const username = await newPage.evaluate(() => {
                const header = document.querySelector('header');
                return header?.querySelector('a')?.innerText || "";
            });

            if (username) {
                // Go to profile
                await newPage.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'networkidle2' });
                
                // Extract Bio
                const bio = await newPage.evaluate(() => {
                    return document.querySelector('section > div:last-child > div > div > div > span')?.textContent || "";
                });

                // Extract external link (often Linktree or WhatsApp)
                const externalLink = await newPage.evaluate(() => {
                    return document.querySelector('header section a[href^="http"]')?.getAttribute('href') || "";
                });

                // Heuristic for phone in bio
                const phoneMatch = bio.match(/(\+\d{1,3}|0)\s?\d{2,3}\s?\d{3,4}\s?\d{3,4}/);
                const phone = phoneMatch ? phoneMatch[0] : "";

                if (phone || externalLink) {
                    leads.push({
                        name: `@${username}`,
                        phone: phone || "Check Link",
                        address: "Instagram",
                        category: "Influencer/Business",
                        metadata: { bio, externalLink }
                    });
                }
            }
            await newPage.close();
        } catch (err) {
            console.error(`[IG] Error processing post:`, err);
        }
    }

  } catch (err) {
    console.error("[IG] Scraping failed:", err);
  } finally {
    if (browser) await browser.close();
  }

  return leads;
}
