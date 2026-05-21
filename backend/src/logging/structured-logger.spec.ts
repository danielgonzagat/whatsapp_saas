import { StructuredLogger } from './structured-logger';

describe('StructuredLogger', () => {
  let logger: StructuredLogger;

  beforeEach(() => {
    logger = new StructuredLogger('TestContext');
    jest.clearAllMocks();
  });

  describe('isTestEnv detection', () => {
    it('suppresses info output when JEST_WORKER_ID is set (test environment)', () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});

      logger.info('should not print');

      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('suppresses warn output in test environment', () => {
      const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      logger.warn('should not print');

      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('suppresses error output in test environment', () => {
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

      logger.error('should not print');

      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('non-test environment', () => {
    let originalJest: string | undefined;
    let originalNodeEnv: string | undefined;

    beforeEach(() => {
      originalJest = process.env.JEST_WORKER_ID;
      originalNodeEnv = process.env.NODE_ENV;
      delete process.env.JEST_WORKER_ID;
      process.env.NODE_ENV = 'production';
    });

    afterEach(() => {
      if (originalJest) {
        process.env.JEST_WORKER_ID = originalJest;
      } else {
        delete process.env.JEST_WORKER_ID;
      }
      process.env.NODE_ENV = originalNodeEnv;
    });

    it('logs info with structured JSON in non-test environment', () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});

      logger.info('hello world');

      expect(spy).toHaveBeenCalledTimes(1);
      const logged = spy.mock.calls[0][0];
      const parsed = JSON.parse(logged as string);

      expect(parsed).toMatchObject({
        level: 'info',
        context: 'TestContext',
        message: 'hello world',
      });
      expect(parsed.timestamp).toBeDefined();
      spy.mockRestore();
    });

    it('logs warn with structured JSON in non-test environment', () => {
      const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      logger.warn('warning message');

      expect(spy).toHaveBeenCalledTimes(1);
      const logged = spy.mock.calls[0][0];
      const parsed = JSON.parse(logged as string);

      expect(parsed).toMatchObject({
        level: 'warn',
        context: 'TestContext',
        message: 'warning message',
      });
      spy.mockRestore();
    });

    it('logs error with structured JSON in non-test environment', () => {
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

      logger.error('error occurred');

      expect(spy).toHaveBeenCalledTimes(1);
      const logged = spy.mock.calls[0][0];
      const parsed = JSON.parse(logged as string);

      expect(parsed).toMatchObject({
        level: 'error',
        context: 'TestContext',
        message: 'error occurred',
      });
      spy.mockRestore();
    });

    it('includes extra fields in serialized output', () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});

      logger.info('message with extra', { userId: 'u-1', count: 42 });

      const logged = spy.mock.calls[0][0];
      const parsed = JSON.parse(logged as string);

      expect(parsed.userId).toBe('u-1');
      expect(parsed.count).toBe(42);
      spy.mockRestore();
    });

    it('handles extra fields with null values', () => {
      const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const sentinelNull: string = null as string;
      logger.warn('null extra', { nullable: sentinelNull });

      const logged = spy.mock.calls[0][0];
      const parsed = JSON.parse(logged as string);

      expect(parsed.nullable).toBeNull();
      spy.mockRestore();
    });

    it('handles extra fields with undefined values (JSON excludes them)', () => {
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

      logger.error('undefined extra', {});

      const logged = spy.mock.calls[0][0];
      const parsed = JSON.parse(logged as string);

      // Only core fields present, no extras
      expect(Object.keys(parsed).sort()).toEqual(
        ['context', 'level', 'message', 'timestamp'].sort(),
      );
      spy.mockRestore();
    });

    it('includes timestamp in ISO 8601 format', () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});

      logger.info('timestamped');

      const logged = spy.mock.calls[0][0];
      const parsed = JSON.parse(logged as string);

      expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      spy.mockRestore();
    });

    it('serialize output is valid JSON for all levels', () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      logger.info('msg');
      logger.warn('msg');
      logger.error('msg');

      [logSpy, warnSpy, errorSpy].forEach((spy) => {
        expect(() => JSON.parse(spy.mock.calls[0][0] as string)).not.toThrow();
      });

      logSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });

  describe('legacy NestJS Logger signatures (compat shim)', () => {
    let originalJest: string | undefined;
    let originalNodeEnv: string | undefined;

    beforeEach(() => {
      originalJest = process.env.JEST_WORKER_ID;
      originalNodeEnv = process.env.NODE_ENV;
      delete process.env.JEST_WORKER_ID;
      process.env.NODE_ENV = 'production';
    });

    afterEach(() => {
      if (originalJest) {
        process.env.JEST_WORKER_ID = originalJest;
      } else {
        delete process.env.JEST_WORKER_ID;
      }
      process.env.NODE_ENV = originalNodeEnv;
    });

    it('handles 2-arg log(message, contextString) — NestJS compat', () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});

      logger.log('operation started', 'MyService.run');

      const parsed = JSON.parse(spy.mock.calls[0][0] as string);
      expect(parsed).toMatchObject({
        level: 'info',
        message: 'operation started',
      });
      expect(parsed.context).toBe('MyService.run');
      spy.mockRestore();
    });

    it('handles 2-arg warn(message, contextString) — NestJS compat', () => {
      const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      logger.warn('deprecation warning', 'OldService.call');

      const parsed = JSON.parse(spy.mock.calls[0][0] as string);
      expect(parsed).toMatchObject({
        level: 'warn',
        message: 'deprecation warning',
      });
      expect(parsed.context).toBe('OldService.call');
      spy.mockRestore();
    });

    it('handles 3-arg error(message, stack, context) — NestJS compat', () => {
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

      logger.error('something broke', 'Error: boom\n  at foo.js:1', 'MyService');

      const parsed = JSON.parse(spy.mock.calls[0][0] as string);
      expect(parsed).toMatchObject({
        level: 'error',
        message: 'something broke',
        stack: 'Error: boom\n  at foo.js:1',
      });
      expect(parsed.context).toBe('MyService');
      spy.mockRestore();
    });

    it('handles 3-arg error(message, stack, extraObj) — auto-migrated compat', () => {
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

      logger.error(
        'Failed to decrypt MFA secret',
        'Error: bad key',
        { context: 'AdminMfaService.resumeSetup' },
      );

      const parsed = JSON.parse(spy.mock.calls[0][0] as string);
      expect(parsed).toMatchObject({
        level: 'error',
        message: 'Failed to decrypt MFA secret',
        stack: 'Error: bad key',
        context: 'AdminMfaService.resumeSetup',
      });
      spy.mockRestore();
    });

    it('handles error(message, Error object) — unknown second arg', () => {
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const err = new Error('connection refused');
      logger.error('DB query failed', err);

      const parsed = JSON.parse(spy.mock.calls[0][0] as string);
      expect(parsed).toMatchObject({
        level: 'error',
        message: 'DB query failed',
      });
      expect(parsed.message).toBe('DB query failed');
      spy.mockRestore();
    });

    it('handles pino-style log(dataObj, messageString)', () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});

      logger.log({ workspaceId: 'ws-1', durationMs: 42 }, 'Autopilot impact succeeded');

      const parsed = JSON.parse(spy.mock.calls[0][0] as string);
      expect(parsed).toMatchObject({
        level: 'info',
        message: 'Autopilot impact succeeded',
        workspaceId: 'ws-1',
        durationMs: 42,
      });
      spy.mockRestore();
    });

    it('handles 3-arg warn(message, context, extraObj)', () => {
      const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      logger.warn(
        'Failed to track AI usage',
        'ConversationalOnboardingService',
        { workspaceId: 'ws-2', retryable: true },
      );

      const parsed = JSON.parse(spy.mock.calls[0][0] as string);
      expect(parsed).toMatchObject({
        level: 'warn',
        message: 'Failed to track AI usage',
        workspaceId: 'ws-2',
        retryable: true,
      });
      expect(parsed.context).toBeDefined();
      spy.mockRestore();
    });

    it('handles error({data}, message, Error) — 3-arg pino with error', () => {
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const err = new TypeError('invalid amount');
      logger.error(
        { workspaceId: 'ws-3', operation: 'approve_payout' },
        'Financial operation failed',
        err,
      );

      const parsed = JSON.parse(spy.mock.calls[0][0] as string);
      expect(parsed).toMatchObject({
        level: 'error',
        message: 'Financial operation failed',
        workspaceId: 'ws-3',
        operation: 'approve_payout',
        error: 'invalid amount',
        errorName: 'TypeError',
      });
      spy.mockRestore();
    });

    it('handles error(message, undefined, extraObj) — explicit undefined stack', () => {
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

      logger.error('split validation: field must be >= 0', undefined, {
        field: 'saleValueCents',
        value: '-1',
      });

      const parsed = JSON.parse(spy.mock.calls[0][0] as string);
      expect(parsed).toMatchObject({
        level: 'error',
        message: 'split validation: field must be >= 0',
        field: 'saleValueCents',
        value: '-1',
      });
      expect(parsed.stack).toBeUndefined();
      spy.mockRestore();
    });

    it('debug and verbose delegate to info with NestJS compat', () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});

      logger.debug('debug message', 'DebugContext');
      logger.verbose('verbose message', { detail: 42 });

      expect(spy).toHaveBeenCalledTimes(2);
      const debugParsed = JSON.parse(spy.mock.calls[0][0] as string);
      expect(debugParsed).toMatchObject({ level: 'info', message: 'debug message' });
      const verboseParsed = JSON.parse(spy.mock.calls[1][0] as string);
      expect(verboseParsed).toMatchObject({ level: 'info', message: 'verbose message', detail: 42 });
      spy.mockRestore();
    });
  });
});
