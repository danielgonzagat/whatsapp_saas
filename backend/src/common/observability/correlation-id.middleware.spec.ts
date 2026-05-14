import { CorrelationIdMiddleware } from './correlation-id.middleware';
import type { NextFunction, Request, Response } from 'express';

type FakeRequest = Partial<Request> & {
  id?: string;
  headers: Record<string, string | string[] | undefined>;
};

type FakeResponse = {
  headers: Record<string, string | string[] | undefined>;
  headersSent: boolean;
  setHeader: jest.Mock;
  getHeader: jest.Mock;
};

function makeFakeRequest(overrides: {
  id?: string;
  correlationId?: string;
  requestId?: string;
  acceptLanguage?: string;
} = {}): FakeRequest {
  const headers: Record<string, string | string[] | undefined> = {};
  if (overrides.correlationId) {
    headers['x-correlation-id'] = overrides.correlationId;
  }
  if (overrides.requestId) {
    headers['x-request-id'] = overrides.requestId;
  }
  if (overrides.acceptLanguage) {
    headers['accept-language'] = overrides.acceptLanguage;
  }
  return {
    id: overrides.id,
    headers,
  };
}

function makeFakeRes(opts: { headersSent?: boolean } = {}): FakeResponse {
  const headers: Record<string, string | string[] | undefined> = {};
  const res: FakeResponse = {
    headers,
    headersSent: opts.headersSent ?? false,
    setHeader: jest.fn((name: string, value: string) => {
      headers[name] = value;
      return res;
    }),
    getHeader: jest.fn((name: string) => headers[name]),
  };
  return res;
}

describe('CorrelationIdMiddleware', () => {
  let middleware: CorrelationIdMiddleware;

  beforeEach(() => {
    middleware = new CorrelationIdMiddleware();
  });

  describe('incoming x-correlation-id', () => {
    it('uses the incoming x-correlation-id header when present', () => {
      const req = makeFakeRequest({ correlationId: 'inbound-abc-123' });
      const res = makeFakeRes();
      const next = jest.fn() as NextFunction;

      middleware.use(req as Request, res as Response, next);

      expect(req.headers['x-correlation-id']).toBe('inbound-abc-123');
      expect(next).toHaveBeenCalled();
    });

    it('falls back to x-request-id when x-correlation-id is missing', () => {
      const req = makeFakeRequest({ requestId: 'req-id-456' });
      const res = makeFakeRes();
      const next = jest.fn() as NextFunction;

      middleware.use(req as Request, res as Response, next);

      expect(req.headers['x-correlation-id']).toBe('req-id-456');
      expect(next).toHaveBeenCalled();
    });

    it('generates a UUID when no correlation headers are present', () => {
      const req = makeFakeRequest();
      const res = makeFakeRes();
      const next = jest.fn() as NextFunction;

      middleware.use(req as Request, res as Response, next);

      const id = req.headers['x-correlation-id'];
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect((id as string).length).toBeGreaterThanOrEqual(36);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('response headers', () => {
    it('sets x-correlation-id and x-request-id on the response', () => {
      const req = makeFakeRequest({ correlationId: 'resp-test-789' });
      const res = makeFakeRes();
      const next = jest.fn() as NextFunction;

      middleware.use(req as Request, res as Response, next);

      expect(res.setHeader).toHaveBeenCalledWith('x-correlation-id', 'resp-test-789');
      expect(res.setHeader).toHaveBeenCalledWith('x-request-id', 'resp-test-789');
    });

    it('does not set response headers when headers are already sent', () => {
      const req = makeFakeRequest({ correlationId: 'late-id' });
      const res = makeFakeRes({ headersSent: true });
      const next = jest.fn() as NextFunction;

      middleware.use(req as Request, res as Response, next);

      expect(res.setHeader).not.toHaveBeenCalled();
    });
  });

  describe('x-request-id prop', () => {
    it('sets request.id if not already present', () => {
      const req = makeFakeRequest({ correlationId: 'with-id' });
      const res = makeFakeRes();
      const next = jest.fn() as NextFunction;

      middleware.use(req as Request, res as Response, next);

      expect(req.id).toBe('with-id');
    });

    it('preserves existing request.id when already set', () => {
      const req = makeFakeRequest({ id: 'existing-req-id', correlationId: 'should-not-override' });
      const res = makeFakeRes();
      const next = jest.fn() as NextFunction;

      middleware.use(req as Request, res as Response, next);

      expect(req.id).toBe('existing-req-id');
    });
  });

  describe('header propagation', () => {
    it('propagates x-correlation-id to both request headers after processing', () => {
      const req = makeFakeRequest({ correlationId: 'prop-001' });
      const res = makeFakeRes();
      const next = jest.fn() as NextFunction;

      middleware.use(req as Request, res as Response, next);

      expect(req.headers['x-correlation-id']).toBe('prop-001');
      expect(req.headers['x-request-id']).toBe('prop-001');
    });

    it('ensures response x-correlation-id matches the incoming header', () => {
      const req = makeFakeRequest({ correlationId: 'match-me' });
      const res = makeFakeRes();
      const next = jest.fn() as NextFunction;

      middleware.use(req as Request, res as Response, next);

      expect(res.setHeader).toHaveBeenCalledWith('x-correlation-id', 'match-me');
      expect(res.setHeader).toHaveBeenCalledWith('x-request-id', 'match-me');
    });
  });
});
