import {
  applyAffiliateConfig,
  buildAffiliateConfigMessage,
  buildBillingStatusResponse,
  buildBusinessHoursPayload,
  buildBusinessProviderSettings,
  buildCampaignContactFilter,
  buildListLeadsWhere,
  buildSaveBusinessInfoMessage,
  buildSocialChannelsView,
  canonicalPlan,
  documentTypeLabel,
  extractFiscalFields,
  mapLeadDetail,
  mapLeadListRow,
  normalizeConnectableChannel,
  sanitizeLeadQuery,
  validatePlanInput,
} from './kloel-business-config-tools.helpers';

describe('kloel-business-config-tools.helpers', () => {
  describe('sanitizeLeadQuery', () => {
    it('strips known prefixes', () => {
      expect(sanitizeLeadQuery('busca lead Maria')).toBe('Maria');
      expect(sanitizeLeadQuery('procura cliente João')).toBe('João');
      expect(sanitizeLeadQuery('Pesquisa COMPRADORA Ana')).toBe('Ana');
    });
    it('returns empty for non-strings', () => {
      expect(sanitizeLeadQuery(123)).toBe('');
      expect(sanitizeLeadQuery(undefined)).toBe('');
      expect(sanitizeLeadQuery(null)).toBe('');
    });
    it('preserves unprefixed input', () => {
      expect(sanitizeLeadQuery('  Maria  ')).toBe('Maria');
    });
  });

  describe('buildListLeadsWhere', () => {
    it('always enforces workspaceId', () => {
      const w = buildListLeadsWhere('ws-1', {});
      expect(w.workspaceId).toBe('ws-1');
    });
    it('maps hot/qualified to leadScore gte 70', () => {
      expect(buildListLeadsWhere('w', { status: 'hot' }).leadScore).toEqual({ gte: 70 });
      expect(buildListLeadsWhere('w', { status: 'qualified' }).leadScore).toEqual({ gte: 70 });
    });
    it('maps cold to leadScore lt 30', () => {
      expect(buildListLeadsWhere('w', { status: 'cold' }).leadScore).toEqual({ lt: 30 });
    });
    it('adds case-insensitive name filter when query present', () => {
      const w = buildListLeadsWhere('w', { query: 'busca lead Maria' });
      expect(w.name).toEqual({ contains: 'Maria', mode: 'insensitive' });
    });
    it('skips name filter when query is non-string or whitespace only', () => {
      expect(buildListLeadsWhere('w', { query: '   ' }).name).toBeUndefined();
      expect(buildListLeadsWhere('w', {}).name).toBeUndefined();
    });
  });

  describe('mapLeadListRow', () => {
    it('substitutes default name when missing', () => {
      const row = {
        id: 'c1',
        name: null,
        phone: '+5511',
        leadScore: null,
        sentiment: null,
        createdAt: new Date(0),
        updatedAt: new Date(1),
      };
      expect(mapLeadListRow(row).name).toBe('Sem nome');
      expect(mapLeadListRow(row).score).toBe(0);
    });
    it('passes through phone and score', () => {
      const row = {
        id: 'c1',
        name: 'A',
        phone: '+551199',
        leadScore: 80,
        sentiment: 'pos',
        createdAt: new Date(0),
        updatedAt: new Date(1),
      };
      expect(mapLeadListRow(row)).toMatchObject({ phone: '+551199', score: 80, sentiment: 'pos' });
    });
  });

  describe('mapLeadDetail', () => {
    it('truncates recent message content to 100 chars', () => {
      const long = 'x'.repeat(200);
      const r = mapLeadDetail({
        id: 'c',
        name: 'n',
        phone: 'p',
        email: 'e',
        sentiment: null,
        leadScore: 10,
        tags: [{ name: 'vip' }],
        conversations: [{ messages: [{ content: long, direction: 'IN', createdAt: new Date(0) }] }],
      });
      expect(r.tags).toEqual(['vip']);
      expect(r.recentMessages[0]?.content?.length).toBe(100);
    });
    it('returns empty recentMessages when no conversations', () => {
      const r = mapLeadDetail({
        id: 'c',
        name: 'n',
        phone: 'p',
        email: null,
        sentiment: null,
        leadScore: null,
        tags: [],
        conversations: [],
      });
      expect(r.recentMessages).toEqual([]);
    });
  });

  describe('extractFiscalFields', () => {
    it('returns only provided keys', () => {
      expect(extractFiscalFields({ cnpj: '1', cep: '2' })).toEqual({ cnpj: '1', cep: '2' });
    });
    it('returns empty when no fields', () => {
      expect(extractFiscalFields({})).toEqual({});
    });
  });

  describe('buildBusinessProviderSettings', () => {
    it('merges description, segment, and fiscal under fiscal key', () => {
      const out = buildBusinessProviderSettings(
        { existing: 1, fiscal: { cnpj: 'old' } },
        'desc',
        'seg',
        { cep: '01' },
      );
      expect(out).toMatchObject({
        existing: 1,
        businessDescription: 'desc',
        businessSegment: 'seg',
        fiscal: { cnpj: 'old', cep: '01' },
      });
    });
    it('omits fiscal when empty', () => {
      const out = buildBusinessProviderSettings({}, undefined, undefined, {});
      expect(out).not.toHaveProperty('fiscal');
    });
  });

  describe('buildSaveBusinessInfoMessage', () => {
    it('lists keys when fiscal fields present', () => {
      expect(buildSaveBusinessInfoMessage({ cnpj: '1', cep: '2' })).toMatch(/cnpj, cep/);
    });
    it('falls back to generic message when empty', () => {
      expect(buildSaveBusinessInfoMessage({})).toMatch(/salvas com sucesso/);
    });
  });

  describe('buildBusinessHoursPayload', () => {
    it('applies defaults for weekday', () => {
      expect(buildBusinessHoursPayload({}).weekday).toEqual({ start: '09:00', end: '18:00' });
    });
    it('returns null for saturday when no start', () => {
      expect(buildBusinessHoursPayload({}).saturday).toBeNull();
    });
    it('returns sunday slot only when workOnSunday', () => {
      expect(buildBusinessHoursPayload({ workOnSunday: true }).sunday).toEqual({
        start: '09:00',
        end: '13:00',
      });
    });
  });

  describe('buildCampaignContactFilter', () => {
    it('enforces workspaceId', () => {
      expect(buildCampaignContactFilter('w', undefined).workspaceId).toBe('w');
    });
    it('maps leads_quentes to leadScore gte 70', () => {
      expect(buildCampaignContactFilter('w', 'leads_quentes').leadScore).toEqual({ gte: 70 });
    });
    it('maps novos to createdAt within last 7 days', () => {
      const f = buildCampaignContactFilter('w', 'novos');
      expect(f.createdAt).toHaveProperty('gte');
    });
  });

  describe('documentTypeLabel', () => {
    it('maps known types', () => {
      expect(documentTypeLabel('identidade')).toBe('Documento de identidade');
      expect(documentTypeLabel('CONTRATO')).toContain('Contrato');
    });
    it('falls back to generic for unknown', () => {
      expect(documentTypeLabel('foo')).toBe('Documento');
    });
  });

  describe('applyAffiliateConfig + buildAffiliateConfigMessage', () => {
    it('applies known fields only', () => {
      const a: Record<string, unknown> = {};
      applyAffiliateConfig(a, { participate: true, unknownField: 'x' });
      expect(a).toEqual({ participate: true });
    });
    it('produces a list message excluding productName', () => {
      const msg = buildAffiliateConfigMessage({ participate: true, productName: 'p' });
      expect(msg).toContain('participate');
      expect(msg).not.toContain('productName');
    });
    it('falls back without colon when no fields', () => {
      expect(buildAffiliateConfigMessage({})).toMatch(/atualizada\.$/);
    });
  });

  describe('buildSocialChannelsView', () => {
    it('reports whatsapp connected when phone id is present', () => {
      const v = buildSocialChannelsView({
        providerSettings: { whatsappPhoneNumberId: 'abc' },
        metaConnections: null,
      });
      expect(v.whatsapp.connected).toBe(true);
    });
    it('reports instagram/facebook connected only when metaConnections non-empty', () => {
      const v1 = buildSocialChannelsView({ providerSettings: null, metaConnections: [] });
      const v2 = buildSocialChannelsView({ providerSettings: null, metaConnections: [{}] });
      expect(v1.instagram.connected).toBe(false);
      expect(v2.instagram.connected).toBe(true);
      expect(v2.facebook.connected).toBe(true);
    });
  });

  describe('normalizeConnectableChannel', () => {
    it('lowercases known channels', () => {
      expect(normalizeConnectableChannel('Instagram')).toEqual({
        channel: 'instagram',
        isValid: true,
      });
    });
    it('flags unknown', () => {
      expect(normalizeConnectableChannel('xyz')).toEqual({ channel: 'xyz', isValid: false });
    });
    it('handles non-strings', () => {
      expect(normalizeConnectableChannel(undefined)).toEqual({ channel: '', isValid: false });
    });
  });

  describe('validatePlanInput', () => {
    it('rejects empty input', () => {
      expect(validatePlanInput(undefined)).toMatch(/obrigatório/);
      expect(validatePlanInput('')).toMatch(/obrigatório/);
    });
    it('rejects unknown plan', () => {
      expect(validatePlanInput('platinum')).toMatch(/Plano inválido/);
    });
    it('accepts known plans (case-insensitive)', () => {
      expect(validatePlanInput('Pro')).toBeNull();
      expect(validatePlanInput('STARTER')).toBeNull();
    });
  });

  describe('canonicalPlan', () => {
    it('uppercases', () => {
      expect(canonicalPlan('pro')).toBe('PRO');
    });
  });

  describe('buildBillingStatusResponse', () => {
    it('reports ACTIVE when no suspension', () => {
      const r = buildBillingStatusResponse({
        stripeCustomerId: 'cus_1',
        providerSettings: {},
        subscription: { plan: 'PRO', stripeId: 'sub_1' },
      });
      expect(r).toMatchObject({
        success: true,
        plan: 'PRO',
        status: 'ACTIVE',
        hasPaymentMethod: true,
        subscriptionId: 'sub_1',
      });
    });
    it('reports SUSPENDED when settings flag is set', () => {
      const r = buildBillingStatusResponse({
        stripeCustomerId: null,
        providerSettings: { billingSuspended: true },
        subscription: null,
      });
      expect(r).toMatchObject({
        plan: 'FREE',
        status: 'SUSPENDED',
        hasPaymentMethod: false,
        subscriptionId: null,
      });
    });
  });
});
