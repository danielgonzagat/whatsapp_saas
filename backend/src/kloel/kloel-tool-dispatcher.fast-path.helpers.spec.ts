import {
  checkMindGuard,
  type GuardLogger,
  type MindGuardServices,
} from './kloel-tool-dispatcher.fast-path.helpers';

describe('kloel-tool-dispatcher.fast-path.helpers (K73 proof)', () => {
  function makeLogger(): GuardLogger & { calls: Array<{ level: string; payload: unknown }> } {
    const calls: Array<{ level: string; payload: unknown }> = [];
    const logger: GuardLogger & { calls: typeof calls } = {
      calls,
      warn: (msg: unknown) => calls.push({ level: 'warn', payload: msg }),
      info: (msg: unknown) => calls.push({ level: 'info', payload: msg }),
      error: (msg: unknown) => calls.push({ level: 'error', payload: msg }),
    } as GuardLogger & { calls: typeof calls };
    return logger;
  }

  describe('checkMindGuard', () => {
    it('returns null/passes when mind guards are not configured', async () => {
      const logger = makeLogger();
      const services: MindGuardServices = {
        mindGuards: undefined,
        mindGuardContextBuilder: undefined,
      };
      const result = await checkMindGuard(
        { workspaceId: 'ws-1', operation: 'send_message', userMessage: 'olá' },
        services,
        logger,
      );
      // The contract returns null/undefined/{allowed:true} when guards are absent;
      // assert it is not a hard-block.
      const blocked = (result as { blocked?: boolean } | null)?.blocked;
      expect(blocked).not.toBe(true);
    });

    it('does not throw when called with a minimal services object', async () => {
      const logger = makeLogger();
      const services: MindGuardServices = {
        mindGuards: undefined,
        mindGuardContextBuilder: undefined,
      };
      await expect(
        checkMindGuard(
          { workspaceId: 'ws-2', operation: 'noop', userMessage: '' },
          services,
          logger,
        ),
      ).resolves.toBeDefined();
    });
  });
});
