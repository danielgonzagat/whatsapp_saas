import { describe, it, expect } from 'vitest';
import {
  buildCommissionFormFromCommission,
  buildCommissionPayload,
  type Commission,
  type CommissionForm,
  describeCommissionForDeletion,
  EMPTY_COMMISSION_FORM,
  formatCommissionPercentage,
  isProductsSwrKey,
  normalizeCommissionList,
  PRODUCT_COMMISSIONS_COPY,
  resolveCommissionRoleLabel,
  ROLES,
  toCommissionErrorMessage,
} from './ProductCommissionsTab.helpers';

function makeCommission(overrides: Partial<Commission> = {}): Commission {
  return {
    id: 'com-1',
    role: 'AFFILIATE',
    percentage: 12.5,
    agentName: 'Ada Lovelace',
    agentEmail: 'ada@example.com',
    ...overrides,
  };
}

function makeForm(overrides: Partial<CommissionForm> = {}): CommissionForm {
  return {
    role: 'AFFILIATE',
    percentage: '10',
    agentName: 'Ada',
    agentEmail: 'ada@example.com',
    ...overrides,
  };
}

describe('ROLES constant', () => {
  it('exposes COPRODUCER, MANAGER and AFFILIATE in that order', () => {
    expect(ROLES.map((role) => role.value)).toEqual(['COPRODUCER', 'MANAGER', 'AFFILIATE']);
  });

  it('uses pt-BR labels', () => {
    expect(ROLES.find((role) => role.value === 'AFFILIATE')?.label).toBe('Afiliado');
    expect(ROLES.find((role) => role.value === 'MANAGER')?.label).toBe('Gerente');
    expect(ROLES.find((role) => role.value === 'COPRODUCER')?.label).toBe('Coprodutor');
  });
});

describe('EMPTY_COMMISSION_FORM constant', () => {
  it('defaults to an AFFILIATE form with empty fields', () => {
    expect(EMPTY_COMMISSION_FORM).toEqual({
      role: 'AFFILIATE',
      percentage: '',
      agentName: '',
      agentEmail: '',
    });
  });
});

describe('PRODUCT_COMMISSIONS_COPY constant', () => {
  it('exposes localized copy keys used by the component', () => {
    expect(PRODUCT_COMMISSIONS_COPY.loadError).toBe('Falha ao carregar comissoes');
    expect(PRODUCT_COMMISSIONS_COPY.saveError).toBe('Falha ao salvar comissao');
    expect(PRODUCT_COMMISSIONS_COPY.deleteError).toBe('Falha ao excluir comissao');
    expect(PRODUCT_COMMISSIONS_COPY.cancel).toBe('Cancelar');
    expect(PRODUCT_COMMISSIONS_COPY.confirmDelete).toBe('Excluir');
  });
});

describe('toCommissionErrorMessage', () => {
  it('returns the Error message when present', () => {
    expect(toCommissionErrorMessage(new Error('boom'), 'fallback')).toBe('boom');
  });

  it('returns fallback for non-Error values', () => {
    expect(toCommissionErrorMessage(null, 'fallback')).toBe('fallback');
    expect(toCommissionErrorMessage('string', 'fallback')).toBe('fallback');
    expect(toCommissionErrorMessage({ message: 'no' }, 'fallback')).toBe('fallback');
    expect(toCommissionErrorMessage(undefined, 'fallback')).toBe('fallback');
  });

  it('returns fallback when Error has empty message', () => {
    expect(toCommissionErrorMessage(new Error(''), 'fallback')).toBe('fallback');
  });
});

describe('buildCommissionPayload', () => {
  it('parses percentage as a float and preserves other fields', () => {
    const payload = buildCommissionPayload(makeForm({ percentage: '12.5' }));
    expect(payload).toEqual({
      role: 'AFFILIATE',
      percentage: 12.5,
      agentName: 'Ada',
      agentEmail: 'ada@example.com',
    });
  });

  it('defaults percentage to 0 when not a number', () => {
    expect(buildCommissionPayload(makeForm({ percentage: '' })).percentage).toBe(0);
    expect(buildCommissionPayload(makeForm({ percentage: 'abc' })).percentage).toBe(0);
  });

  it('does not mutate the input form', () => {
    const form = makeForm();
    const before = { ...form };
    buildCommissionPayload(form);
    expect(form).toEqual(before);
  });
});

