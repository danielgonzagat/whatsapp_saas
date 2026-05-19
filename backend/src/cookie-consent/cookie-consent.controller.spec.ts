import { CookieConsentController } from './cookie-consent.controller';
import { CookieConsentService } from './cookie-consent.service';
import type { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';

describe('CookieConsentController', () => {
  let consentService: {
    normalize: jest.Mock;
    parseCookieValue: jest.Mock;
    serializeCookieValue: jest.Mock;
    getForAgent: jest.Mock;
    saveForAgent: jest.Mock;
  };
  let jwtService: {
    verifyAsync: jest.Mock;
  };
  let controller: CookieConsentController;
  let mockResponse: {
    cookie: jest.Mock;
  };

  const mockConsent = {
    necessary: true,
    analytics: true,
    marketing: false,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    consentService = {
      normalize: jest.fn(),
      parseCookieValue: jest.fn().mockReturnValue(null),
      serializeCookieValue: jest.fn().mockReturnValue('{}'),
      getForAgent: jest.fn(),
      saveForAgent: jest.fn(),
    };

    jwtService = {
      verifyAsync: jest.fn(),
    };

    mockResponse = {
      cookie: jest.fn(),
    };

    controller = new CookieConsentController(
      consentService as never,
      jwtService as never as JwtService,
    );
  });

  describe('getConsent', () => {
    it('returns consent from agent when JWT token is valid and agent has consent', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'agent-1' });
      consentService.getForAgent.mockResolvedValue(mockConsent);
      consentService.serializeCookieValue.mockReturnValue(JSON.stringify(mockConsent));

      const req = {
        headers: { authorization: 'Bearer valid-token' },
        cookies: {},
      } as never as Request;

      const result = await controller.getConsent(req, mockResponse as never as Response);

      expect(result).toEqual({ consent: mockConsent });
      expect(jwtService.verifyAsync).toHaveBeenCalledWith('valid-token');
      expect(consentService.getForAgent).toHaveBeenCalledWith('agent-1');
      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'kloel_consent',
        JSON.stringify(mockConsent),
        expect.objectContaining({ httpOnly: true }),
      );
    });

    it('returns null consent when no JWT token and no cookie value', async () => {
      consentService.parseCookieValue.mockReturnValue(null);

      const req = {
        headers: {},
        cookies: {},
      } as never as Request;

      const result = await controller.getConsent(req, mockResponse as never as Response);

      expect(result).toEqual({ consent: null });
    });

    it('parses cookie value when no JWT token but cookie is present', async () => {
      const cookieValue = JSON.stringify({ analytics: true });
      consentService.parseCookieValue.mockReturnValue({
        necessary: true,
        analytics: true,
        marketing: false,
        updatedAt: '2026-01-01T00:00:00.000Z',
      });

      const req = {
        headers: {},
        cookies: { kloel_consent: cookieValue },
      } as never as Request;

      const result = await controller.getConsent(req, mockResponse as never as Response);

      expect(result.consent).toEqual({
        necessary: true,
        analytics: true,
        marketing: false,
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
      expect(consentService.parseCookieValue).toHaveBeenCalledWith(cookieValue);
    });

    it('returns null consent when JWT verification fails', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('expired'));

      const req = {
        headers: { authorization: 'Bearer expired-token' },
        cookies: {},
      } as never as Request;

      const result = await controller.getConsent(req, mockResponse as never as Response);

      // JWT fails, no cookie value → parseCookieValue(null) → null
      expect(result.consent).toBeNull();
    });

    it('extracts token from cookie when Bearer header is absent', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'agent-cookie' });
      consentService.getForAgent.mockResolvedValue(mockConsent);
      consentService.serializeCookieValue.mockReturnValue(JSON.stringify(mockConsent));

      const req = {
        headers: {},
        cookies: { kloel_access_token: 'cookie-token' },
      } as never as Request;

      const result = await controller.getConsent(req, mockResponse as never as Response);

      expect(jwtService.verifyAsync).toHaveBeenCalledWith('cookie-token');
      expect(result.consent).toEqual(mockConsent);
    });

    it('extracts token from kloel_token fallback cookie', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'agent-cookie' });
      consentService.getForAgent.mockResolvedValue(mockConsent);
      consentService.serializeCookieValue.mockReturnValue(JSON.stringify(mockConsent));

      const req = {
        headers: {},
        cookies: { kloel_token: 'fallback-token' },
      } as never as Request;

      const result = await controller.getConsent(req, mockResponse as never as Response);

      expect(jwtService.verifyAsync).toHaveBeenCalledWith('fallback-token');
      expect(result.consent).toEqual(mockConsent);
    });

    it('handles agent existing but consent record null', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'agent-1' });
      consentService.getForAgent.mockResolvedValue(null);

      const req = {
        headers: { authorization: 'Bearer valid-token' },
        cookies: {},
      } as never as Request;

      const result = await controller.getConsent(req, mockResponse as never as Response);

      // No consent found → no cookie set, return { consent: null }
      expect(result).toEqual({ consent: null });
      expect(mockResponse.cookie).not.toHaveBeenCalled();
    });
  });

  describe('saveConsent', () => {
    it('saves consent for authenticated agent', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'agent-1' });
      consentService.saveForAgent.mockResolvedValue(mockConsent);
      consentService.serializeCookieValue.mockReturnValue(JSON.stringify(mockConsent));

      const req = {
        headers: { authorization: 'Bearer valid-token' },
        cookies: {},
      } as never as Request;
      const body = { analytics: true, marketing: false };

      const result = await controller.saveConsent(req, mockResponse as never as Response, body);

      expect(result).toEqual({ success: true, consent: mockConsent });
      expect(consentService.saveForAgent).toHaveBeenCalledWith('agent-1', body);
      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'kloel_consent',
        JSON.stringify(mockConsent),
        expect.objectContaining({ httpOnly: true }),
      );
    });

    it('returns normalized consent when no JWT token provided', async () => {
      consentService.normalize.mockReturnValue(mockConsent);
      consentService.serializeCookieValue.mockReturnValue(JSON.stringify(mockConsent));

      const req = {
        headers: {},
        cookies: {},
      } as never as Request;
      const body = { analytics: true };

      const result = await controller.saveConsent(req, mockResponse as never as Response, body);

      expect(result.success).toBe(true);
      expect(consentService.normalize).toHaveBeenCalledWith(body);
      expect(consentService.saveForAgent).not.toHaveBeenCalled();
      expect(mockResponse.cookie).toHaveBeenCalled();
    });

    it('normalizes null body for anonymous users', async () => {
      consentService.normalize.mockReturnValue({
        necessary: true,
        analytics: false,
        marketing: false,
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
      consentService.serializeCookieValue.mockReturnValue('{}');

      const req = {
        headers: {},
        cookies: {},
      } as never as Request;

      const result = await controller.saveConsent(req, mockResponse as never as Response, null);

      expect(result.success).toBe(true);
      expect(consentService.normalize).toHaveBeenCalledWith(null);
    });

    it('propagates saveForAgent errors', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'agent-1' });
      consentService.saveForAgent.mockRejectedValue(new Error('DB write failed'));

      const req = {
        headers: { authorization: 'Bearer valid-token' },
        cookies: {},
      } as never as Request;

      await expect(
        controller.saveConsent(req, mockResponse as never as Response, { analytics: true }),
      ).rejects.toThrow('DB write failed');
    });

    it('handles JWT with empty sub gracefully by falling back to cookie consent', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: '' });
      consentService.normalize.mockReturnValue(mockConsent);
      consentService.serializeCookieValue.mockReturnValue(JSON.stringify(mockConsent));

      const req = {
        headers: { authorization: 'Bearer token-no-sub' },
        cookies: {},
      } as never as Request;

      const result = await controller.saveConsent(req, mockResponse as never as Response, {
        analytics: true,
      });

      // sub is empty string → resolveAgentId returns null → normalize path
      expect(result.success).toBe(true);
      expect(consentService.normalize).toHaveBeenCalled();
      expect(consentService.saveForAgent).not.toHaveBeenCalled();
    });
  });
});
