import { BrainCapabilityRegistryService } from './brain-capability-registry.service';

describe('BrainCapabilityRegistryService', () => {
  const svc = new BrainCapabilityRegistryService();

  it('list returns capabilities sorted alphabetically by name', () => {
    const items = svc.list();
    expect(items.length).toBeGreaterThan(0);
    const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name));
    expect(items.map((i) => i.name)).toEqual(sorted.map((i) => i.name));
  });

  it('every capability has the expected shape', () => {
    for (const cap of svc.list()) {
      expect(cap).toEqual(
        expect.objectContaining({
          name: expect.stringMatching(/.+/),
          description: expect.stringMatching(/.+/),
          domain: expect.stringMatching(/^(control|messaging|product|sales)$/),
        }),
      );
    }
  });

  it('grouped returns one bucket per domain and the union covers all capabilities', () => {
    const groups = svc.grouped();
    expect(Object.keys(groups).sort()).toEqual(['control', 'messaging', 'product', 'sales']);
    const total = Object.values(groups).reduce((acc, arr) => acc + arr.length, 0);
    expect(total).toBe(svc.list().length);
  });

  it('allowedFor returns a subset of all capability names', () => {
    const all = svc.list().map((c) => c.name);
    const allowed = svc.allowedFor('chat');
    for (const name of allowed) {
      expect(all).toContain(name);
    }
  });
});
