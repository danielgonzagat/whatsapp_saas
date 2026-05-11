import { IdempotencyMiddleware } from './idempotency.middleware';
import type { NextFunction, Request, Response } from 'express';

type FakeResponse = {
  _status: number;
  _body: unknown;
  _jsonCalled: boolean;
  statusCode: number;
  status: jest.Mock;
  json: jest.Mock;
};

type FakeRequest = Partial<Request> & {
  headers: Record<string, string>;
  header: jest.Mock;
  method: string;
  path: string;
};

function makeFakeRequest(overrides: {
  idempotencyKey?: string;
  method?: string;
  path?: string;
}): FakeRequest {
  const headers: Record<string, string> = {};
  if (overrides.idempotencyKey) {
    headers['Idempotency-Key'] = overrides.idempotencyKey;
  }
  return {
    headers,
    header: jest.fn((name: string) => headers[name]) as jest.Mock,
    method: overrides.method ?? 'POST',
    path: overrides.path ?? '/api/wallet/withdraw',
  };
}

function makeFakeRes(opts: { statusCode?: number } = {}): FakeResponse {
  const res: FakeResponse = {
    _status: 200,
    _body: undefined,
    _jsonCalled: false,
    statusCode: opts.statusCode ?? 200,
    status: jest.fn(),
    json: jest.fn(),
  };
  res.status = jest.fn((code: number) => {
    res._status = code;
    return res;
  }) as jest.Mock;
  res.json = jest.fn((body: unknown) => {
    res._jsonCalled = true;
    res._body = body;
    return res;
  }) as jest.Mock;
  return res;
}

describe('IdempotencyMiddleware', () => {
  let middleware: IdempotencyMiddleware;
  let idempotencyService: {
    get: jest.Mock;
    set: jest.Mock;
  };

  beforeEach(() => {
    idempotencyService = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue(undefined),
    };
    middleware = new IdempotencyMiddleware(idempotencyService as never);
  });

  describe('header handling', () => {
    it('calls next() when no Idempotency-Key header is present', async () => {
      const req = makeFakeRequest({}) as unknown as Request;
      const res = {} as Response;
      const next = jest.fn() as NextFunction;

      await middleware.use(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(idempotencyService.get).not.toHaveBeenCalled();
    });

    it('calls next() for GET requests even with Idempotency-Key header', async () => {
      const req = makeFakeRequest({ idempotencyKey: 'key-1', method: 'GET' }) as unknown as Request;
      const res = {} as Response;
      const next = jest.fn() as NextFunction;

      await middleware.use(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(idempotencyService.get).not.toHaveBeenCalled();
    });

    it('calls next() for HEAD requests even with Idempotency-Key header', async () => {
      const req = makeFakeRequest({
        idempotencyKey: 'key-1',
        method: 'HEAD',
      }) as unknown as Request;
      const res = {} as Response;
      const next = jest.fn() as NextFunction;

      await middleware.use(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(idempotencyService.get).not.toHaveBeenCalled();
    });

    it('calls idempotency.get for POST requests with Idempotency-Key header', async () => {
      const req = makeFakeRequest({
        idempotencyKey: 'key-1',
        method: 'POST',
      }) as unknown as Request;
      const res = makeFakeRes();
      const next = jest.fn() as NextFunction;

      idempotencyService.get.mockResolvedValueOnce(null);

      await middleware.use(req, res as unknown as Response, next);

      expect(idempotencyService.get).toHaveBeenCalledWith('key-1', 'POST', '/api/wallet/withdraw');
      expect(next).toHaveBeenCalled();
    });
  });

  describe('cache hit', () => {
    it('returns cached 200 response without calling next()', async () => {
      const req = makeFakeRequest({
        idempotencyKey: 'key-1',
        method: 'POST',
      }) as unknown as Request;
      const res = makeFakeRes();
      const next = jest.fn() as NextFunction;

      idempotencyService.get.mockResolvedValueOnce({ status: 201, body: { id: 42, ok: true } });

      await middleware.use(req, res as unknown as Response, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ id: 42, ok: true });
      expect(next).not.toHaveBeenCalled();
    });

    it('returns cached 400 error response without calling next()', async () => {
      const req = makeFakeRequest({
        idempotencyKey: 'key-1',
        method: 'POST',
      }) as unknown as Request;
      const res = makeFakeRes();
      const next = jest.fn() as NextFunction;

      idempotencyService.get.mockResolvedValueOnce({ status: 400, body: { error: 'bad input' } });

      await middleware.use(req, res as unknown as Response, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'bad input' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('cache miss — response capture', () => {
    it('wraps res.json to cache response on call', async () => {
      const req = makeFakeRequest({
        idempotencyKey: 'key-1',
        method: 'POST',
      }) as unknown as Request;
      const res = makeFakeRes();
      let capturedJson: ((body: unknown) => Response) | null = null;
      const next = jest.fn(() => {
        capturedJson = (res as unknown as Response).json;
      }) as NextFunction;

      idempotencyService.get.mockResolvedValueOnce(null);

      await middleware.use(req, res as unknown as Response, next);

      if (capturedJson) {
        capturedJson({ id: 99 });
      }

      expect(idempotencyService.set).toHaveBeenCalledWith(
        'key-1',
        'POST',
        '/api/wallet/withdraw',
        200,
        { id: 99 },
        86400,
      );
    });

    it('does not throw if cache write fails during response capture', async () => {
      const req = makeFakeRequest({
        idempotencyKey: 'key-1',
        method: 'POST',
      }) as unknown as Request;
      const res = makeFakeRes();
      let capturedJson: ((body: unknown) => Response) | null = null;
      const next = jest.fn(() => {
        capturedJson = (res as unknown as Response).json;
      }) as NextFunction;

      idempotencyService.get.mockResolvedValueOnce(null);
      idempotencyService.set.mockRejectedValueOnce(new Error('redis is down'));

      await middleware.use(req, res as unknown as Response, next);

      expect(() => capturedJson?.({ id: 99 })).not.toThrow();
    });
  });

  describe('method+path scoping', () => {
    it('same key on a different method is not considered a cache hit', async () => {
      const req = makeFakeRequest({
        idempotencyKey: 'key-1',
        method: 'PUT',
        path: '/api/wallet/withdraw',
      }) as unknown as Request;
      const res = makeFakeRes();
      const next = jest.fn() as NextFunction;

      idempotencyService.get.mockResolvedValueOnce(null);

      await middleware.use(req, res as unknown as Response, next);

      expect(idempotencyService.get).toHaveBeenCalledWith('key-1', 'PUT', '/api/wallet/withdraw');
    });

    it('same key on a different path is not considered a cache hit', async () => {
      const req = makeFakeRequest({
        idempotencyKey: 'key-1',
        method: 'POST',
        path: '/api/wallet/deposit',
      }) as unknown as Request;
      const res = makeFakeRes();
      const next = jest.fn() as NextFunction;

      idempotencyService.get.mockResolvedValueOnce(null);

      await middleware.use(req, res as unknown as Response, next);

      expect(idempotencyService.get).toHaveBeenCalledWith('key-1', 'POST', '/api/wallet/deposit');
    });
  });
});
