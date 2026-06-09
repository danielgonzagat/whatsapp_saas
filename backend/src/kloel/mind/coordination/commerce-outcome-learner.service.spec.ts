/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { Prisma } from '@prisma/client';
import { CommerceOutcomeLearnerService } from './commerce-outcome-learner.service';
import type { SpineEventEnvelope } from '../../spine/spine-event.types';

function envelope(overrides: Partial<SpineEventEnvelope> = {}): SpineEventEnvelope {
  return {
    eventId: 'evt-1',
    eventName: 'commerce.payment.approved',
    timestamp: '2026-05-29T00:00:00.000Z',
    occurredAt: '2026-05-29T00:00:00.000Z',
    workspaceId: 'ws-1',
    truthMode: 'observed',
    provenance: {
      source: 'production',
      processor: 'test',
      processorVersion: '1.0.0',
      schemaVersion: '1.0.0',
      environment: 'dev',
    },
    ...overrides,
  };
}

function mockBelief() {
  return { observeBinary: jest.fn().mockResolvedValue({ id: 'belief-1' }) };
}

function mockDecisionOutcome() {
  return { closeOutcome: jest.fn().mockResolvedValue(undefined) };
}

describe('CommerceOutcomeLearnerService', () => {
  it('feeds a commerce.payment.approved into observeBinary as a positive outcome (1)', async () => {
    const belief = mockBelief();
    const service = new CommerceOutcomeLearnerService(belief as never);

    await service.handle(envelope());

    expect(belief.observeBinary).toHaveBeenCalledTimes(1);
    expect(belief.observeBinary).toHaveBeenCalledWith(
      'ws-1',
      CommerceOutcomeLearnerService.COMMERCE_BELIEF_SUBJECT,
      'commerce.payment.approved',
      { eventName: 'commerce.payment.approved' },
      1,
    );
  });

  it('maps a negative terminal commerce event (refunded) to outcome 0', async () => {
    const belief = mockBelief();
    const service = new CommerceOutcomeLearnerService(belief as never);

    await service.handle(
      envelope({ eventId: 'evt-refund', eventName: 'commerce.payment.refunded' }),
    );

    expect(belief.observeBinary).toHaveBeenCalledWith(
      'ws-1',
      CommerceOutcomeLearnerService.COMMERCE_BELIEF_SUBJECT,
      'commerce.payment.refunded',
      { eventName: 'commerce.payment.refunded' },
      0,
    );
  });

  it('closes a matching open decision via closeOutcome when correlationId is present', async () => {
    const belief = mockBelief();
    const decision = mockDecisionOutcome();
    const service = new CommerceOutcomeLearnerService(belief as never, decision as never);

    await service.handle(envelope({ correlationId: 'outcome-key-42' }));

    expect(decision.closeOutcome).toHaveBeenCalledWith({
      outcomeKey: 'outcome-key-42',
      outcomeName: 'commerce.payment.approved',
      wonVsBaseline: true,
    });
  });

  it('does not call closeOutcome when there is no correlationId (no matching decision)', async () => {
    const belief = mockBelief();
    const decision = mockDecisionOutcome();
    const service = new CommerceOutcomeLearnerService(belief as never, decision as never);

    await service.handle(envelope());

    expect(decision.closeOutcome).not.toHaveBeenCalled();
    expect(belief.observeBinary).toHaveBeenCalledTimes(1);
  });

  it('is idempotent: a replayed eventId does not double-increment the Beta belief', async () => {
    const belief = mockBelief();
    const service = new CommerceOutcomeLearnerService(belief as never);

    const e = envelope({ eventId: 'evt-dup' });
    await service.handle(e);
    await service.handle(e);

    expect(belief.observeBinary).toHaveBeenCalledTimes(1);
  });

  it('skips neutral terminal commerce events (no binary learning signal)', async () => {
    const belief = mockBelief();
    const service = new CommerceOutcomeLearnerService(belief as never);

    await service.handle(
      envelope({
        eventId: 'evt-neutral',
        eventName: 'commerce.post_sale.satisfaction_signal_observed',
      }),
    );

    expect(belief.observeBinary).not.toHaveBeenCalled();
  });

  it('skips non-commerce and non-terminal events', async () => {
    const belief = mockBelief();
    const service = new CommerceOutcomeLearnerService(belief as never);

    await service.handle(envelope({ eventId: 'evt-chat', eventName: 'chat.replied' }));
    await service.handle(
      envelope({ eventId: 'evt-created', eventName: 'commerce.payment.initiated' }),
    );

    expect(belief.observeBinary).not.toHaveBeenCalled();
  });

  it('skips events without a workspaceId', async () => {
    const belief = mockBelief();
    const service = new CommerceOutcomeLearnerService(belief as never);

    await service.handle(envelope({ eventId: 'evt-no-ws', workspaceId: undefined }));

    expect(belief.observeBinary).not.toHaveBeenCalled();
  });

  it('never throws when a learning call fails (fire-and-forget)', async () => {
    const belief = { observeBinary: jest.fn().mockRejectedValue(new Error('db down')) };
    const decision = {
      closeOutcome: jest.fn().mockRejectedValue(new Error('db down')),
    };
    const service = new CommerceOutcomeLearnerService(belief as never, decision as never);

    await expect(service.handle(envelope({ correlationId: 'k' }))).resolves.toBeUndefined();
  });

  it('uses the explicit envelope valence when present (overrides default map)', async () => {
    const belief = mockBelief();
    const service = new CommerceOutcomeLearnerService(belief as never);

    // approved defaults to positive; force-negative valence flips it to 0.
    await service.handle(envelope({ eventId: 'evt-forced', valence: 'negative' }));

    expect(belief.observeBinary).toHaveBeenCalledWith(
      'ws-1',
      CommerceOutcomeLearnerService.COMMERCE_BELIEF_SUBJECT,
      'commerce.payment.approved',
      { eventName: 'commerce.payment.approved' },
      0,
    );
  });

  describe('durable dedup (L2)', () => {
    function p2002(): Prisma.PrismaClientKnownRequestError {
      return new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
      });
    }

    it('writes a durable marker and learns on the first sighting', async () => {
      const belief = mockBelief();
      const create = jest.fn().mockResolvedValue({ id: 'mark-1' });
      const prisma = { mindOutboxEvent: { create } };
      const service = new CommerceOutcomeLearnerService(
        belief as never,
        undefined,
        undefined,
        prisma as never,
      );

      await service.handle(envelope());

      expect(create).toHaveBeenCalledTimes(1);
      expect(create.mock.calls[0][0].data.idempotencyKey).toBe('commerce-learn:evt-1');
      expect(belief.observeBinary).toHaveBeenCalledTimes(1);
    });

    it('skips learning when the durable marker already exists (restart/replay-safe)', async () => {
      const belief = mockBelief();
      // A fresh instance (empty L1) but the durable marker is already present →
      // create rejects with a unique violation → at-most-once holds.
      const create = jest.fn().mockRejectedValue(p2002());
      const prisma = { mindOutboxEvent: { create } };
      const service = new CommerceOutcomeLearnerService(
        belief as never,
        undefined,
        undefined,
        prisma as never,
      );

      await service.handle(envelope());

      expect(create).toHaveBeenCalledTimes(1);
      expect(belief.observeBinary).not.toHaveBeenCalled();
    });

    it('still learns (best-effort) when the marker write fails with a non-unique error', async () => {
      const belief = mockBelief();
      const create = jest.fn().mockRejectedValue(new Error('db down'));
      const prisma = { mindOutboxEvent: { create } };
      const service = new CommerceOutcomeLearnerService(
        belief as never,
        undefined,
        undefined,
        prisma as never,
      );

      await service.handle(envelope());

      expect(belief.observeBinary).toHaveBeenCalledTimes(1);
    });
  });
});
