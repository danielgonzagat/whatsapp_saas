import { Injectable, Logger } from '@nestjs/common';
import {
  GoogleMapsStrategy,
  InstagramStrategy,
  IScraperStrategy,
  LinkedInStrategy,
  ScraperSourceCapability,
} from './strategies';

/** Omni scraper service — registry de estrategias com diagnostico de capacidade. */
@Injectable()
export class OmniScraperService {
  private strategies: Map<string, IScraperStrategy> = new Map();
  private readonly logger = new Logger(OmniScraperService.name);

  constructor() {
    this.register(new GoogleMapsStrategy());
    this.register(new LinkedInStrategy());
    this.register(new InstagramStrategy());
  }

  private register(strategy: IScraperStrategy) {
    this.strategies.set(strategy.name, strategy);
  }

  /** Lista todas as fontes com seu status real de disponibilidade. */
  getCapabilities(): ScraperSourceCapability[] {
    return Array.from(this.strategies.values()).map((s) => s.capability());
  }

  /** Scrape — lanca NotImplementedException para estrategias que rodam no worker. */
  async scrape(source: string, query: string, filters: Record<string, unknown>) {
    const strategy = this.strategies.get(source);
    if (!strategy) {
      throw new Error(`Strategy ${source} not implemented`);
    }

    this.logger.log(`Starting scrape for ${source}: ${query}`);
    return strategy.scrape(query, filters);
  }
}
