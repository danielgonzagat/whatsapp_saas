import { ValenceTaggerService } from '../mind/valence-tagger.service';
import { SpineEmitterService } from '../spine/spine-emitter.service';
import type { SpineEventRef } from '../mind/mind.types';
import { ConcentrationDetector } from './concentration.detector';
import { HealthMonitor } from './health.monitor';
import { BanRiskDetector } from './ban-risk.detector';
import { PolicyChangeWatcher } from './policy-change.watcher';
import { ContingencyPlanBuilder } from './contingency-plan.builder';
import { OwnedAudiencePusher } from './owned-audience.pusher';
import { MigrationOrchestrator } from './migration.orchestrator';
import { DiversificationRecommender } from './diversification.recommender';
import type { DetectionInput } from './types';

function makeEvent(
  eventName: string,
  workspaceId: string,
  occurredAt: string,
  overrides: Partial<SpineEventRef> = {},
): SpineEventRef {
  let seq = (makeEvent as { _seq: number })._seq ?? 0;
  seq++;
  (makeEvent as { _seq: number })._seq = seq;
  return {
    eventId: `evt_${String(seq).padStart(5, '0')}`,
    eventName,
    workspaceId,
    occurredAt,
    truthMode: 'observed',
    ...overrides,
  };
}

function makeSpine(): SpineEmitterService {
  return new SpineEmitterService(new ValenceTaggerService());
}

function baseInput(events: SpineEventRef[], workspaceId: string, nowMs?: number): DetectionInput {
  return { events, workspaceId, nowMs: nowMs ?? Date.now() };
}

describe('CHANNEL-001 — Concentration Detector', () => {
  let svc: ConcentrationDetector;

  beforeEach(() => {
    svc = new ConcentrationDetector();
  });

  test('returns low concentration with no events', () => {
    const result = svc.detect(baseInput([], 'wks_001'));
    expect(result.concentrationLevel).toBe('low');
    expect(result.primarySharePercent).toBe(0);
    expect(result.channels).toHaveLength(0);
    expect(result.herfindahlIndex).toBe(0);
  });

  test('detects high concentration when single channel dominates', () => {
    const now = Date.now();
    const events = Array.from({ length: 10 }, (_, i) =>
      makeEvent('commerce.payment.approved', 'wks_001', new Date(now - i * 86400000).toISOString(), {
        payload: { channel: 'whatsapp', amountCents: 1000 },
      }),
    );
    const result = svc.detect(baseInput(events, 'wks_001', now));
    expect(result.concentrationLevel).toBe('critical');
    expect(result.primaryChannel).toBe('whatsapp');
    expect(result.primarySharePercent).toBe(100);
  });

  test('detects moderate concentration with two channels', () => {
    const now = Date.now();
    const events = [
      makeEvent('commerce.payment.approved', 'wks_001', new Date(now - 10000).toISOString(), {
        payload: { channel: 'whatsapp', amountCents: 600 },
      }),
      makeEvent('commerce.payment.approved', 'wks_001', new Date(now - 20000).toISOString(), {
        payload: { channel: 'email', amountCents: 400 },
      }),
    ];
    const result = svc.detect(baseInput(events, 'wks_001', now));
    expect(result.concentrationLevel).toBe('high');
    expect(result.channels).toHaveLength(2);
  });

  test('ignores non-payment events', () => {
    const now = Date.now();
    const events = [
      makeEvent('commerce.lead.qualified', 'wks_001', new Date(now).toISOString(), {
        payload: { channel: 'whatsapp', amountCents: 5000 },
      }),
    ];
    const result = svc.detect(baseInput(events, 'wks_001', now));
    expect(result.channels).toHaveLength(0);
  });
});

