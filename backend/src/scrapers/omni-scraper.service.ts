import { Injectable, Logger } from '@nestjs/common';
import {
  IScraperStrategy,
  GoogleMapsStrategy,
  LinkedInStrategy,
  InstagramStrategy,
} from './strategies';

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

  async scrape(source: string, query: string, filters: any) {
    const strategy = this.strategies.get(source);
    if (!strategy) {
      throw new Error(`Strategy ${source} not implemented`);
    }

    this.logger.log(`Starting scrape for ${source}: ${query}`);
    return strategy.scrape(query, filters);
  }
}
