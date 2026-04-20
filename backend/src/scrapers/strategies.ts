import { Injectable } from '@nestjs/common';

/** Scraper result shape. */
export interface ScraperResult {
  leads: unknown[];
  stats: { found: number; valid: number };
}

/** I scraper strategy shape. */
export interface IScraperStrategy {
  name: string;
  scrape(query: string, filters: Record<string, unknown>): Promise<ScraperResult>;
}

/** Google maps strategy. */
@Injectable()
export class GoogleMapsStrategy implements IScraperStrategy {
  name = 'GOOGLE_MAPS';
  scrape(query: string, filters: Record<string, unknown>): Promise<ScraperResult> {
    void query;
    void filters;
    // Existing logic adapted
    return Promise.resolve({ leads: [], stats: { found: 0, valid: 0 } });
  }
}

/** Linked in strategy. */
@Injectable()
export class LinkedInStrategy implements IScraperStrategy {
  name = 'LINKEDIN';
  scrape(query: string, filters: Record<string, unknown>): Promise<ScraperResult> {
    void query;
    void filters;
    // Mock for Top 1
    return Promise.resolve({ leads: [], stats: { found: 0, valid: 0 } });
  }
}

/** Instagram strategy. */
@Injectable()
export class InstagramStrategy implements IScraperStrategy {
  name = 'INSTAGRAM';
  scrape(query: string, filters: Record<string, unknown>): Promise<ScraperResult> {
    void query;
    void filters;
    // Mock for Top 1
    return Promise.resolve({ leads: [], stats: { found: 0, valid: 0 } });
  }
}
