import { MindAutonomyService } from './mind-autonomy.service';

function makePrisma(overrides?: {
  autopilotEvents?: Array<{
    id: string;
    workspaceId: string;
    intent: string;
    action: string;
    status: string;
    reason?: string;
    createdAt: Date;
  }>;
  beliefs?: Array<{
    id: string;
    workspaceId: string;
    subject: string;
    predicate: string;
    mean: number;
    variance: number;
    samples: number;
  }>;
}) {
  const events = overrides?.autopilotEvents ?? [];
  const beliefs = overrides?.beliefs ?? [];
  return {
    autopilotEvent: {
      findMany: jest
        .fn()
        .mockImplementation((args: { where: { workspaceId: string } }) =>
          Promise.resolve(events.filter((e) => e.workspaceId === args.where.workspaceId)),
        ),
    },
    mindBelief: {
      findMany: jest
        .fn()
        .mockImplementation((args: { where: { workspaceId: string } }) =>
          Promise.resolve(beliefs.filter((b) => b.workspaceId === args.where.workspaceId)),
        ),
    },
  };
}

function makeSpine() {
  return { emit: jest.fn().mockResolvedValue(undefined) };
}

describe('MindAutonomyService', () => {
  describe('proposeGoal', () => {
    it('returns null when no anomalies exist', async () => {
      const prisma = makePrisma();
      const spine = makeSpine();
      const svc = new MindAutonomyService(prisma as never, spine as never);

      const result = await svc.proposeGoal('ws-1');

      expect(result).toBeNull();
      expect(spine.emit).not.toHaveBeenCalled();
    });

    it('proposes a goal when there are >= 3 error autopilot events', async () => {
      const now = new Date();
      const errorEvents = Array.from({ length: 4 }, (_, i) => ({
        id: `evt-${i}`,
        workspaceId: 'ws-1',
        intent: 'send_message',
        action: 'whatsapp.send',
        status: 'error',
        reason: 'timeout',
        createdAt: new Date(now.getTime() - i * 3600_000),
      }));
      const prisma = makePrisma({ autopilotEvents: errorEvents });
      const spine = makeSpine();
      const svc = new MindAutonomyService(prisma as never, spine as never);

      const result = await svc.proposeGoal('ws-1');

      expect(result).not.toBeNull();
      expect(result.goal).toContain('4 autopilot errors');
      expect(result.priority).toBeGreaterThan(0.6);
      expect(spine.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'cognition.autonomy.goal_proposed',
          workspaceId: 'ws-1',
        }),
      );
    });

    it('proposes a goal for low reply beliefs', async () => {
      const beliefs = [
        {
          id: 'b-1',
          workspaceId: 'ws-1',
          subject: 'contact:lead-42',
          predicate: 'replied_to_user',
          mean: 0.15,
          variance: 0.1,
          samples: 10,
        },
      ];
      const prisma = makePrisma({ beliefs });
      const spine = makeSpine();
      const svc = new MindAutonomyService(prisma as never, spine as never);

      const result = await svc.proposeGoal('ws-1');

      expect(result).not.toBeNull();
      expect(result.goal).toContain('Improve reply engagement');
      expect(result.priority).toBe(0.7);
      expect(spine.emit).toHaveBeenCalled();
    });

    it('does not flag low-reply beliefs with insufficient samples', async () => {
      const beliefs = [
        {
          id: 'b-1',
          workspaceId: 'ws-1',
          subject: 'contact:lead-1',
          predicate: 'replied_to_user',
          mean: 0.1,
          variance: 0.1,
          samples: 2,
        },
      ];
      const prisma = makePrisma({ beliefs });
      const spine = makeSpine();
      const svc = new MindAutonomyService(prisma as never, spine as never);

      const result = await svc.proposeGoal('ws-1');

      expect(result).toBeNull();
    });

    it('proposes a goal for high surprise beliefs', async () => {
      const beliefs = [
        {
          id: 'b-1',
          workspaceId: 'ws-1',
          subject: 'contact:lead-7',
          predicate: 'P(purchase|channel)',
          mean: 0.3,
          variance: 0.8,
          samples: 20,
        },
      ];
      const prisma = makePrisma({ beliefs });
      const spine = makeSpine();
      const svc = new MindAutonomyService(prisma as never, spine as never);

      const result = await svc.proposeGoal('ws-1');

      expect(result).not.toBeNull();
      expect(result.goal).toContain('belief volatility');
      expect(result.priority).toBe(0.5);
      expect(spine.emit).toHaveBeenCalled();
    });

    it('prioritizes error events over belief anomalies', async () => {
      const now = new Date();
      const errorEvents = Array.from({ length: 3 }, (_, i) => ({
        id: `evt-${i}`,
        workspaceId: 'ws-1',
        intent: 'send_message',
        action: 'whatsapp.send',
        status: 'error',
        reason: 'timeout',
        createdAt: new Date(now.getTime() - i * 3600_000),
      }));
      const beliefs = [
        {
          id: 'b-1',
          workspaceId: 'ws-1',
          subject: 'contact:lead-7',
          predicate: 'replied_to_user',
          mean: 0.1,
          variance: 0.1,
          samples: 20,
        },
      ];
      const prisma = makePrisma({ autopilotEvents: errorEvents, beliefs });
      const spine = makeSpine();
      const svc = new MindAutonomyService(prisma as never, spine as never);

      const result = await svc.proposeGoal('ws-1');

      expect(result).not.toBeNull();
      expect(result.goal).toContain('autopilot errors');
      expect(result.priority).toBeGreaterThan(0.7);
    });

    it('deduplicates goals within 1 hour', async () => {
      const now = new Date();
      const errorEvents = Array.from({ length: 3 }, (_, i) => ({
        id: `evt-${i}`,
        workspaceId: 'ws-1',
        intent: 'send_message',
        action: 'whatsapp.send',
        status: 'error',
        reason: 'timeout',
        createdAt: new Date(now.getTime() - i * 3600_000),
      }));
      const prisma = makePrisma({ autopilotEvents: errorEvents });
      const spine = makeSpine();
      const svc = new MindAutonomyService(prisma as never, spine as never);

      const first = await svc.proposeGoal('ws-1');
      expect(first).not.toBeNull();

      spine.emit.mockClear();

      const second = await svc.proposeGoal('ws-1');
      expect(second).toBeNull();
      expect(spine.emit).not.toHaveBeenCalled();
    });

    it('respects workspace isolation', async () => {
      const now = new Date();
      const ws1Events = Array.from({ length: 3 }, (_, i) => ({
        id: `evt-ws1-${i}`,
        workspaceId: 'ws-1',
        intent: 'send_message',
        action: 'whatsapp.send',
        status: 'error',
        reason: 'timeout',
        createdAt: new Date(now.getTime() - i * 3600_000),
      }));
      const prisma = makePrisma({ autopilotEvents: ws1Events });
      const spine = makeSpine();
      const svc = new MindAutonomyService(prisma as never, spine as never);

      const result = await svc.proposeGoal('ws-2');

      expect(result).toBeNull();
      expect(spine.emit).not.toHaveBeenCalled();
    });

    it('returns null on prisma failure', async () => {
      const prisma = {
        autopilotEvent: {
          findMany: jest.fn().mockRejectedValue(new Error('db down')),
        },
        mindBelief: {
          findMany: jest.fn().mockRejectedValue(new Error('db down')),
        },
      };
      const svc = new MindAutonomyService(prisma as never);

      const result = await svc.proposeGoal('ws-1');

      expect(result).toBeNull();
    });

    it('works without spine (optional)', async () => {
      const now = new Date();
      const errorEvents = Array.from({ length: 3 }, (_, i) => ({
        id: `evt-${i}`,
        workspaceId: 'ws-1',
        intent: 'send_message',
        action: 'whatsapp.send',
        status: 'error',
        reason: 'timeout',
        createdAt: new Date(now.getTime() - i * 3600_000),
      }));
      const prisma = makePrisma({ autopilotEvents: errorEvents });
      const svc = new MindAutonomyService(prisma as never);

      const result = await svc.proposeGoal('ws-1');

      expect(result).not.toBeNull();
      expect(result.goal).toContain('3 autopilot errors');
    });
  });

  describe('_dedupSize', () => {
    it('returns the number of tracked dedup entries', async () => {
      const now = new Date();
      const errorEvents = Array.from({ length: 3 }, (_, i) => ({
        id: `evt-${i}`,
        workspaceId: 'ws-1',
        intent: 'send_message',
        action: 'whatsapp.send',
        status: 'error',
        reason: 'timeout',
        createdAt: new Date(now.getTime() - i * 3600_000),
      }));
      const prisma = makePrisma({ autopilotEvents: errorEvents });
      const svc = new MindAutonomyService(prisma as never);

      expect(svc._dedupSize()).toBe(0);
      await svc.proposeGoal('ws-1');
      expect(svc._dedupSize()).toBe(1);
    });
  });
});
