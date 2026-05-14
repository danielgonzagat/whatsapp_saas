jest.mock('node:fs', () => ({
  appendFileSync: jest.fn(),
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
}));

jest.mock('node:path', () => ({
  join: jest.fn((...args: string[]) => args.join('/')),
}));

jest.mock('../logging/structured-logger', () => ({
  StructuredLogger: {
    from: jest.fn().mockReturnValue({
      log: jest.fn(),
      warn: jest.fn(),
    }),
  },
}));

import * as fs from 'node:fs';
import { StructuredLogger } from '../logging/structured-logger';
import { LacunasController } from './lacunas.controller';

const fsAppendFileSync = fs.appendFileSync as jest.Mock;
const fsExistsSync = fs.existsSync as jest.Mock;
const fsMkdirSync = fs.mkdirSync as jest.Mock;

describe('LacunasController', () => {
  let controller: LacunasController;
  let loggerLog: jest.Mock;
  let loggerWarn: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    fsExistsSync.mockReturnValue(true);

    controller = new LacunasController();

    const loggerInstance = (StructuredLogger.from as jest.Mock).mock.results[0].value;
    loggerLog = loggerInstance.log as jest.Mock;
    loggerWarn = loggerInstance.warn as jest.Mock;
  });

  const req = {
    user: { sub: 'u-1', workspaceId: 'ws-1' },
    workspaceId: 'ws-1',
    headers: {},
  } as never;

  describe('suggest (POST admin/lacunas-suggest)', () => {
    it('records a lacuna suggestion with intent and userMessage (happy path)', async () => {
      const body = { intent: 'missing-feature', userMessage: 'Need a dark mode toggle' };

      const result = await controller.suggest(body, req);

      expect(fsAppendFileSync).toHaveBeenCalledTimes(1);
      const [, content] = fsAppendFileSync.mock.calls[0];
      const parsed = JSON.parse(content);
      expect(parsed.workspaceId).toBe('ws-1');
      expect(parsed.intent).toBe('missing-feature');
      expect(parsed.userMessage).toBe('Need a dark mode toggle');
      expect(parsed.suggestedAt).toBeDefined();
      expect(loggerLog).toHaveBeenCalledWith(
        'Lacuna suggestion recorded: missing-feature from ws-1',
      );
      expect(result).toEqual({ ok: true });
    });

    it('defaults intent to "unspecified" when not provided in body (alternate route)', async () => {
      const body = { userMessage: 'Something is broken' };

      await controller.suggest(body, req);

      const [, content] = fsAppendFileSync.mock.calls[0];
      const parsed = JSON.parse(content);
      expect(parsed.intent).toBe('unspecified');
      expect(parsed.userMessage).toBe('Something is broken');
    });

    it('truncates userMessage to 500 characters', async () => {
      const longMessage = 'x'.repeat(1000);
      const body = { intent: 'bug', userMessage: longMessage };

      await controller.suggest(body, req);

      const [, content] = fsAppendFileSync.mock.calls[0];
      const parsed = JSON.parse(content);
      expect(parsed.userMessage).toHaveLength(500);
    });

    it('creates artifacts directory when it does not exist', async () => {
      fsExistsSync.mockReturnValue(false);
      const body = { intent: 'feature-request' };

      await controller.suggest(body, req);

      expect(fsMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('artifacts'),
        { recursive: true },
      );
      expect(fsAppendFileSync).toHaveBeenCalledTimes(1);
    });

    it('propagates workspaceId from req into the recorded entry (identity propagated)', async () => {
      const adminReq = {
        user: { sub: 'admin-1', workspaceId: 'ws-admin' },
        workspaceId: 'ws-admin',
        headers: {},
      } as never;
      const body = { intent: 'admin-report' };

      await controller.suggest(body, adminReq);

      const [, content] = fsAppendFileSync.mock.calls[0];
      const parsed = JSON.parse(content);
      expect(parsed.workspaceId).toBe('ws-admin');
    });

    it('falls back to req.user.workspaceId when req.workspaceId is undefined', async () => {
      const userReq = {
        user: { sub: 'u-2', workspaceId: 'ws-user-only' },
        headers: {},
      } as never;
      const body = { intent: 'fallback-test' };

      await controller.suggest(body, userReq);

      const [, content] = fsAppendFileSync.mock.calls[0];
      const parsed = JSON.parse(content);
      expect(parsed.workspaceId).toBe('ws-user-only');
    });

    it('uses "unknown" when neither req.workspaceId nor req.user exists', async () => {
      const anonReq = { headers: {} } as never;
      const body = { intent: 'anon-report' };

      await controller.suggest(body, anonReq);

      const [, content] = fsAppendFileSync.mock.calls[0];
      const parsed = JSON.parse(content);
      expect(parsed.workspaceId).toBe('unknown');
    });

    it('logs a warning but returns ok:true when fs appendFileSync throws (error path)', async () => {
      const fsError = new Error('ENOSPC: no space left on device');
      fsAppendFileSync.mockImplementation(() => {
        throw fsError;
      });
      const body = { intent: 'error-test', userMessage: 'Should handle gracefully' };

      const result = await controller.suggest(body, req);

      expect(loggerWarn).toHaveBeenCalledWith(
        `Failed to persist lacuna suggestion: ${fsError.message}`,
      );
      expect(loggerLog).toHaveBeenCalledWith(
        'Lacuna suggestion recorded: error-test from ws-1',
      );
      expect(result).toEqual({ ok: true });
    });
  });
});
