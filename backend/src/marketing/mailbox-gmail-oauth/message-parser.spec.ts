import {
  readHeader,
  parseFromHeader,
  decodeGmailBody,
  extractTextBody,
  normalizeGmailMessage,
} from './message-parser';

describe('message-parser', () => {
  describe('readHeader', () => {
    it('returns the value of a named header case-insensitively', () => {
      const headers = [
        { name: 'From', value: 'User <user@example.com>' },
        { name: 'Subject', value: 'Hello' },
      ];
      expect(readHeader(headers, 'from')).toBe('User <user@example.com>');
      expect(readHeader(headers, 'Subject')).toBe('Hello');
    });

    it('returns empty string for missing headers', () => {
      expect(readHeader([], 'from')).toBe('');
    });
  });

  describe('parseFromHeader', () => {
    it('parses name and email from "Name <email>" format', () => {
      const result = parseFromHeader('John Doe <john@example.com>');
      expect(result).toEqual({ name: 'John Doe', email: 'john@example.com' });
    });

    it('parses email only without name', () => {
      const result = parseFromHeader('<john@example.com>');
      expect(result).toEqual({ name: null, email: 'john@example.com' });
    });

    it('parses raw email without angle brackets', () => {
      const result = parseFromHeader('john@example.com');
      expect(result).toEqual({ name: null, email: 'john@example.com' });
    });

    it('returns empty email for invalid input', () => {
      const result = parseFromHeader('');
      expect(result).toEqual({ name: null, email: '' });
    });

    it('returns lowercase email', () => {
      const result = parseFromHeader('JOHN@EXAMPLE.COM');
      expect(result.email).toBe('john@example.com');
    });
  });

  describe('decodeGmailBody', () => {
    it('decodes base64url-encoded utf8 text', () => {
      const encoded = Buffer.from('Hello World').toString('base64url');
      const result = decodeGmailBody(encoded);
      expect(result).toBe('Hello World');
    });

    it('handles - and _ characters (URL-safe base64)', () => {
      const encoded = Buffer.from('test-data').toString('base64url');
      const result = decodeGmailBody(encoded);
      expect(result).toBe('test-data');
    });
  });

  describe('extractTextBody', () => {
    it('extracts text from text/plain part', () => {
      const data = Buffer.from('plain text body').toString('base64url');
      const part = { mimeType: 'text/plain', body: { data } };
      expect(extractTextBody(part)).toBe('plain text body');
    });

    it('extracts text from nested multipart', () => {
      const data = Buffer.from('inner text').toString('base64url');
      const part = {
        mimeType: 'multipart/alternative',
        parts: [{ mimeType: 'text/plain', body: { data } }],
      };
      expect(extractTextBody(part)).toBe('inner text');
    });

    it('returns empty string for undefined part', () => {
      expect(extractTextBody(undefined)).toBe('');
    });

    it('falls back to stripping HTML tags when only text/html available', () => {
      const data = Buffer.from('<p>Hello <b>World</b></p>').toString('base64url');
      const part = { mimeType: 'text/html', body: { data } };
      expect(extractTextBody(part)).toBe('Hello World');
    });
  });

  describe('normalizeGmailMessage', () => {
    const connection = {
      id: 'mb-1',
      workspaceId: 'ws-1',
      email: 'owner@example.com',
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      metadata: null,
    };

    it('normalizes a full Gmail message with from, subject, and plain text', () => {
      const textData = Buffer.from('Message body').toString('base64url');
      const message = {
        id: 'msg-1',
        threadId: 'thread-1',
        historyId: '123',
        snippet: 'Message...',
        payload: {
          headers: [
            { name: 'From', value: 'Sender <sender@example.com>' },
            { name: 'Subject', value: 'Test Subject' },
          ],
          mimeType: 'text/plain',
          body: { data: textData },
        },
      };

      const result = normalizeGmailMessage(connection, message);

      expect(result).toEqual(
        expect.objectContaining({
          workspaceId: 'ws-1',
          channel: 'EMAIL',
          externalId: 'gmail:msg-1',
          from: 'sender@example.com',
          fromName: 'Sender',
          content: expect.stringContaining('Test Subject'),
          metadata: expect.objectContaining({
            provider: 'gmail',
            mailboxConnectionId: 'mb-1',
          }),
        }),
      );
    });

    it('falls back to snippet when no body parts', () => {
      const message = {
        id: 'msg-2',
        snippet: 'Snippet text',
        payload: { headers: [{ name: 'From', value: 'a@b.com' }] },
      };

      const result = normalizeGmailMessage(connection, message);
      expect(result.content).toBe('Snippet text');
    });
  });
});
