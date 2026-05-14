import { CapabilityRegistryService } from './capability-registry.service';

describe('CapabilityRegistryService', () => {
  let svc: CapabilityRegistryService;

  beforeEach(() => {
    svc = new CapabilityRegistryService();
  });

  describe('register', () => {
    it('registers a new capability at developing maturity with zero evidence', () => {
      const rec = svc.register('capability_x');
      expect(rec.id).toBe('capability_x');
      expect(rec.maturity).toBe('developing');
      expect(rec.runtimeEvidencePct).toBe(0);
      expect(rec.invokeCount).toBe(0);
      expect(rec.successCount).toBe(0);
      expect(rec.failureCount).toBe(0);
    });

    it('returns the existing record when registering twice (idempotent)', () => {
      const a = svc.register('capability_x');
      svc.recordInvocation('capability_x', 'success');
      const b = svc.register('capability_x');
      expect(b).toBe(a);
      expect(b.successCount).toBe(1);
    });

    it('registers multiple distinct capabilities independently', () => {
      svc.register('cap_a');
      svc.register('cap_b');
      svc.register('cap_c');
      expect(svc.has('cap_a')).toBe(true);
      expect(svc.has('cap_b')).toBe(true);
      expect(svc.has('cap_c')).toBe(true);
      expect(svc.size()).toBe(3);
    });
  });

  describe('recordInvocation', () => {
    it('increments invokeCount and updates lastInvokedAt on success', () => {
      svc.register('cap_x');
      const rec = svc.recordInvocation('cap_x', 'success');
      expect(rec.invokeCount).toBe(1);
      expect(rec.successCount).toBe(1);
      expect(rec.failureCount).toBe(0);
      expect(rec.lastInvokedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('increments invokeCount and counts failure', () => {
      svc.register('cap_x');
      const rec = svc.recordInvocation('cap_x', 'failure');
      expect(rec.invokeCount).toBe(1);
      expect(rec.successCount).toBe(0);
      expect(rec.failureCount).toBe(1);
    });

    it('computes runtimeEvidencePct as min(100, successCount + 0.5 * failureCount)', () => {
      svc.register('cap_x');
      svc.recordInvocation('cap_x', 'success');
      svc.recordInvocation('cap_x', 'success');
      svc.recordInvocation('cap_x', 'failure');
      const rec = svc.recordInvocation('cap_x', 'failure');
      expect(rec.runtimeEvidencePct).toBe(3);
    });

    it('caps runtimeEvidencePct at 100 even with many successes', () => {
      svc.register('cap_x');
      for (let i = 0; i < 200; i += 1) {
        svc.recordInvocation('cap_x', 'success');
      }
      const rec = svc.get('cap_x');
      expect(rec.runtimeEvidencePct).toBe(100);
    });

    it('throws when recording invocation for unregistered capability', () => {
      expect(() => svc.recordInvocation('unknown', 'success')).toThrow(
        'Capability "unknown" not registered',
      );
    });

    it('resets consecutiveFailures on success', () => {
      svc.register('cap_x');
      svc.recordInvocation('cap_x', 'failure');
      svc.recordInvocation('cap_x', 'failure');
      expect(svc.get('cap_x').consecutiveFailures).toBe(2);
      svc.recordInvocation('cap_x', 'success');
      expect(svc.get('cap_x').consecutiveFailures).toBe(0);
    });
  });

  describe('promoteIfReady', () => {
    it('promotes from developing to operational when evidence >= 5', () => {
      svc.register('cap_x');
      for (let i = 0; i < 5; i += 1) {
        svc.recordInvocation('cap_x', 'success');
      }
      const rec = svc.promoteIfReady('cap_x');
      expect(rec.maturity).toBe('operational');
    });

    it('does not promote from developing if evidence < 5', () => {
      svc.register('cap_x');
      svc.recordInvocation('cap_x', 'success');
      svc.recordInvocation('cap_x', 'success');
      svc.recordInvocation('cap_x', 'success');
      svc.recordInvocation('cap_x', 'success');
      const rec = svc.promoteIfReady('cap_x');
      expect(rec.maturity).toBe('developing');
    });

    it('promotes from operational to productionReady when evidence >= 20 and no consecutive failures', () => {
      svc.register('cap_x');
      for (let i = 0; i < 20; i += 1) {
        svc.recordInvocation('cap_x', 'success');
      }
      svc.promoteIfReady('cap_x');
      expect(svc.get('cap_x').maturity).toBe('operational');

      for (let i = 0; i < 20; i += 1) {
        svc.recordInvocation('cap_x', 'success');
      }
      const rec = svc.promoteIfReady('cap_x');
      expect(rec.maturity).toBe('productionReady');
    });

    it('does not promote to productionReady if recent consecutive failures exist', () => {
      svc.register('cap_x');
      for (let i = 0; i < 5; i += 1) {
        svc.recordInvocation('cap_x', 'success');
      }
      svc.promoteIfReady('cap_x');
      expect(svc.get('cap_x').maturity).toBe('operational');

      for (let i = 0; i < 20; i += 1) {
        svc.recordInvocation('cap_x', 'success');
      }
      svc.recordInvocation('cap_x', 'failure');
      svc.recordInvocation('cap_x', 'failure');
      svc.recordInvocation('cap_x', 'failure');
      const rec = svc.promoteIfReady('cap_x');
      expect(rec.maturity).toBe('operational');
    });

    it('throws when promoting unregistered capability', () => {
      expect(() => svc.promoteIfReady('unknown')).toThrow('Capability "unknown" not registered');
    });
  });

  describe('snapshot', () => {
    it('returns empty records when nothing is registered', () => {
      const snap = svc.snapshot();
      expect(snap.records).toEqual([]);
      expect(snap.snapshotAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('returns all registered records in snapshot', () => {
      svc.register('cap_a');
      svc.register('cap_b');
      svc.recordInvocation('cap_a', 'success');
      const snap = svc.snapshot();
      expect(snap.records).toHaveLength(2);
      const ids = snap.records.map((r) => r.id).sort();
      expect(ids).toEqual(['cap_a', 'cap_b']);
    });

    it('snapshot is independent of mutations after return', () => {
      svc.register('cap_a');
      const snap = svc.snapshot();
      svc.recordInvocation('cap_a', 'success');
      expect(snap.records[0].successCount).toBe(0);
    });
  });

  describe('get and has', () => {
    it('has returns false for unregistered capability', () => {
      expect(svc.has('ghost')).toBe(false);
    });

    it('get throws for unregistered capability', () => {
      expect(() => svc.get('ghost')).toThrow('Capability "ghost" not registered');
    });

    it('get returns the mutable record after registration', () => {
      svc.register('cap_x');
      const rec = svc.get('cap_x');
      expect(rec.id).toBe('cap_x');
      expect(rec.maturity).toBe('developing');
    });
  });

  describe('size and clear', () => {
    it('size returns the number of registered capabilities', () => {
      expect(svc.size()).toBe(0);
      svc.register('a');
      svc.register('b');
      expect(svc.size()).toBe(2);
    });

    it('clear removes all registered capabilities', () => {
      svc.register('a');
      svc.register('b');
      svc.clear();
      expect(svc.size()).toBe(0);
      expect(svc.has('a')).toBe(false);
    });
  });
});
