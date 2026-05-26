import {
  GoogleMapsStrategy,
  InstagramStrategy,
  IScraperStrategy,
  LinkedInStrategy,
  ScraperSourceCapability,
  ScraperResult,
} from './strategies';

describe('strategies', () => {
  describe('GoogleMapsStrategy', () => {
    let strategy: IScraperStrategy;

    beforeEach(() => {
      strategy = new GoogleMapsStrategy();
    });

    it('has name GOOGLE_MAPS', () => {
      expect(strategy.name).toBe('GOOGLE_MAPS');
    });

    it('capability reports available_worker', () => {
      const cap: ScraperSourceCapability = strategy.capability();
      expect(cap.name).toBe('GOOGLE_MAPS');
      expect(cap.status).toBe('available_worker');
      expect(cap.message).toContain('worker');
    });

    it('scrape returns unavailable result (real scraper in worker)', async () => {
      const result: ScraperResult = await strategy.scrape('restaurants', {});
      expect(result.unavailable).toBe(true);
      expect(result.leads).toEqual([]);
      expect(result.reason).toBeTruthy();
    });
  });

  describe('InstagramStrategy', () => {
    let strategy: IScraperStrategy;

    beforeEach(() => {
      strategy = new InstagramStrategy();
    });

    it('has name INSTAGRAM', () => {
      expect(strategy.name).toBe('INSTAGRAM');
    });

    it('capability reports available_worker', () => {
      const cap: ScraperSourceCapability = strategy.capability();
      expect(cap.name).toBe('INSTAGRAM');
      expect(cap.status).toBe('available_worker');
      expect(cap.message).toContain('worker');
    });

    it('scrape returns unavailable result (real scraper in worker)', async () => {
      const result: ScraperResult = await strategy.scrape('fitness', {});
      expect(result.unavailable).toBe(true);
      expect(result.leads).toEqual([]);
      expect(result.reason).toBeTruthy();
    });
  });

  describe('LinkedInStrategy', () => {
    let strategy: IScraperStrategy;

    beforeEach(() => {
      strategy = new LinkedInStrategy();
    });

    it('has name LINKEDIN', () => {
      expect(strategy.name).toBe('LINKEDIN');
    });

    it('capability reports unavailable', () => {
      const cap: ScraperSourceCapability = strategy.capability();
      expect(cap.name).toBe('LINKEDIN');
      expect(cap.status).toBe('unavailable');
    });

    it('scrape returns unavailable result', async () => {
      const result: ScraperResult = await strategy.scrape('engineers', {});
      expect(result.unavailable).toBe(true);
      expect(result.leads).toEqual([]);
      expect(result.reason).toBeTruthy();
    });
  });

  describe('strategy contract', () => {
    const strategies: IScraperStrategy[] = [
      new GoogleMapsStrategy(),
      new LinkedInStrategy(),
      new InstagramStrategy(),
    ];

    it.each(strategies)('$name implements IScraperStrategy correctly', (strategy) => {
      expect(strategy).toHaveProperty('name');
      expect(typeof strategy.name).toBe('string');
      expect(typeof strategy.scrape).toBe('function');
      expect(typeof strategy.capability).toBe('function');

      const cap = strategy.capability();
      expect(cap).toHaveProperty('name');
      expect(cap).toHaveProperty('status');
      expect(cap).toHaveProperty('message');
      expect(['available', 'available_direct', 'available_worker', 'unavailable']).toContain(
        cap.status,
      );
    });
  });
});
