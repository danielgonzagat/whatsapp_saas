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

      const sentinelNull: string = null as unknown as string;
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
});