describe('normalizeCommissionList', () => {
  it('returns the array unchanged when given an array', () => {
    const list = [makeCommission()];
    expect(normalizeCommissionList(list)).toBe(list);
  });

  it('returns an empty array for non-array values', () => {
    expect(normalizeCommissionList(null)).toEqual([]);
    expect(normalizeCommissionList(undefined)).toEqual([]);
    expect(normalizeCommissionList({ data: [] })).toEqual([]);
    expect(normalizeCommissionList('string')).toEqual([]);
  });
});

describe('resolveCommissionRoleLabel', () => {
  it('returns the localized label for known roles', () => {
    expect(resolveCommissionRoleLabel('AFFILIATE')).toBe('Afiliado');
    expect(resolveCommissionRoleLabel('MANAGER')).toBe('Gerente');
    expect(resolveCommissionRoleLabel('COPRODUCER')).toBe('Coprodutor');
  });

  it('falls back to the raw string for unknown roles', () => {
    expect(resolveCommissionRoleLabel('UNKNOWN')).toBe('UNKNOWN');
  });

  it('returns an empty string for nullish values', () => {
    expect(resolveCommissionRoleLabel(null)).toBe('');
    expect(resolveCommissionRoleLabel(undefined)).toBe('');
  });
});

describe('formatCommissionPercentage', () => {
  it('formats numeric percentages with a single fraction digit and percent suffix', () => {
    expect(formatCommissionPercentage(12.5)).toMatch(/12[,.]5%/);
    expect(formatCommissionPercentage(10)).toMatch(/10[,.]0%/);
  });

  it('coerces string inputs into numbers', () => {
    expect(formatCommissionPercentage('7.25')).toMatch(/7[,.][23]%/);
  });

  it('renders the percent sign even for NaN inputs', () => {
    const out = formatCommissionPercentage('not-a-number');
    expect(out.endsWith('%')).toBe(true);
  });
});

describe('buildCommissionFormFromCommission', () => {
  it('maps a Commission into form values', () => {
    const form = buildCommissionFormFromCommission(makeCommission());
    expect(form).toEqual({
      role: 'AFFILIATE',
      percentage: '12.5',
      agentName: 'Ada Lovelace',
      agentEmail: 'ada@example.com',
    });
  });

  it('coerces null name/email into empty strings', () => {
    const form = buildCommissionFormFromCommission(
      makeCommission({ agentName: null, agentEmail: null }),
    );
    expect(form.agentName).toBe('');
    expect(form.agentEmail).toBe('');
  });
});

describe('describeCommissionForDeletion', () => {
  it('prefers agentEmail when present', () => {
    expect(describeCommissionForDeletion(makeCommission())).toBe('ada@example.com');
  });

  it('falls back to agentName when email is missing', () => {
    expect(describeCommissionForDeletion(makeCommission({ agentEmail: null }))).toBe(
      'Ada Lovelace',
    );
  });

  it('falls back to role when both name and email are missing', () => {
    expect(
      describeCommissionForDeletion(makeCommission({ agentEmail: null, agentName: null })),
    ).toBe('AFFILIATE');
  });

  it('treats empty string as missing and falls back', () => {
    expect(
      describeCommissionForDeletion(makeCommission({ agentEmail: '', agentName: '' })),
    ).toBe('AFFILIATE');
  });
});

describe('isProductsSwrKey', () => {
  it('returns true for strings starting with /products', () => {
    expect(isProductsSwrKey('/products')).toBe(true);
    expect(isProductsSwrKey('/products/abc/commissions')).toBe(true);
  });

  it('returns false for unrelated keys', () => {
    expect(isProductsSwrKey('/orders')).toBe(false);
    expect(isProductsSwrKey('products/abc')).toBe(false);
    expect(isProductsSwrKey(null)).toBe(false);
    expect(isProductsSwrKey(undefined)).toBe(false);
    expect(isProductsSwrKey(['/products'])).toBe(false);
  });
});