describe('CHANNEL-002 — Health Monitor', () => {
  let svc: HealthMonitor;

  beforeEach(() => {
    svc = new HealthMonitor();
  });

  test('returns healthy with no events', () => {
    const result = svc.assess(baseInput([], 'wks_001'), 'whatsapp');
    expect(result.status).toBe('healthy');
    expect(result.deliveryRate).toBe(1);
    expect(result.errorRate).toBe(0);
  });

  test('returns degraded when delivery rate is low', () => {
    const now = Date.now();
    const events = [
      makeEvent('commerce.whatsapp.sent', 'wks_001', new Date(now - 10000).toISOString(), {
        payload: { channel: 'whatsapp', status: 'sent' },
      }),
      makeEvent('commerce.whatsapp.sent', 'wks_001', new Date(now - 20000).toISOString(), {
        payload: { channel: 'whatsapp', status: 'sent' },
      }),
      makeEvent('commerce.whatsapp.sent', 'wks_001', new Date(now - 30000).toISOString(), {
        payload: { channel: 'whatsapp', status: 'sent' },
      }),
      makeEvent('commerce.whatsapp.failed', 'wks_001', new Date(now - 40000).toISOString(), {
        payload: { channel: 'whatsapp', error: 'blocked' },
      }),
    ];
    const result = svc.assess(baseInput(events, 'wks_001', now), 'whatsapp');
    expect(result.status).toBe('degraded');
  });

  test('returns down when channel has many errors', () => {
    const now = Date.now();
    const events = [
      makeEvent('commerce.whatsapp.sent', 'wks_001', new Date(now - 1000).toISOString(), {
        payload: { channel: 'whatsapp' },
      }),
      makeEvent('commerce.whatsapp.failed', 'wks_001', new Date(now - 2000).toISOString(), {
        payload: { channel: 'whatsapp', error: 'blocked' },
      }),
      makeEvent('commerce.whatsapp.failed', 'wks_001', new Date(now - 3000).toISOString(), {
        payload: { channel: 'whatsapp', error: 'timeout' },
      }),
      makeEvent('commerce.whatsapp.failed', 'wks_001', new Date(now - 4000).toISOString(), {
        payload: { channel: 'whatsapp', error: 'disconnected' },
      }),
    ];
    const result = svc.assess(baseInput(events, 'wks_001', now), 'whatsapp');
    expect(result.status).toBe('down');
  });
});

describe('CHANNEL-003 — Ban Risk Detector', () => {
  let svc: BanRiskDetector;

  beforeEach(() => {
    svc = new BanRiskDetector(makeSpine());
  });

  test('returns none risk with no events', () => {
    const result = svc.assess(baseInput([], 'wks_001'), 'whatsapp');
    expect(result.riskLevel).toBe('none');
    expect(result.riskProbability).toBe(0);
    expect(result.policyViolationCount).toBe(0);
  });

  test('detects elevated risk from policy violations', () => {
    const now = Date.now();
    const events = [
      makeEvent('commerce.whatsapp.policy_violation', 'wks_001', new Date(now - 1000).toISOString(), {
        payload: { channel: 'whatsapp' },
      }),
      makeEvent('commerce.whatsapp.restriction', 'wks_001', new Date(now - 2000).toISOString(), {
        payload: { channel: 'whatsapp' },
      }),
    ];
    const result = svc.assess(baseInput(events, 'wks_001', now), 'whatsapp');
    expect(result.riskLevel).toBe('moderate');
    expect(result.riskProbability).toBeGreaterThan(0.3);
    expect(result.policyViolationCount).toBeGreaterThanOrEqual(2);
  });

  test('detects burst activity as unusual', () => {
    const now = Date.now();
    const events = Array.from({ length: 150 }, (_, i) =>
      makeEvent('commerce.whatsapp.sent', 'wks_001', new Date(now - i * 10000).toISOString(), {
        payload: { channel: 'whatsapp' },
      }),
    );
    const result = svc.assess(baseInput(events, 'wks_001', now), 'whatsapp');
    expect(result.unusualActivityDetected).toBe(true);
  });
});

