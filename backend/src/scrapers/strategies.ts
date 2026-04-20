import { Injectable } from '@nestjs/common';

/** Scraper result shape. */
export interface ScraperResult {
  /** Leads property. */
  leads: unknown[];
  /** Stats property. */
  stats: { found: number; valid: number };
}

/** I scraper strategy shape. */
export interface IScraperStrategy {
  /** Name property. */
  name: string;
  /** Scrape. */
  scrape(query: string, filters: Record<string, unknown>): Promise<ScraperResult>;
}

/** Google maps strategy. */
@Injectable()
export class GoogleMapsStrategy implements IScraperStrategy {
  /** Name property. */
  name = 'GOOGLE_MAPS';
  /** Scrape. */
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
  /** Name property. */
  name = 'LINKEDIN';
  /** Scrape. */
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
  /** Name property. */
  name = 'INSTAGRAM';
  /** Scrape. */
  scrape(query: string, filters: Record<string, unknown>): Promise<ScraperResult> {
    void query;
    void filters;
    // Mock for Top 1
    return Promise.resolve({ leads: [], stats: { found: 0, valid: 0 } });
  }
}
