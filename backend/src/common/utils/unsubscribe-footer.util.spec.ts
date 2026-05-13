import {
  buildUnsubscribeFooterHtml,
  buildUnsubscribeFooterText,
  buildListUnsubscribeHeader,
  buildListUnsubscribeMailto,
} from './unsubscribe-footer.util';

describe('unsubscribe-footer.util', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-footer-tests';
    process.env.FRONTEND_URL = 'https://kloel.test';
  });

  describe('buildUnsubscribeFooterHtml', () => {
    it('returns HTML footer with tokenized unsubscribe link', () => {
      const html = buildUnsubscribeFooterHtml({ email: 'user@example.com' });

      expect(html).toContain('Cancelar inscricao');
      expect(html).toContain('unsubscribe?token=');
    });

    it('includes workspaceId in the token if provided', () => {
      const html = buildUnsubscribeFooterHtml({
        email: 'user@example.com',
        workspaceId: 'ws-1',
      });

      expect(html).toContain('unsubscribe?token=');
    });

    it('renders with campaignId if provided', () => {
      const html = buildUnsubscribeFooterHtml({
        email: 'user@example.com',
        workspaceId: 'ws-1',
        campaignId: 'camp-1',
      });

      expect(html).toContain('unsubscribe?token=');
    });
  });

  describe('buildUnsubscribeFooterText', () => {
    it('returns plain-text footer with unsubscribe URL', () => {
      const text = buildUnsubscribeFooterText({ email: 'user@example.com' });

      expect(text).toContain('Para cancelar o recebimento');
      expect(text).toContain('unsubscribe?token=');
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
