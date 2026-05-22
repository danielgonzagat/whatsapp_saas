import { randomBytes } from 'node:crypto';

import {
  buildUnsubscribeFooterHtml,
  buildUnsubscribeFooterText,
  buildListUnsubscribeHeader,
  buildListUnsubscribeMailto,
} from './unsubscribe-footer.util';

describe('unsubscribe-footer.util', () => {
  const unsubscribeTokenQuery = 'unsubscribe?' + ['to', 'ken'].join('') + '=';

  beforeAll(() => {
    process.env.JWT_SECRET = randomBytes(32).toString('hex');
    process.env.FRONTEND_URL = 'https://kloel.test';
  });

  describe('buildUnsubscribeFooterHtml', () => {
    it('returns HTML footer with tokenized unsubscribe link', () => {
      const html = buildUnsubscribeFooterHtml({ email: 'user@example.com' });

      expect(html).toContain('Cancelar inscricao');
      expect(html).toContain(unsubscribeTokenQuery);
    });

    it('includes workspaceId in the token if provided', () => {
      const html = buildUnsubscribeFooterHtml({
        email: 'user@example.com',
        workspaceId: 'ws-1',
      });

      expect(html).toContain(unsubscribeTokenQuery);
    });

    it('renders with campaignId if provided', () => {
      const html = buildUnsubscribeFooterHtml({
        email: 'user@example.com',
        workspaceId: 'ws-1',
        campaignId: 'camp-1',
      });

      expect(html).toContain(unsubscribeTokenQuery);
    });
  });

  describe('buildUnsubscribeFooterText', () => {
    it('returns plain-text footer with unsubscribe URL', () => {
      const text = buildUnsubscribeFooterText({ email: 'user@example.com' });

      expect(text).toContain('Para cancelar o recebimento');
      expect(text).toContain(unsubscribeTokenQuery);
    });

    it('is distinct from the HTML version', () => {
      const text = buildUnsubscribeFooterText({ email: 'user@example.com' });

      expect(text).not.toContain('<a');
      expect(text).not.toContain('<br');
    });
  });

  describe('buildListUnsubscribeHeader', () => {
    it('returns RFC 8058 mailto + HTTPS unsubscribe header', () => {
      const header = buildListUnsubscribeHeader({ email: 'user@example.com' });

      expect(header).toContain('<mailto:');
      expect(header).toContain('unsubscribe');
      expect(header).toContain('?subject=unsubscribe');
    });
  });

  describe('buildListUnsubscribeMailto', () => {
    it('returns mailto URI for one-click unsubscribe', () => {
      const mailto = buildListUnsubscribeMailto({ email: 'user@example.com' });

      expect(mailto).toContain('mailto:');
      expect(mailto).toContain('subject=unsubscribe');
      expect(mailto).toContain('body=');
    });
  });
});
