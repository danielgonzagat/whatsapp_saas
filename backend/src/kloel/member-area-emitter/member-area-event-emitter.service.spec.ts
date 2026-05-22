import { ValenceTaggerService } from '../mind/valence-tagger.service';
import {
  MemberAreaEventEmitterService,
  EnrollmentContext,
  ProgressContext,
  DropoutContext,
  AffiliatePerformanceContext,
  AffiliateCommissionContext,
} from './member-area-event-emitter.service';
import { SpineEmitterService } from '../spine/spine-emitter.service';

function buildSpine(ringCapacity?: number): SpineEmitterService {
  return new SpineEmitterService(new ValenceTaggerService(), { ringCapacity });
}

function buildEmitter(ringCapacity?: number): {
  spine: SpineEmitterService;
  emitter: MemberAreaEventEmitterService;
} {
  const spine = buildSpine(ringCapacity);
  const emitter = new MemberAreaEventEmitterService(spine);
  return { spine, emitter };
}

describe('MemberAreaEventEmitterService', () => {
  function enrollmentContext(overrides?: Partial<EnrollmentContext>): EnrollmentContext {
    return {
      enrollmentId: 'enr_001',
      workspaceId: 'wks_test',
      memberAreaId: 'area_001',
      studentEmail: 'student@test.com',
      studentName: 'Test Student',
      ...overrides,
    };
  }

  function progressContext(overrides?: Partial<ProgressContext>): ProgressContext {
    return {
      enrollmentId: 'enr_001',
      workspaceId: 'wks_test',
      memberAreaId: 'area_001',
      studentEmail: 'student@test.com',
      progress: 50,
      totalLessons: 10,
      ...overrides,
    };
  }

  function dropoutContext(overrides?: Partial<DropoutContext>): DropoutContext {
    return {
      enrollmentId: 'enr_001',
      workspaceId: 'wks_test',
      memberAreaId: 'area_001',
      studentEmail: 'student@test.com',
      ...overrides,
    };
  }

  function affiliatePerfContext(overrides?: Partial<AffiliatePerformanceContext>): AffiliatePerformanceContext {
    return {
      workspaceId: 'wks_test',
      window: 'weekly',
      metrics: { totalSales: 5, totalCommission: 1200 },
      ...overrides,
    };
  }

  function affiliateCommContext(overrides?: Partial<AffiliateCommissionContext>): AffiliateCommissionContext {
    return {
      workspaceId: 'wks_test',
      affiliateLinkId: 'link_001',
      commissionCents: 500,
      grossCents: 5000,
      affiliateWorkspaceId: 'wks_aff',
      ...overrides,
    };
  }

  // --- Test 1: Each transition produces correct event on spine ---

  describe('enrolled transition', () => {
    it('produces event with correct eventName, workspaceId, entityRef, truthMode, provenance', () => {
      const { spine, emitter } = buildEmitter();
      const ctx = enrollmentContext({ correlationId: 'corr_enrolled' });
      emitter.emitEnrolled(ctx);

      const events = spine.recentEvents();
      expect(events).toHaveLength(1);
      const e = events[0]!;
      expect(e.eventName).toBe('commerce.member_area.enrolled');
      expect(e.workspaceId).toBe('wks_test');
      expect(e.entityRef).toEqual({ entityType: 'member_enrollment', entityId: 'enr_001' });
      expect(e.truthMode).toBe('observed');
      expect(e.provenance.source).toBe('production');
      expect(e.provenance.processor).toBe('member-area-event-emitter');
      expect(e.provenance.processorVersion).toBe('1.0.0');
      expect(e.provenance.schemaVersion).toBe('1.0.0');
      expect(e.correlationId).toBe('corr_enrolled');
      expect(e.valence).toBe('positive');
    });
  });

  describe('progressed transition', () => {
    it('produces event with correct eventName, workspaceId, entityRef, truthMode, provenance', () => {
      const { spine, emitter } = buildEmitter();
      const ctx = progressContext({ correlationId: 'corr_progress' });
      emitter.emitProgressed(ctx);

      const events = spine.recentEvents();
      expect(events).toHaveLength(1);
      const e = events[0]!;
      expect(e.eventName).toBe('commerce.member_area.progressed');
      expect(e.workspaceId).toBe('wks_test');
      expect(e.entityRef).toEqual({ entityType: 'member_enrollment', entityId: 'enr_001' });
      expect(e.truthMode).toBe('observed');
      expect(e.provenance.source).toBe('production');
      expect(e.provenance.processor).toBe('member-area-event-emitter');
      expect(e.correlationId).toBe('corr_progress');
      expect(e.valence).toBeUndefined();
      expect(e.payload).toMatchObject({ progress: 50, totalLessons: 10 });
    });
  });

  describe('dropped_out transition', () => {
    it('produces event with correct eventName, workspaceId, entityRef, truthMode, provenance', () => {
      const { spine, emitter } = buildEmitter();
      const ctx = dropoutContext({ correlationId: 'corr_drop' });
      emitter.emitDroppedOut(ctx);

      const events = spine.recentEvents();
      expect(events).toHaveLength(1);
      const e = events[0]!;
      expect(e.eventName).toBe('commerce.member_area.dropped_out');
      expect(e.workspaceId).toBe('wks_test');
      expect(e.entityRef).toEqual({ entityType: 'member_enrollment', entityId: 'enr_001' });
      expect(e.truthMode).toBe('observed');
      expect(e.provenance.source).toBe('production');
      expect(e.valence).toBe('negative');
      expect(e.correlationId).toBe('corr_drop');
    });
  });

  describe('affiliate.performance_measured transition', () => {
    it('produces event with correct eventName, workspaceId, truthMode, provenance', () => {
      const { spine, emitter } = buildEmitter();
      const ctx = affiliatePerfContext({ correlationId: 'corr_perf' });
      emitter.emitAffiliatePerformanceMeasured(ctx);

      const events = spine.recentEvents();
      expect(events).toHaveLength(1);
      const e = events[0]!;
      expect(e.eventName).toBe('commerce.affiliate.performance_measured');
      expect(e.workspaceId).toBe('wks_test');
      expect(e.truthMode).toBe('observed');
      expect(e.provenance.source).toBe('production');
      expect(e.valence).toBeUndefined();
      expect(e.correlationId).toBe('corr_perf');
      expect(e.payload).toMatchObject({ window: 'weekly', metrics: { totalSales: 5, totalCommission: 1200 } });
    });
  });

  describe('affiliate.commission_calculated transition', () => {
    it('produces event with correct eventName, workspaceId, entityRef, truthMode, provenance', () => {
      const { spine, emitter } = buildEmitter();
      const ctx = affiliateCommContext({ correlationId: 'corr_comm' });
      emitter.emitAffiliateCommissionCalculated(ctx);

      const events = spine.recentEvents();
      expect(events).toHaveLength(1);
      const e = events[0]!;
      expect(e.eventName).toBe('commerce.affiliate.commission_calculated');
      expect(e.workspaceId).toBe('wks_test');
      expect(e.entityRef).toEqual({ entityType: 'affiliate_link', entityId: 'link_001' });
      expect(e.truthMode).toBe('observed');
      expect(e.provenance.source).toBe('production');
      expect(e.valence).toBeUndefined();
      expect(e.correlationId).toBe('corr_comm');
      expect(e.payload).toMatchObject({ commissionCents: 500, grossCents: 5000, affiliateWorkspaceId: 'wks_aff' });
    });
  });

  // --- Test 2: Emitter does NOT throw when spine is full ---

  it('does not throw when ring buffer overflows oldest', () => {
    const { spine, emitter } = buildEmitter(64);
    for (let i = 0; i < 200; i += 1) {
      expect(() => {
        emitter.emitEnrolled(
          enrollmentContext({
            enrollmentId: `enr_${i}`,
            studentEmail: `student${i}@test.com`,
          }),
        );
      }).not.toThrow();
    }
    const events = spine.recentEvents();
    expect(events).toHaveLength(64);
  });

  // --- Test 3: Emitter does NOT throw when data is edge ---

  it('does not throw when context fields are empty strings', () => {
    const { emitter } = buildEmitter();
    expect(() => {
      emitter.emitEnrolled({
        enrollmentId: '',
        workspaceId: '',
        memberAreaId: '',
        studentEmail: '',
      });
    }).not.toThrow();
  });

  it('does not throw when progress is exactly 0', () => {
    const { emitter, spine } = buildEmitter();
    expect(() => {
      emitter.emitProgressed(
        progressContext({ progress: 0, totalLessons: 0 }),
      );
    }).not.toThrow();
    const events = spine.recentEvents();
    expect(events[0]?.payload).toMatchObject({ progress: 0, totalLessons: 0 });
  });

  it('does not throw when affiliate commissionCents is 0', () => {
    const { emitter } = buildEmitter();
    expect(() => {
      emitter.emitAffiliateCommissionCalculated(
        affiliateCommContext({ commissionCents: 0, grossCents: 0 }),
      );
    }).not.toThrow();
  });

  // --- Test 4: ValenceTaggerService tags terminal events ---

  it('auto-tags positive valence on enrolled event', () => {
    const { spine, emitter } = buildEmitter();
    emitter.emitEnrolled(enrollmentContext());
    const e = spine.recentEvents()[0]!;
    expect(e.valence).toBe('positive');
  });

  it('auto-tags negative valence on dropped_out event', () => {
    const { spine, emitter } = buildEmitter();
    emitter.emitDroppedOut(dropoutContext());
    const e = spine.recentEvents()[0]!;
    expect(e.valence).toBe('negative');
  });

  it('does not auto-tag valence on progressed event (non-terminal)', () => {
    const { spine, emitter } = buildEmitter();
    emitter.emitProgressed(progressContext());
    const e = spine.recentEvents()[0]!;
    expect(e.valence).toBeUndefined();
  });

  it('does not auto-tag valence on affiliate events (non-terminal)', () => {
    const { spine, emitter } = buildEmitter();
    emitter.emitAffiliatePerformanceMeasured(affiliatePerfContext());
    emitter.emitAffiliateCommissionCalculated(affiliateCommContext());
    const events = spine.recentEvents();
    expect(events[0]?.valence).toBeUndefined();
    expect(events[1]?.valence).toBeUndefined();
  });

  // --- Test 5: Distinct correlationIds produce distinct events ---

  it('produces two distinct events with different correlationIds', () => {
    const { spine, emitter } = buildEmitter();
    emitter.emitEnrolled(enrollmentContext({ correlationId: 'corr_a' }));
    emitter.emitEnrolled(
      enrollmentContext({
        enrollmentId: 'enr_002',
        studentEmail: 'other@test.com',
        correlationId: 'corr_b',
      }),
    );
    const events = spine.recentEvents();
    expect(events).toHaveLength(2);
    expect(events[0]!.correlationId).toBe('corr_a');
    expect(events[1]!.correlationId).toBe('corr_b');
    expect(events[0]!.eventId).not.toBe(events[1]!.eventId);
  });

  // --- Test 6: Provenance environment is set by spine ---

  it('stamps provenance environment field via spine', () => {
    const { spine, emitter } = buildEmitter();
    emitter.emitEnrolled(enrollmentContext());
    const e = spine.recentEvents()[0]!;
    expect(['dev', 'staging', 'prod']).toContain(e.provenance.environment);
    expect(e.provenance.source).toBe('production');
  });
});
