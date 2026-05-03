import { Injectable, NotImplementedException } from '@nestjs/common';

/** Status de cada fonte de scraping. */
export type ScraperSourceStatus =
  | 'available'
  | 'available_direct'
  | 'available_worker'
  | 'unavailable';

/** Descreve o estado real de uma fonte de scraping. */
export interface ScraperSourceCapability {
  /** Nome registrado da estrategia. */
  name: string;
  /** Se a fonte pode ser usada via esta chamada direta. */
  status: ScraperSourceStatus;
  /** Mensagem explicativa para o usuario/UI. */
  message: string;
}

/** Resultado de scrape — pode ser sucesso com leads, ou estado honesto. */
export interface ScraperResult {
  leads: unknown[];
  stats: { found: number; valid: number };
}

/** Estrategia de scraping com autodescricao de capacidade. */
export interface IScraperStrategy {
  name: string;
  capability(): ScraperSourceCapability;
  scrape(query: string, filters: Record<string, unknown>): Promise<ScraperResult>;
}

const WORKER_MSG =
  'Real Google Maps scraper (Puppeteer) runs in the worker process. Use POST /scrapers/jobs to create a scraping job that the worker will process.';

/** Google Maps — scraper real roda no worker. */
@Injectable()
export class GoogleMapsStrategy implements IScraperStrategy {
  name = 'GOOGLE_MAPS';

  capability(): ScraperSourceCapability {
    return {
      name: this.name,
      status: 'available_worker',
      message: WORKER_MSG,
    };
  }

  scrape(_query: string, _filters: Record<string, unknown>): Promise<ScraperResult> {
    throw new NotImplementedException(WORKER_MSG);
  }
}

/** LinkedIn — nao implementado. */
@Injectable()
export class LinkedInStrategy implements IScraperStrategy {
  name = 'LINKEDIN';

  capability(): ScraperSourceCapability {
    return {
      name: this.name,
      status: 'unavailable',
      message:
        'LinkedIn scraping nao esta implementado. Use Google Maps ou Instagram via POST /scrapers/jobs.',
    };
  }

  scrape(_query: string, _filters: Record<string, unknown>): Promise<ScraperResult> {
    throw new NotImplementedException('LinkedIn scraping nao esta implementado.');
  }
}

/** Instagram — scraper real roda no worker. */
@Injectable()
export class InstagramStrategy implements IScraperStrategy {
  name = 'INSTAGRAM';

  capability(): ScraperSourceCapability {
    return {
      name: this.name,
      status: 'available_worker',
      message: 'Instagram scraper (Puppeteer) runs in the worker process. Use POST /scrapers/jobs.',
    };
  }

  scrape(_query: string, _filters: Record<string, unknown>): Promise<ScraperResult> {
    throw new NotImplementedException(
      'Instagram scraper (Puppeteer) runs in the worker process. Use POST /scrapers/jobs.',
    );
  }
}
