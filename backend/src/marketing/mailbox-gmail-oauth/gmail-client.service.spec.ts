jest.mock('../../logging/structured-logger', () => ({
  StructuredLogger: {
    from: jest.fn().mockReturnValue({
      warn: jest.fn(),
    }),
  },
}));

jest.mock('../mailbox-token-crypto', () => ({
  decryptMailboxToken: jest.fn(),
  encryptMailboxToken: jest.fn(),
}));

jest.mock('./config-resolver', () => ({
  requireClientId: jest.fn().mockReturnValue('test-client-id'),
  requireClientSecret: jest.fn().mockReturnValue('test-client-secret'),
  resolveRedirectUri: jest.fn().mockReturnValue('http://localhost:3000/callback'),
}));

import { BadRequestException } from '@nestjs/common';
import { decryptMailboxToken, encryptMailboxToken } from '../mailbox-token-crypto';
import { GmailClientService } from './gmail-client.service';
import type { GmailMailboxRecord } from './types';

const fakeMailboxUpdate = jest.fn();

describe('GmailClientService', () => {
  let service: GmailClientService;

  beforeEach(() => {
    jest.clearAllMocks();

    (decryptMailboxToken as jest.Mock).mockReset();
    (encryptMailboxToken as jest.Mock).mockReset();
    fakeMailboxUpdate.mockResolvedValue({});

    service = new GmailClientService(
      {
        mailboxConnection: { update: fakeMailboxUpdate },
      } as never,
      { get: jest.fn() } as never,
    );

    global.fetch = jest.fn();
  });

  describe('exchangeCode', () => {
    it('exchanges authorization code for token response', async () => {
      const mockResponse = {
        access_token: 'ya29.test-access-token',
        refresh_token: '1//test-refresh-token',
        expires_in: 3599,
        scope: 'gmail.readonly gmail.send',
        token_type: 'Bearer',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await service.exchangeCode('auth-code-123');

      expect(result.access_token).toBe('ya29.test-access-token');
      expect(result.refresh_token).toBe('1//test-refresh-token');
      expect(result.expires_in).toBe(3599);
      expect(result.token_type).toBe('Bearer');
    });

    it('throws BadRequestException when code is empty', async () => {
      const promise = service.exchangeCode('');
      await expect(promise).rejects.toThrow(BadRequestException);
      await expect(promise).rejects.toThrow('gmail_oauth_code_required');
    });

    it('throws BadRequestException on 4xx token exchange failure', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'invalid_grant', error_description: 'Malformed auth code.' }),
      });

      const promise = service.exchangeCode('bad-code');
      await expect(promise).rejects.toThrow(BadRequestException);
      await expect(promise).rejects.toThrow('gmail_token_exchange_failed');
    });
  });

  describe('fetchUserInfo', () => {
    it('returns user profile information from Google', async () => {
      const mockProfile = {
        id: '1234567890',
        email: 'test@gmail.com',
        verified_email: true,
        name: 'Test User',
        picture: 'https://lh3.googleusercontent.com/photo.jpg',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockProfile,
      });

      const result = await service.fetchUserInfo('ya29.test-access');

      expect(result.id).toBe('1234567890');
      expect(result.email).toBe('test@gmail.com');
      expect(result.verified_email).toBe(true);
      expect(result.name).toBe('Test User');
    });

    it('throws BadRequestException on userinfo failure', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Invalid Credentials' } }),
      });

      const promise = service.fetchUserInfo('expired-token');
      await expect(promise).rejects.toThrow(BadRequestException);
      await expect(promise).rejects.toThrow('gmail_profile_lookup_failed');
    });
  });

  describe('resolveAccessToken', () => {
    const connection: GmailMailboxRecord = {
      id: 'conn-test-1',
      workspaceId: 'ws-test-1',
      email: 'user@gmail.com',
      accessToken: 'encrypted-access-token',
      refreshToken: 'encrypted-refresh-token',
      expiresAt: new Date(Date.now() + 3_600_000),
      metadata: null,
    };

    it('returns cached access token when decrypted and still usable', async () => {
      (decryptMailboxToken as jest.Mock).mockReturnValue('ya29.cached-token');

      const result = await service.resolveAccessToken(connection);

      expect(result).toBe('ya29.cached-token');
      expect(decryptMailboxToken).toHaveBeenCalledWith('encrypted-access-token');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('refreshes access token when cache is stale and persists result', async () => {
      let decryptCall = 0;
      (decryptMailboxToken as jest.Mock).mockImplementation(() => {
        decryptCall++;
        return decryptCall === 2 ? 'ya29.fresh-refresh-token' : null;
      });
      (encryptMailboxToken as jest.Mock).mockReturnValue('encrypted-new-access');
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'ya29.new-access-token',
          expires_in: 3600,
        }),
      });

      const result = await service.resolveAccessToken(connection);

      expect(result).toBe('ya29.new-access-token');
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(encryptMailboxToken).toHaveBeenCalledWith('ya29.new-access-token');
      expect(fakeMailboxUpdate).toHaveBeenCalledTimes(1);
    });

    it('throws and marks connection as ERROR on refresh failure', async () => {
      let decryptCall = 0;
      (decryptMailboxToken as jest.Mock).mockImplementation(() => {
        decryptCall++;
        return decryptCall === 2 ? 'ya29.fresh-refresh-token' : null;
      });
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'invalid_grant' }),
      });

      const promise = service.resolveAccessToken(connection);
      await expect(promise).rejects.toThrow(BadRequestException);
      await expect(promise).rejects.toThrow('gmail_refresh_failed');

      expect(fakeMailboxUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'conn-test-1', workspaceId: 'ws-test-1' },
          data: expect.objectContaining({
            lastError: 'gmail_refresh_failed',
            status: 'ERROR',
          }),
        }),
      );
    });
  });

  describe('tokenStillUsable', () => {
    it('returns true when expiresAt is null', () => {
      expect(service.tokenStillUsable(null)).toBe(true);
    });

    it('returns true when token expires more than 60s from now', () => {
      const future = new Date(Date.now() + 120_000);
      expect(service.tokenStillUsable(future)).toBe(true);
    });

    it('returns false when token expires within 60s', () => {
      const soon = new Date(Date.now() + 30_000);
      expect(service.tokenStillUsable(soon)).toBe(false);
    });

    it('returns false when token has already expired', () => {
      const past = new Date(Date.now() - 1_000);
      expect(service.tokenStillUsable(past)).toBe(false);
    });
  });
});
