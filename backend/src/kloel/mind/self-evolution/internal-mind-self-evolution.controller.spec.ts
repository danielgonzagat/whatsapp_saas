import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { IS_PUBLIC_METADATA } from '../../../auth/public.decorator';
import { ROUTE_CLASS_METADATA_KEY } from '../../../common/throttler/route-class.decorator';
import { InternalMindSelfEvolutionController } from './internal-mind-self-evolution.controller';
import { castMock } from '../../../../test/helpers/cast-mock';

function isPublicHandler(method: keyof InternalMindSelfEvolutionController): boolean | undefined {
  const handler = Object.getOwnPropertyDescriptor(
    InternalMindSelfEvolutionController.prototype,
    method,
  )?.value as object;
  return Reflect.getMetadata(IS_PUBLIC_METADATA, handler) as boolean | undefined;
}

describe('InternalMindSelfEvolutionController', () => {
  const workspaceFindMany = jest.fn();
  const runEvolutionCycle = jest.fn();

  let controller: InternalMindSelfEvolutionController;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.INTERNAL_API_KEY = 'shared-secret';
    controller = new InternalMindSelfEvolutionController(
      castMock({ workspace: { findMany: workspaceFindMany } }),
      castMock({ runEvolutionCycle }),
    );
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('route + governance wiring', () => {
    it('mounts under internal/mind-self-evolution and is a mutate route class', () => {
      expect(Reflect.getMetadata('path', InternalMindSelfEvolutionController)).toBe(
        'internal/mind-self-evolution',
      );
      expect(
        Reflect.getMetadata(ROUTE_CLASS_METADATA_KEY, InternalMindSelfEvolutionController),
      ).toBe('mutate');
    });

    it('marks the trigger route as @Public() (auth is the internal shared key, not JWT)', () => {
      expect(isPublicHandler('trigger')).toBe(true);
    });
  });

  describe('internal-key gate', () => {
    it('rejects with Unauthorized when INTERNAL_API_KEY is not configured', async () => {
      delete process.env.INTERNAL_API_KEY;

      await expect(controller.trigger(undefined, 'anything')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects with Forbidden when the supplied key does not match', async () => {
      await expect(controller.trigger(undefined, 'wrong-key')).rejects.toThrow(ForbiddenException);
      expect(runEvolutionCycle).not.toHaveBeenCalled();
    });
  });

  describe('trigger sweep', () => {
    it('sweeps explicit workspaceIds, delegates each to the evolution cycle, and summarizes', async () => {
      runEvolutionCycle.mockImplementation((workspaceId: string) =>
        Promise.resolve({
          persisted: true,
          eventId: `evt-${workspaceId}`,
          proposal: { opportunities: [{ id: 'o1' }] },
        }),
      );

      const result = await controller.trigger({ workspaceIds: ['ws-1', 'ws-2'] }, 'shared-secret');

      expect(runEvolutionCycle).toHaveBeenCalledWith('ws-1');
      expect(runEvolutionCycle).toHaveBeenCalledWith('ws-2');
      expect(workspaceFindMany).not.toHaveBeenCalled();
      expect(result).toEqual({
        ok: true,
        sweptWorkspaces: 2,
        persisted: 2,
        failed: 0,
        sample: [
          { workspaceId: 'ws-1', eventId: 'evt-ws-1', opportunities: 1 },
          { workspaceId: 'ws-2', eventId: 'evt-ws-2', opportunities: 1 },
        ],
      });
    });

    it('resolves the workspace set from the DB when no explicit ids are given', async () => {
      workspaceFindMany.mockResolvedValue([{ id: 'ws-a' }]);
      runEvolutionCycle.mockResolvedValue({
        persisted: true,
        eventId: 'evt-a',
        proposal: { opportunities: [] },
      });

      const result = await controller.trigger({ workspaceLimit: 1 }, 'shared-secret');

      expect(workspaceFindMany).toHaveBeenCalledWith({
        select: { id: true },
        orderBy: { createdAt: 'asc' },
        take: 1,
      });
      expect(result.sweptWorkspaces).toBe(1);
      expect(result.persisted).toBe(1);
    });

    it('isolates a failing workspace without aborting the sweep (failure isolation)', async () => {
      runEvolutionCycle
        .mockResolvedValueOnce({
          persisted: true,
          eventId: 'evt-ok',
          proposal: { opportunities: [] },
        })
        .mockRejectedValueOnce(new Error('llm timeout'));

      const result = await controller.trigger(
        { workspaceIds: ['ws-ok', 'ws-bad'] },
        'shared-secret',
      );

      expect(result.persisted).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.sweptWorkspaces).toBe(2);
    });
  });
});
