import { MindEventIngestor } from './mind-event-ingestor.service';
import { MindEventSpine } from './mind-event-spine.service';
import { HebbianService } from '../hebbian.service';
function makeClaimedEvent(
  overrides: Partial<{
    id: string;
    eventType: string;
    subject: string;
    occurredAt: Date;
  }> = {},
) {
  return {
    id: overrides.id ?? 'evt-1',
    eventType: overrides.eventType ?? 'cognition.decision_made',
    subject: overrides.subject ?? 'subj-1',
    payload: null,
    idempotencyKey: 'ik-1',
    occurredAt: overrides.occurredAt ?? new Date('2026-05-28T10:00:00.000Z'),
    attempts: 0,
    lastError: null,
  };
}
describe('MindEventIngestor', () => {
  let ingestor: MindEventIngestor;
  let spine: jest.Mocked<Pick<MindEventSpine, 'claimPendingEvents' | 'markDispatchSucceeded'>>;
  let hebbian: HebbianService;

  beforeEach(() => {
    hebbian = new HebbianService({ windowMs: 60_000 });
    spine = {
      claimPendingEvents: jest.fn(),
      markDispatchSucceeded: jest.fn(),
    };
    ingestor = new MindEventIngestor(spine as unknown as MindEventSpine, hebbian, {
      mindOutboxEvent: { findMany: jest.fn().mockResolvedValue([]) },
    } as never);
  });
  describe('processDecisions', () => {
    it('claims events, ingests into hebbian, and marks each succeeded', async () => {
      const events = [
        makeClaimedEvent({ id: 'evt-1', occurredAt: new Date('2026-05-28T10:00:00.000Z') }),
        makeClaimedEvent({ id: 'evt-2', occurredAt: new Date('2026-05-28T10:00:05.000Z') }),
      ];
      spine.claimPendingEvents.mockResolvedValue({ events });
      spine.markDispatchSucceeded.mockResolvedValue(undefined);

      await ingestor.processDecisions('ws-1');

      expect(spine.claimPendingEvents).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        eventType: 'cognition.decision_made',
        limit: 100,
      });

      // Each event marked succeeded
      expect(spine.markDispatchSucceeded).toHaveBeenCalledTimes(2);
      expect(spine.markDispatchSucceeded).toHaveBeenCalledWith('evt-1', 'ws-1');
      expect(spine.markDispatchSucceeded).toHaveBeenCalledWith('evt-2', 'ws-1');
    });
    it('no-op when no pending events', async () => {
      spine.claimPendingEvents.mockResolvedValue({ events: [] });

      await ingestor.processDecisions('ws-1');

      expect(spine.claimPendingEvents).toHaveBeenCalledTimes(1);
      expect(spine.markDispatchSucceeded).not.toHaveBeenCalled();
      expect(hebbian.size()).toBe(0);
    });
    it('maps outbox events to SpineEventRef with correct fields', async () => {
      const events = [
        makeClaimedEvent({
          id: 'evt-a',
          eventType: 'cognition.decision_made',
          occurredAt: new Date('2026-05-28T10:00:00.000Z'),
        }),
      ];
      spine.claimPendingEvents.mockResolvedValue({ events });
      spine.markDispatchSucceeded.mockResolvedValue(undefined);

      const ingestSpy = jest.spyOn(hebbian, 'ingest');

      await ingestor.processDecisions('ws-1');

      expect(ingestSpy).toHaveBeenCalledTimes(1);
      const refs = ingestSpy.mock.calls[0]![0]!;
      expect(refs.length).toBe(1);
      const ref = refs[0]!;
      expect(ref.eventId).toBe('evt-a');
      expect(ref.eventName).toBe('cognition.decision_made');
      expect(ref.workspaceId).toBe('ws-1');
      expect(ref.occurredAt).toBe('2026-05-28T10:00:00.000Z');
      expect(ref.truthMode).toBe('observed');

      ingestSpy.mockRestore();
    });
  });
  describe('tickAllWorkspaces', () => {
    it('processes each workspace with pending decisions', async () => {
      const prisma = {
        mindOutboxEvent: {
          findMany: jest.fn().mockResolvedValue([{ workspaceId: 'ws-1' }, { workspaceId: 'ws-2' }]),
        },
      };
      ingestor = new MindEventIngestor(
        spine as unknown as MindEventSpine,
        hebbian,
        prisma as never,
      );

      spine.claimPendingEvents.mockResolvedValue({ events: [] });

      await ingestor.tickAllWorkspaces();

      expect(prisma.mindOutboxEvent.findMany).toHaveBeenCalledWith({
        where: {
          eventType: 'cognition.decision_made',
          status: 'pending',
        },
        distinct: ['workspaceId'],
        select: { workspaceId: true },
      });
      expect(spine.claimPendingEvents).toHaveBeenCalledTimes(2);
    });
    it('continues to next workspace when one fails', async () => {
      const prisma = {
        mindOutboxEvent: {
          findMany: jest.fn().mockResolvedValue([{ workspaceId: 'ws-1' }, { workspaceId: 'ws-2' }]),
        },
      };
      ingestor = new MindEventIngestor(
        spine as unknown as MindEventSpine,
        hebbian,
        prisma as never,
      );

      spine.claimPendingEvents
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce({ events: [] });

      await ingestor.tickAllWorkspaces();

      // Both workspaces processed despite ws-1 failure
      expect(spine.claimPendingEvents).toHaveBeenCalledTimes(2);
      expect(spine.claimPendingEvents).toHaveBeenNthCalledWith(2, {
        workspaceId: 'ws-2',
        eventType: 'cognition.decision_made',
        limit: 100,
      });
    });
  });
});
