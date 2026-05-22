import { buildRawMimeMessage, encodeHeader } from './mime-builder';

describe('mime-builder', () => {
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'FRONTEND_URL') return 'https://app.kloel.test';
      return undefined;
    }),
  };

  describe('encodeHeader', () => {
    it('returns ASCII value unchanged', () => {
      expect(encodeHeader('Hello World')).toBe('Hello World');
    });

    it('encodes non-ASCII value with RFC 2047', () => {
      const result = encodeHeader('Olá Mundo');
      expect(result).toMatch(/^=\?UTF-8\?B\?/);
      const decoded = Buffer.from(
        result.replace(/^=\?UTF-8\?B\?/, '').replace(/\?=$/, ''),
        'base64',
      ).toString('utf8');
      expect(decoded).toBe('Olá Mundo');
    });
  });

  describe('buildRawMimeMessage', () => {
    it('builds a valid base64url MIME message with required headers', () => {
      const raw = buildRawMimeMessage(
        {
          fromEmail: 'owner@example.com',
          toEmail: 'lead@example.com',
          subject: 'Test Subject',
          html: '<p>Body</p>',
          proactive: true,
        },
        config as never,
      );

      const decoded = Buffer.from(raw, 'base64url').toString('utf8');
      expect(decoded).toContain('From: owner@example.com');
      expect(decoded).toContain('To: lead@example.com');
      expect(decoded).toContain('Subject: Test Subject');
      expect(decoded).toContain('MIME-Version: 1.0');
      expect(decoded).toContain('Content-Type: text/html; charset=UTF-8');
      expect(decoded).toContain('<p>Body</p>');
    });

    it('includes List-Unsubscribe header when proactive', () => {
      const raw = buildRawMimeMessage(
        {
          fromEmail: 'owner@example.com',
          toEmail: 'lead@example.com',
          subject: 'Sub',
          html: '<p>B</p>',
          proactive: true,
        },
        config as never,
      );

      const decoded = Buffer.from(raw, 'base64url').toString('utf8');
      expect(decoded).toContain(
        'List-Unsubscribe: <https://app.kloel.test/email/unsubscribe?email=lead%40example.com>',
      );
    });

    it('omits List-Unsubscribe header when not proactive', () => {
      const raw = buildRawMimeMessage(
        {
          fromEmail: 'owner@example.com',
          toEmail: 'lead@example.com',
          subject: 'Sub',
          html: '<p>B</p>',
          proactive: false,
        },
        config as never,
      );

      const decoded = Buffer.from(raw, 'base64url').toString('utf8');
      expect(decoded).not.toContain('List-Unsubscribe');
    });

    it('returns valid base64url without trailing =', () => {
      const raw = buildRawMimeMessage(
        {
          fromEmail: 'a@b.com',
          toEmail: 'c@d.com',
          subject: 'S',
          html: '<p>B</p>',
          proactive: false,
        },
        config as never,
      );

      expect(raw).not.toMatch(/=$/);
      expect(() => Buffer.from(raw, 'base64url').toString('utf8')).not.toThrow();
    });
  });
});
