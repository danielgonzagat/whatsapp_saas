import type { CookieOptions, Response } from 'express';
import type { AuthenticatedRequest } from '../common/interfaces';
import {
  KLOEL_TOKEN_COOKIE,
  NOT_AUTHENTICATED_MESSAGE,
  buildAuthCookieOptions,
  hasReferralCode,
  ipSpread,
  isConflictStatus,
  maskEmailForSentry,
  requireAgentId,
  setAuthCookie,
} from './auth.controller.helpers';

describe('auth.controller.helpers', () => {
  describe('buildAuthCookieOptions', () => {
    const previousNodeEnv = process.env.NODE_ENV;

    afterEach(() => {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
    });

    it('returns httpOnly + sameSite=lax + path=/ baseline', () => {
      process.env.NODE_ENV = 'development';
      const opts = buildAuthCookieOptions();
      expect(opts.httpOnly).toBe(true);
      expect(opts.sameSite).toBe('lax');
      expect(opts.path).toBe('/');
      expect(typeof opts.maxAge).toBe('number');
    });

    it('sets secure=true only when NODE_ENV === production', () => {
      process.env.NODE_ENV = 'production';
      const prodOpts = buildAuthCookieOptions();
      expect(prodOpts.secure).toBe(true);

      process.env.NODE_ENV = 'development';
      const devOpts = buildAuthCookieOptions();
      expect(devOpts.secure).toBe(false);
    });

    it('uses a positive maxAge in milliseconds', () => {
      const opts = buildAuthCookieOptions();
      expect(opts.maxAge).toBeGreaterThan(0);
    });
  });

  describe('setAuthCookie', () => {
    function makeRes(): { res: Response; cookie: jest.Mock } {
      const cookie = jest.fn();
      return { res: { cookie } as unknown as Response, cookie };
    }

    it('persists the cookie under KLOEL_TOKEN_COOKIE with canonical options', () => {
      const { res, cookie } = makeRes();
      setAuthCookie(res, 'token-abc');
      expect(cookie).toHaveBeenCalledTimes(1);
      const call = cookie.mock.calls[0] as [string, string, CookieOptions];
      expect(call[0]).toBe(KLOEL_TOKEN_COOKIE);
      expect(call[1]).toBe('token-abc');
      expect(call[2].httpOnly).toBe(true);
      expect(call[2].path).toBe('/');
    });

    it('no-ops when token is missing', () => {
      const { res, cookie } = makeRes();
      setAuthCookie(res, undefined);
      setAuthCookie(res, null);
      setAuthCookie(res, '');
      expect(cookie).not.toHaveBeenCalled();
    });
  });

  describe('ipSpread', () => {
    it('returns empty object when ip is undefined', () => {
      expect(ipSpread(undefined)).toEqual({});
    });

    it('returns { ip } when ip is provided (including empty string)', () => {
      expect(ipSpread('1.2.3.4')).toEqual({ ip: '1.2.3.4' });
      expect(ipSpread('')).toEqual({ ip: '' });
    });
  });

  describe('maskEmailForSentry', () => {
    it('keeps the first three characters and masks the rest', () => {
      expect(maskEmailForSentry('daniel@example.com')).toBe('dan***');
    });

    it('handles empty/undefined/null inputs', () => {
      expect(maskEmailForSentry(undefined)).toBe('***');
      expect(maskEmailForSentry(null)).toBe('***');
      expect(maskEmailForSentry('')).toBe('***');
    });

    it('handles short inputs without throwing', () => {
      expect(maskEmailForSentry('a')).toBe('a***');
      expect(maskEmailForSentry('ab')).toBe('ab***');
    });

    it('trims whitespace before masking', () => {
      expect(maskEmailForSentry('  hello@x.io')).toBe('hel***');
    });
  });

  describe('requireAgentId', () => {
    function reqWith(sub: string | undefined): AuthenticatedRequest {
      return { user: sub === undefined ? undefined : { sub } } as unknown as AuthenticatedRequest;
    }

    it('returns the agent id when present', () => {
      expect(requireAgentId(reqWith('agent-1'))).toBe('agent-1');
    });

    it('throws when user.sub is empty', () => {
      expect(() => requireAgentId(reqWith(''))).toThrow(NOT_AUTHENTICATED_MESSAGE);
    });

    it('throws when user is missing entirely', () => {
      expect(() => requireAgentId({} as AuthenticatedRequest)).toThrow(NOT_AUTHENTICATED_MESSAGE);
    });
  });

  describe('isConflictStatus', () => {
    it('returns true for plain { status: 409 }', () => {
      expect(isConflictStatus({ status: 409 })).toBe(true);
    });

    it('returns false for other status values', () => {
      expect(isConflictStatus({ status: 400 })).toBe(false);
      expect(isConflictStatus({ status: 500 })).toBe(false);
    });

    it('returns false for null/undefined/other shapes', () => {
      expect(isConflictStatus(null)).toBe(false);
      expect(isConflictStatus(undefined)).toBe(false);
      expect(isConflictStatus('boom')).toBe(false);
      expect(isConflictStatus({})).toBe(false);
    });
  });

  describe('hasReferralCode', () => {
    it('returns true when body has a truthy referralCode', () => {
      expect(hasReferralCode({ referralCode: 'ABC123' })).toBe(true);
    });

    it('returns false for empty referralCode', () => {
      expect(hasReferralCode({ referralCode: '' })).toBe(false);
      expect(hasReferralCode({ referralCode: null })).toBe(false);
      expect(hasReferralCode({ referralCode: undefined })).toBe(false);
    });

    it('returns false when body is not an object', () => {
      expect(hasReferralCode(null)).toBe(false);
      expect(hasReferralCode(undefined)).toBe(false);
      expect(hasReferralCode('referralCode')).toBe(false);
      expect(hasReferralCode(42)).toBe(false);
    });
  });
});
