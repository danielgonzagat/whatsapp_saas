import { NotImplementedException } from '@nestjs/common';
import { OmniScraperService } from './omni-scraper.service';

describe('OmniScraperService', () => {
  let service: OmniScraperService;

  beforeEach(() => {
    service = new OmniScraperService();
  });

  it('registers three strategies on construction', () => {
    const caps = service.getCapabilities();
    expect(caps).toHaveLength(3);
    const names = caps.map((c) => c.name).sort();
    expect(names).toEqual(['GOOGLE_MAPS', 'INSTAGRAM', 'LINKEDIN']);
  });

  it('returns capability objects with a status field', () => {
    const caps = service.getCapabilities();
    for (const c of caps) {
      expect(typeof c.status).toBe('string');
      expect(typeof c.name).toBe('string');
    }
  });

  it('throws NotImplementedException for unknown source', async () => {
    await expect(service.scrape('unknown', 'q', {})).rejects.toThrow(
      NotImplementedException,
    );
  });

  it('throws NotImplementedException for worker-only and unavailable strategies', async () => {
    const caps = service.getCapabilities();
    const nonDirectCapabilities = caps.filter(
      (capability) =>
        capability.status !== 'available' && capability.status !== 'available_direct',
    );

    expect(nonDirectCapabilities.map((capability) => capability.name).sort()).toEqual([
      'GOOGLE_MAPS',
      'INSTAGRAM',
      'LINKEDIN',
    ]);

    for (const capability of nonDirectCapabilities) {
      await expect(service.scrape(capability.name, 'q', {})).rejects.toThrow(
        NotImplementedException,
      );
    }
  });
});