describe('CHANNEL-004 — Policy Change Watcher', () => {
  let svc: PolicyChangeWatcher;

  beforeEach(() => {
    svc = new PolicyChangeWatcher();
  });

  test('returns informational for minor changes', () => {
    const now = Date.now();
    const result = svc.assess(baseInput([], 'wks_001', now), 'whatsapp', 'API version update v2.1');
    expect(result.severity).toBe('minor');
    expect(result.requiresAction).toBe(false);
  });

  test('returns existential for ban keywords', () => {
    const now = Date.now();
    const result = svc.assess(baseInput([], 'wks_001', now), 'whatsapp', 'WhatsApp prohibits business notifications');
    expect(result.severity).toBe('existential');
    expect(result.requiresAction).toBe(true);
    expect(result.estimatedImpactPercent).toBe(100);
  });

  test('recommends autopilot pause when automation events exist', () => {
    const now = Date.now();
    const events = [
      makeEvent('commerce.campaign.sent', 'wks_001', new Date(now - 1000).toISOString(), {
        payload: { channel: 'whatsapp' },
      }),
    ];
    const result = svc.assess(baseInput(events, 'wks_001', now), 'whatsapp', 'WhatsApp restricts bulk messaging');
    expect(result.requiresAction).toBe(true);
    expect(result.affectedFeatures).toContain('autopilot_pause_recommended');
  });
});

describe('CHANNEL-005 — Contingency Plan Builder', () => {
  let svc: ContingencyPlanBuilder;

  beforeEach(() => {
    svc = new ContingencyPlanBuilder();
  });

  test('builds plan with ranked alternative channels', () => {
    const now = Date.now();
    const events = [
      makeEvent('commerce.whatsapp.sent', 'wks_001', new Date(now).toISOString(), {
        payload: { channel: 'whatsapp', contactId: 'c1', contactEmail: 'a@b.com' },
      }),
    ];
    const result = svc.build(baseInput(events, 'wks_001', now), 'whatsapp');
    expect(result.failingChannel).toBe('whatsapp');
    expect(result.targetChannels.length).toBeGreaterThan(0);
    expect(result.targetChannels).toContain('email');
    expect(result.steps.length).toBeGreaterThan(0);
  });

  test('marks ready when alternatives exist with migration data', () => {
    const now = Date.now();
    const events = Array.from({ length: 50 }, (_, i) =>
      makeEvent(`commerce.whatsapp.sent`, 'wks_001', new Date(now - i * 1000).toISOString(), {
        payload: {
          channel: 'whatsapp',
          contactId: `c${i}`,
          contactEmail: `user${i}@test.com`,
        },
      }),
    );
    const result = svc.build(baseInput(events, 'wks_001', now), 'whatsapp');
    expect(result.migrationReadiness).toBe('ready');
    expect(result.migrationablePercent).toBeGreaterThan(0);
  });
});

describe('CHANNEL-008 — Diversification Recommender', () => {
  let svc: DiversificationRecommender;

  beforeEach(() => {
    svc = new DiversificationRecommender();
  });

  test('recommends diversification on critical concentration', () => {
    const now = Date.now();
    const events = Array.from({ length: 100 }, (_, i) =>
      makeEvent('commerce.whatsapp.sent', 'wks_001', new Date(now - i * 60000).toISOString(), {
        payload: { channel: 'whatsapp', contactId: `c${i}` },
      }),
    );
    const result = svc.recommend(baseInput(events, 'wks_001', now));
    expect(result.currentConcentration).toBe('critical');
    expect(result.urgency).toBe('critical');
    expect(result.recommendedChannels.length).toBeGreaterThan(0);
  });

  test('returns low urgency with some channel diversity but gaps remain', () => {
    const now = Date.now();
    const channels: string[] = ['whatsapp', 'email', 'sms', 'push', 'instagram'];
    const events = channels.flatMap((ch) =>
      Array.from({ length: 20 }, (_, i) =>
        makeEvent(`commerce.campaign.sent`, 'wks_001', new Date(now - i * 60000).toISOString(), {
          payload: { channel: ch },
        }),
      ),
    );
    const result = svc.recommend(baseInput(events, 'wks_001', now));
    expect(result.urgency).toBe('low');
    expect(result.currentConcentration).toBe('low');
    expect(result.recommendedChannels.length).toBeGreaterThan(0);
  });
});
