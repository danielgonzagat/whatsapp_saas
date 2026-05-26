import { DailyDashboardService } from './daily-dashboard.service';
import { SpineEmitterService } from '../spine/spine-emitter.service';
import { GoalFieldService } from '../goal-field/goal-field.service';
import { ValenceAggregatorService } from '../mind/valence-aggregator.service';
import { AttentionService } from '../mind/attention.service';
import type { SpineEventRef } from '../mind/mind.types';

const WKS = 'wks_demo';

function ev(over: Partial<SpineEventRef> = {}): SpineEventRef {
  return {
    eventId: over.eventId ?? `e_${Math.random().toString(36).slice(2, 8)}`,
    eventName: over.eventName ?? 'commerce.lead.replied',
    workspaceId: over.workspaceId ?? WKS,
    entityRef: over.entityRef ?? { entityType: 'lead', entityId: 'lead_1' },
    occurredAt: over.occurredAt ?? new Date(Date.now() - 1000 * 60).toISOString(),
    truthMode: over.truthMode ?? 'observed',
    ...(over.valence !== undefined ? { valence: over.valence } : {}),
    ...(over.payload !== undefined ? { payload: over.payload } : {}),
    ...(over.correlationId !== undefined ? { correlationId: over.correlationId } : {}),
  };
}

function recentIso(offsetMinutes = 0): string {
  return new Date(Date.now() - offsetMinutes * 60 * 1000).toISOString();
}

async function buildSvc(
  initialEvents: readonly SpineEventRef[] = [],
): Promise<DailyDashboardService> {
  const spine = new SpineEmitterService(undefined, { ringCapacity: 1000 });

  for (const e of initialEvents) {
    await spine.emit({
      eventName: e.eventName,
      workspaceId: e.workspaceId,
      entityRef: e.entityRef,
      truthMode: e.truthMode,
      provenance: {
        source: 'production',
        processor: 'test',
        processorVersion: '0.0.0',
        schemaVersion: '1.0.0',
      },
      valence: e.valence,
      payload: e.payload,
      correlationId: e.correlationId,
      occurredAt: e.occurredAt,
    });
  }

  const goalField = new GoalFieldService();
  const valenceAggregator = new ValenceAggregatorService();
  const attention = new AttentionService();

  return new DailyDashboardService(spine, goalField, valenceAggregator, attention);
}

describe('DailyDashboardService contract (UTP-R6)', () => {
  it('filters events by 24h window', async () => {
    const oldTime = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const svc = await buildSvc([
      ev({
        eventName: 'commerce.cart.abandoned',
        entityRef: { entityType: 'cart', entityId: 'cart_old' },
        occurredAt: oldTime,
      }),
    ]);
    const d = await svc.generate(WKS);
    expect(d.abandonedCarts).toBe(0);
  });

  it('handles many events across multiple leads', async () => {
    const many: SpineEventRef[] = [];
    for (let i = 0; i < 20; i++) {
      many.push(
        ev({
          eventName: 'commerce.lead.contacted',
          entityRef: { entityType: 'lead', entityId: `lead_${i}` },
          occurredAt: recentIso(i * 2),
        }),
      );
    }
    for (let i = 0; i < 5; i++) {
      many.push(
        ev({
          eventName: 'commerce.cart.abandoned',
          entityRef: { entityType: 'cart', entityId: `cart_${i}` },
          occurredAt: recentIso(i),
        }),
      );
    }
    const svc = await buildSvc(many);
    const d = await svc.generate(WKS);
    expect(d.leadsAwaitingFollowup).toBe(20);
    expect(d.abandonedCarts).toBe(5);
    expect(d.generatedAt).toBeTruthy();
    expect(d.workspaceId).toBe(WKS);
  });

  it('returns empty suggested actions when no activity', async () => {
    const svc = await buildSvc([]);
    const d = await svc.generate(WKS);
    expect(d.suggestedActions).toHaveLength(0);
    expect(d.commercialMood.neutral).toBe(1);
  });
});
