import {
  INVITABLE_PARTNER_TYPES,
  PARTNER_ROLE_LABELS,
  buildPartnerInviteUrl,
  getPartnerRoleLabel,
} from './partnerships.invite.helpers';

describe('partnerships.invite.helpers', () => {
  describe('INVITABLE_PARTNER_TYPES', () => {
    it('contains the four canonical invitable partner types', () => {
      expect(INVITABLE_PARTNER_TYPES.has('AFFILIATE')).toBe(true);
      expect(INVITABLE_PARTNER_TYPES.has('SUPPLIER')).toBe(true);
      expect(INVITABLE_PARTNER_TYPES.has('COPRODUCER')).toBe(true);
      expect(INVITABLE_PARTNER_TYPES.has('MANAGER')).toBe(true);
    });

    it('excludes PRODUCER (own workspace already has access)', () => {
      expect(INVITABLE_PARTNER_TYPES.has('PRODUCER')).toBe(false);
    });

    it('excludes unknown partner types', () => {
      expect(INVITABLE_PARTNER_TYPES.has('UNKNOWN')).toBe(false);
      expect(INVITABLE_PARTNER_TYPES.has('')).toBe(false);
    });
  });

  describe('PARTNER_ROLE_LABELS', () => {
    it('maps every known partner type to a Portuguese label', () => {
      expect(PARTNER_ROLE_LABELS.AFFILIATE).toBe('afiliado');
      expect(PARTNER_ROLE_LABELS.SUPPLIER).toBe('fornecedor');
      expect(PARTNER_ROLE_LABELS.COPRODUCER).toBe('coprodutor');
      expect(PARTNER_ROLE_LABELS.MANAGER).toBe('gerente');
      expect(PARTNER_ROLE_LABELS.PRODUCER).toBe('produtor');
    });
  });

  describe('getPartnerRoleLabel', () => {
    it('returns the canonical label for known types', () => {
      expect(getPartnerRoleLabel('AFFILIATE')).toBe('afiliado');
      expect(getPartnerRoleLabel('SUPPLIER')).toBe('fornecedor');
    });

    it('falls back to "parceiro" for unknown types', () => {
      expect(getPartnerRoleLabel('UNKNOWN')).toBe('parceiro');
    });

    it('falls back to "parceiro" for the empty string', () => {
      expect(getPartnerRoleLabel('')).toBe('parceiro');
    });
  });

  describe('buildPartnerInviteUrl', () => {
    const baseParams = {
      inviteToken: 'tok-123',
      partnerEmail: 'partner@example.com',
      partnerName: 'Partner Person',
      workspaceName: 'Acme Workspace',
    };

    it('produces a /register URL with all four query parameters', () => {
      const url = new URL(
        buildPartnerInviteUrl({ ...baseParams, frontendUrl: 'https://app.kloel.com' }),
      );

      expect(url.origin).toBe('https://app.kloel.com');
      expect(url.pathname).toBe('/register');
      expect(url.searchParams.get('affiliateInviteToken')).toBe('tok-123');
      expect(url.searchParams.get('email')).toBe('partner@example.com');
      expect(url.searchParams.get('partnerName')).toBe('Partner Person');
      expect(url.searchParams.get('inviterWorkspaceName')).toBe('Acme Workspace');
    });

    it('falls back to localhost:3000 when frontendUrl is omitted', () => {
      const url = new URL(buildPartnerInviteUrl(baseParams));
      expect(url.origin).toBe('http://localhost:3000');
    });

    it('falls back to localhost:3000 when frontendUrl is the empty string', () => {
      const url = new URL(buildPartnerInviteUrl({ ...baseParams, frontendUrl: '' }));
      expect(url.origin).toBe('http://localhost:3000');
    });

    it('URL-encodes values with reserved characters', () => {
      const url = new URL(
        buildPartnerInviteUrl({
          ...baseParams,
          partnerName: 'Name & Spaces',
          workspaceName: 'Workspace ?=',
          frontendUrl: 'https://app.kloel.com',
        }),
      );

      expect(url.searchParams.get('partnerName')).toBe('Name & Spaces');
      expect(url.searchParams.get('inviterWorkspaceName')).toBe('Workspace ?=');
    });
  });
});
