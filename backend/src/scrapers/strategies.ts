import { Injectable } from '@nestjs/common';

export interface ScraperResult {
  leads: any[];
  stats: { found: number; valid: number };
}

export interface IScraperStrategy {
  name: string;
  scrape(query: string, filters: any): Promise<ScraperResult>;
}

@Injectable()
export class GoogleMapsStrategy implements IScraperStrategy {
  name = 'GOOGLE_MAPS';
  scrape(query: string, filters: any): Promise<ScraperResult> {
    void query;
    void filters;
    // Existing logic adapted
    return Promise.resolve({ leads: [], stats: { found: 0, valid: 0 } });
  }
}

@Injectable()
export class LinkedInStrategy implements IScraperStrategy {
  name = 'LINKEDIN';
  scrape(query: string, filters: any): Promise<ScraperResult> {
    void query;
    void filters;
    // Mock for Top 1
    return Promise.resolve({ leads: [], stats: { found: 0, valid: 0 } });
  }
}

@Injectable()
export class InstagramStrategy implements IScraperStrategy {
  name = 'INSTAGRAM';
  scrape(query: string, filters: any): Promise<ScraperResult> {
    void query;
    void filters;
    // Mock for Top 1
    return Promise.resolve({ leads: [], stats: { found: 0, valid: 0 } });
  }
}
