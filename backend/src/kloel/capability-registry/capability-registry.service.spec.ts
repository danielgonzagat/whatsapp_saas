import { CapabilityRegistryService } from './capability-registry.service';
import { PromoteCriteria } from './capability-registry.types';

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

  describe('register initializes auditTrail', () => {
    it('initializes auditTrail as empty array on registration', () => {
      const rec = svc.register('cap_x');
      expect(rec.auditTrail).toEqual([]);
    });
  });

  describe('promote', () => {
    const crit: PromoteCriteria = {
      consecutivePulseGreenCycles: 5,
      runtimeEvidencePct: 20,
      rCriterionThresholdReached: true,
    };

    it('promotes from developing to operational when criteria are met', () => {
      svc.register('cap_x');
      const rec = svc.promote('cap_x', {
        consecutivePulseGreenCycles: 3,
        runtimeEvidencePct: 1,
      });
      expect(rec.maturity).toBe('operational');
      expect(rec.auditTrail).toHaveLength(1);
      expect(rec.auditTrail[0].action).toBe('promoted');
      expect(rec.auditTrail[0].from).toBe('developing');
      expect(rec.auditTrail[0].to).toBe('operational');
    });

    it('does not promote from developing when PULSE cycles are below minimum', () => {
      svc.register('cap_x');
      const rec = svc.promote('cap_x', {
        consecutivePulseGreenCycles: 2,
        runtimeEvidencePct: 10,
      });
      expect(rec.maturity).toBe('developing');
      expect(rec.auditTrail).toHaveLength(0);
    });

    it('does not promote from developing when runtime evidence is zero', () => {
      svc.register('cap_x');
      const rec = svc.promote('cap_x', {
        consecutivePulseGreenCycles: 3,
        runtimeEvidencePct: 0,
      });
      expect(rec.maturity).toBe('developing');
      expect(rec.auditTrail).toHaveLength(0);
    });

    it('promotes from developing with exactly 3 PULSE cycles (boundary minimum)', () => {
      svc.register('cap_x');
      const rec = svc.promote('cap_x', {
        consecutivePulseGreenCycles: 3,
        runtimeEvidencePct: 1,
      });
      expect(rec.maturity).toBe('operational');
    });

    it('promotes from developing with exactly 1 evidence point (boundary > 0)', () => {
      svc.register('cap_x');
      const rec = svc.promote('cap_x', {
        consecutivePulseGreenCycles: 5,
        runtimeEvidencePct: 1,
      });
      expect(rec.maturity).toBe('operational');
    });

    it('promotes from operational to productionReady when R-criterion threshold and non-regressive cycles are met', () => {
      svc.register('cap_x');
      svc.promote('cap_x', {
        consecutivePulseGreenCycles: 3,
        runtimeEvidencePct: 1,
      });

      for (let i = 0; i < 10; i += 1) {
        svc.recordInvocation('cap_x', 'success');
      }

      const rec = svc.promote('cap_x', {
        consecutivePulseGreenCycles: 3,
        runtimeEvidencePct: 50,
        rCriterionThresholdReached: true,
      });
      expect(rec.maturity).toBe('productionReady');
      expect(rec.auditTrail).toHaveLength(2);
      expect(rec.auditTrail[1].action).toBe('promoted');
      expect(rec.auditTrail[1].from).toBe('operational');
      expect(rec.auditTrail[1].to).toBe('productionReady');
    });

    it('does not promote from operational when R-criterion threshold is not reached', () => {
      svc.register('cap_x');
      svc.promote('cap_x', {
        consecutivePulseGreenCycles: 3,
        runtimeEvidencePct: 1,
      });

      const rec = svc.promote('cap_x', {
        consecutivePulseGreenCycles: 5,
        runtimeEvidencePct: 50,
        rCriterionThresholdReached: false,
      });
      expect(rec.maturity).toBe('operational');
    });

    it('does not promote from operational when consecutive failures exist', () => {
      svc.register('cap_x');
      svc.promote('cap_x', {
        consecutivePulseGreenCycles: 3,
        runtimeEvidencePct: 1,
      });

      svc.recordInvocation('cap_x', 'failure');
      svc.recordInvocation('cap_x', 'failure');
      svc.recordInvocation('cap_x', 'failure');

      const rec = svc.promote('cap_x', {
        consecutivePulseGreenCycles: 5,
        runtimeEvidencePct: 50,
        rCriterionThresholdReached: true,
      });
      expect(rec.maturity).toBe('operational');
      expect(rec.auditTrail).toHaveLength(1);
    });

    it('does not promote from operational when PULSE cycles are below non-regressive minimum', () => {
      svc.register('cap_x');
      svc.promote('cap_x', {
        consecutivePulseGreenCycles: 3,
        runtimeEvidencePct: 1,
      });

      svc.recordInvocation('cap_x', 'success');

      const rec = svc.promote('cap_x', {
        consecutivePulseGreenCycles: 2,
        runtimeEvidencePct: 50,
        rCriterionThresholdReached: true,
      });
      expect(rec.maturity).toBe('operational');
    });

    it('promotes from operational with exactly 3 non-regressive PULSE cycles (boundary)', () => {
      svc.register('cap_x');
      svc.promote('cap_x', {
        consecutivePulseGreenCycles: 3,
        runtimeEvidencePct: 1,
      });

      svc.recordInvocation('cap_x', 'success');

      const rec = svc.promote('cap_x', {
        consecutivePulseGreenCycles: 3,
        runtimeEvidencePct: 50,
        rCriterionThresholdReached: true,
      });
      expect(rec.maturity).toBe('productionReady');
    });

    it('is no-op when capability is already productionReady', () => {
      svc.register('cap_x');
      svc.promote('cap_x', {
        consecutivePulseGreenCycles: 3,
        runtimeEvidencePct: 1,
      });
      svc.recordInvocation('cap_x', 'success');
      svc.promote('cap_x', {
        consecutivePulseGreenCycles: 3,
        runtimeEvidencePct: 50,
        rCriterionThresholdReached: true,
      });
      const auditLength = svc.get('cap_x').auditTrail.length;

      const rec = svc.promote('cap_x', {
        consecutivePulseGreenCycles: 10,
        runtimeEvidencePct: 99,
        rCriterionThresholdReached: true,
      });
      expect(rec.maturity).toBe('productionReady');
      expect(rec.auditTrail).toHaveLength(auditLength);
    });

    it('throws when promoting unregistered capability', () => {
      expect(() => svc.promote('unknown', crit)).toThrow('Capability "unknown" not registered');
    });

    it('audit entry for promotion does not contain a reason', () => {
      svc.register('cap_x');
      svc.promote('cap_x', {
        consecutivePulseGreenCycles: 3,
        runtimeEvidencePct: 1,
      });
      expect(svc.get('cap_x').auditTrail[0].reason).toBeUndefined();
    });
  });

  describe('demote', () => {
    it('demotes from productionReady to operational', () => {
      svc.register('cap_x');
      svc.promote('cap_x', {
        consecutivePulseGreenCycles: 3,
        runtimeEvidencePct: 1,
      });
      svc.recordInvocation('cap_x', 'success');
      svc.promote('cap_x', {
        consecutivePulseGreenCycles: 3,
        runtimeEvidencePct: 50,
        rCriterionThresholdReached: true,
      });

      const rec = svc.demote('cap_x', 'rCriterion regression detected');
      expect(rec.maturity).toBe('operational');
      const trail = rec.auditTrail;
      const last = trail[trail.length - 1];
      expect(last.action).toBe('demoted');
      expect(last.from).toBe('productionReady');
      expect(last.to).toBe('operational');
      expect(last.reason).toBe('rCriterion regression detected');
    });

    it('demotes from operational to developing', () => {
      svc.register('cap_x');
      svc.promote('cap_x', {
        consecutivePulseGreenCycles: 3,
        runtimeEvidencePct: 1,
      });

      const rec = svc.demote('cap_x', 'PULSE gate failures');
      expect(rec.maturity).toBe('developing');
      const trail = rec.auditTrail;
      const last = trail[trail.length - 1];
      expect(last.action).toBe('demoted');
      expect(last.from).toBe('operational');
      expect(last.to).toBe('developing');
      expect(last.reason).toBe('PULSE gate failures');
    });

    it('stays at developing but records audit entry with reason', () => {
      svc.register('cap_x');

      const rec = svc.demote('cap_x', 'consistent gate failures');
      expect(rec.maturity).toBe('developing');
      expect(rec.auditTrail).toHaveLength(1);
      expect(rec.auditTrail[0].action).toBe('demoted');
      expect(rec.auditTrail[0].from).toBe('developing');
      expect(rec.auditTrail[0].to).toBe('developing');
      expect(rec.auditTrail[0].reason).toBe('consistent gate failures');
    });

    it('throws when demoting unregistered capability', () => {
      expect(() => svc.demote('unknown', 'reason')).toThrow(
        'Capability "unknown" not registered',
      );
    });
  });

  describe('audit trail', () => {
    it('accumulates entries across promote and demote sequence', () => {
      svc.register('cap_x');
      svc.promote('cap_x', {
        consecutivePulseGreenCycles: 3,
        runtimeEvidencePct: 1,
      });
      svc.recordInvocation('cap_x', 'success');
      svc.promote('cap_x', {
        consecutivePulseGreenCycles: 3,
        runtimeEvidencePct: 50,
        rCriterionThresholdReached: true,
      });
      svc.demote('cap_x', 'gate regression');
      svc.demote('cap_x', 'further degradation');

      const trail = svc.get('cap_x').auditTrail;
      expect(trail).toHaveLength(4);
      expect(trail[0].action).toBe('promoted');
      expect(trail[1].action).toBe('promoted');
      expect(trail[2].action).toBe('demoted');
      expect(trail[3].action).toBe('demoted');
    });

    it('audit trail timestamps are ISO 8601 dates', () => {
      svc.register('cap_x');
      svc.promote('cap_x', {
        consecutivePulseGreenCycles: 3,
        runtimeEvidencePct: 1,
      });

      const ts = svc.get('cap_x').auditTrail[0].timestamp;
      expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('snapshot includes independent copies of audit trail entries', () => {
      svc.register('cap_x');
      svc.promote('cap_x', {
        consecutivePulseGreenCycles: 3,
        runtimeEvidencePct: 1,
      });

      const snap = svc.snapshot();
      expect(snap.records[0].auditTrail).toHaveLength(1);
      expect(snap.records[0].auditTrail[0].action).toBe('promoted');

      svc.demote('cap_x', 'test');

      expect(snap.records[0].auditTrail).toHaveLength(1);
    });
  });

  describe('full lifecycle', () => {
    it('walks through developing -> operational -> productionReady -> demoted with complete audit trail', () => {
      svc.register('lifecycle_cap');

      expect(svc.get('lifecycle_cap').maturity).toBe('developing');

      svc.promote('lifecycle_cap', {
        consecutivePulseGreenCycles: 3,
        runtimeEvidencePct: 1,
      });
      expect(svc.get('lifecycle_cap').maturity).toBe('operational');

      svc.recordInvocation('lifecycle_cap', 'success');
      svc.recordInvocation('lifecycle_cap', 'success');

      svc.promote('lifecycle_cap', {
        consecutivePulseGreenCycles: 3,
        runtimeEvidencePct: 50,
        rCriterionThresholdReached: true,
      });
      expect(svc.get('lifecycle_cap').maturity).toBe('productionReady');

      svc.demote('lifecycle_cap', 'R-criterion dropped below threshold');
      expect(svc.get('lifecycle_cap').maturity).toBe('operational');

      const trail = svc.get('lifecycle_cap').auditTrail;
      expect(trail).toHaveLength(3);
      expect(trail[0].from).toBe('developing');
      expect(trail[0].to).toBe('operational');
      expect(trail[0].action).toBe('promoted');
      expect(trail[1].from).toBe('operational');
      expect(trail[1].to).toBe('productionReady');
      expect(trail[1].action).toBe('promoted');
      expect(trail[2].from).toBe('productionReady');
      expect(trail[2].to).toBe('operational');
      expect(trail[2].action).toBe('demoted');
      expect(trail[2].reason).toBe('R-criterion dropped below threshold');
    });
  });
});
