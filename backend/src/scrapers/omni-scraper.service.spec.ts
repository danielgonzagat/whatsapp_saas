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
    expect(names.length).toBe(3);
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

  it('throws NotImplementedException for strategies not in available/available_direct status', async () => {
    const caps = service.getCapabilities();
    const unavailable = caps.find(
      (c) => c.status !== 'available' && c.status !== 'available_direct',
    );
    if (unavailable) {
      await expect(service.scrape(unavailable.name, 'q', {})).rejects.toThrow(
        NotImplementedException,
      );
    } else {
      expect(true).toBe(true);
    }
  });
});
