import { ExecutionContext, Logger } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { LoggingInterceptor } from './logging.interceptor';

describe('LoggingInterceptor', () => {
  let loggerLogSpy: jest.SpyInstance;

  beforeEach(() => {
    loggerLogSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    loggerLogSpy.mockRestore();
  });

  it('logs method, path, status code and response time', async () => {
    const interceptor = new LoggingInterceptor();

    const req = { method: 'GET', path: '/test' };
    const res = { statusCode: 200, setHeader: jest.fn() };

    const context = {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
    } as unknown as ExecutionContext;

    const handler = { handle: () => of({ ok: true }) };

    const result = await firstValueFrom(interceptor.intercept(context, handler));

    expect(result).toEqual({ ok: true });
    expect(loggerLogSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^GET \/test 200 \d+ms$/),
    );
  });

  it('sets X-Response-Time header with duration in ms', async () => {
    const interceptor = new LoggingInterceptor();

    const res = { statusCode: 201, setHeader: jest.fn() };

    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'POST', path: '/api/resource' }),
        getResponse: () => res,
      }),
    } as unknown as ExecutionContext;

    const handler = { handle: () => of({ id: 1 }) };

    await firstValueFrom(interceptor.intercept(context, handler));

    expect(res.setHeader).toHaveBeenCalledWith(
      'X-Response-Time',
      expect.stringMatching(/^\d+ms$/),
    );
  });

  it('handles requests without setHeader gracefully', async () => {
    const interceptor = new LoggingInterceptor();

    const res = { statusCode: 304 };

    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'DELETE', path: '/api/item/42' }),
        getResponse: () => res,
      }),
    } as unknown as ExecutionContext;

    const handler = { handle: () => of(undefined) };

    const result = await firstValueFrom(interceptor.intercept(context, handler));

    expect(result).toBeUndefined();
    expect(loggerLogSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^DELETE \/api\/item\/42 304 \d+ms$/),
    );
  });
});
