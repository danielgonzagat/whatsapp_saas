import {
  GoogleMapsStrategy,
  InstagramStrategy,
  IScraperStrategy,
  LinkedInStrategy,
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

    it('scrape returns empty leads and zero stats', async () => {
      const result: ScraperResult = await strategy.scrape('restaurants', {});

      expect(result.leads).toEqual([]);
      expect(result.stats).toEqual({ found: 0, valid: 0 });
    });

    it('ignores query and filters params', async () => {
      const r1 = await strategy.scrape('anything', { key: 'value' });
      const r2 = await strategy.scrape('different', { other: 42 });

      expect(r1).toEqual(r2);
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

    it('scrape returns empty leads and zero stats', async () => {
      const result: ScraperResult = await strategy.scrape('fitness', {});

      expect(result.leads).toEqual([]);
      expect(result.stats).toEqual({ found: 0, valid: 0 });
    });

    it('ignores query and filters params', async () => {
      const r1 = await strategy.scrape('fitness', { location: 'NYC' });
      const r2 = await strategy.scrape('yoga', {});

      expect(r1).toEqual(r2);
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

    it('scrape returns empty leads and zero stats', async () => {
      const result: ScraperResult = await strategy.scrape('engineers', {});

      expect(result.leads).toEqual([]);
      expect(result.stats).toEqual({ found: 0, valid: 0 });
    });

    it('ignores query and filters params', async () => {
      const r1 = await strategy.scrape('engineers', { industry: 'tech' });
      const r2 = await strategy.scrape('designers', {});

      expect(r1).toEqual(r2);
    });
  });

  describe('strategy contract', () => {
    const strategies: IScraperStrategy[] = [
      new GoogleMapsStrategy(),
      new LinkedInStrategy(),
      new InstagramStrategy(),
    ];

    it.each(strategies)('$name implements IScraperStrategy correctly', async (strategy) => {
      expect(strategy).toHaveProperty('name');
      expect(typeof strategy.name).toBe('string');
      expect(typeof strategy.scrape).toBe('function');

      const result = await strategy.scrape('test', {});
      expect(result).toHaveProperty('leads');
      expect(result).toHaveProperty('stats');
      expect(result.stats).toHaveProperty('found');
      expect(result.stats).toHaveProperty('valid');
      expect(Array.isArray(result.leads)).toBe(true);
      expect(typeof result.stats.found).toBe('number');
      expect(typeof result.stats.valid).toBe('number');
    });
  });
});
