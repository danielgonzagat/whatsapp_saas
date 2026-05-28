import { describe, it, expect } from 'vitest';
import {
  applyProductPatch,
  FORMAT_OPTIONS,
  isApprovedStatus,
  isEmailFieldKey,
  isProductsSwrKey,
  needsShipping,
  normalizeTags,
  parseShippingValue,
  parseWarrantyDays,
  PRODUCT_GENERAL_COPY,
  type ProductData,
  productPreviewStorageKey,
  resolveFormatLabel,
  saveButtonLabel,
  SHIPPING_TYPES,
  shippingRequiresValue,
  shortProductCode,
  URL_FIELDS,
  urlOrEmailPlaceholder,
} from './ProductGeneralTab.helpers';

function makeProduct(overrides: Partial<ProductData> = {}): ProductData {
  return {
    id: '4a8c2d1e-1234-5678-9abc-def012345678',
    name: 'Serum Premium',
    description: 'Descricao do produto.',
    price: 199,
    category: 'Beleza',
    tags: ['hidratante'],
    format: 'PHYSICAL',
    imageUrl: 'https://cdn.example/img.png',
    active: true,
    status: 'APPROVED',
    salesPageUrl: '',
    thankyouUrl: '',
    thankyouBoletoUrl: '',
    thankyouPixUrl: '',
    reclameAquiUrl: '',
    supportEmail: '',
    warrantyDays: 7,
    isSample: false,
    shippingType: 'VARIABLE',
    shippingValue: null,
    originCep: '01310-100',
    ...overrides,
  };
}

describe('SHIPPING_TYPES', () => {
  it('lists VARIABLE, FIXED and FREE in the documented order', () => {
    expect(SHIPPING_TYPES.map((entry) => entry.value)).toEqual(['VARIABLE', 'FIXED', 'FREE']);
  });

  it('keeps UI labels stable so the visual contract is not redrawn', () => {
    expect(SHIPPING_TYPES.map((entry) => entry.label)).toEqual([
      'Variavel/Gratis',
      'Fixo',
      'Sem frete',
    ]);
  });
});

describe('FORMAT_OPTIONS', () => {
  it('lists PHYSICAL, DIGITAL and HYBRID in the documented order', () => {
    expect(FORMAT_OPTIONS.map((entry) => entry.value)).toEqual([
      'PHYSICAL',
      'DIGITAL',
      'HYBRID',
    ]);
  });

  it('exposes the legacy Portuguese labels rendered in the radio group', () => {
    expect(FORMAT_OPTIONS.map((entry) => entry.label)).toEqual(['Fisico', 'Digital', 'Hibrido']);
  });
});

describe('URL_FIELDS', () => {
  it('exposes exactly five fields in the documented order', () => {
    expect(URL_FIELDS.map((entry) => entry.key)).toEqual([
      'salesPageUrl',
      'thankyouUrl',
      'thankyouPixUrl',
      'reclameAquiUrl',
      'supportEmail',
    ]);
  });

  it('keeps the support email last so it can drive the email placeholder branch', () => {
    expect(URL_FIELDS.at(-1)?.key).toBe('supportEmail');
  });
});

describe('PRODUCT_GENERAL_COPY', () => {
  it('exposes the expected i18n keys', () => {
    expect(PRODUCT_GENERAL_COPY.notFound).toBe('Produto nao encontrado.');
    expect(PRODUCT_GENERAL_COPY.urlsHeading).toBe('URLs');
    expect(PRODUCT_GENERAL_COPY.shippingHeading).toBe('Configuracao de envio');
    expect(PRODUCT_GENERAL_COPY.isSampleLabel).toBe('E amostra gratis?');
  });
});

describe('resolveFormatLabel', () => {
  it('returns the matching Portuguese label for known formats', () => {
    expect(resolveFormatLabel('PHYSICAL')).toBe('Fisico');
    expect(resolveFormatLabel('DIGITAL')).toBe('Digital');
    expect(resolveFormatLabel('HYBRID')).toBe('Hibrido');
  });

  it('falls back to the legacy Hibrido label for empty or unknown values', () => {
    expect(resolveFormatLabel('')).toBe('Hibrido');
    expect(resolveFormatLabel(null)).toBe('Hibrido');
    expect(resolveFormatLabel(undefined)).toBe('Hibrido');
    expect(resolveFormatLabel('GASEOUS')).toBe('Hibrido');
  });
});

describe('needsShipping', () => {
  it('returns true for PHYSICAL and HYBRID products', () => {
    expect(needsShipping('PHYSICAL')).toBe(true);
    expect(needsShipping('HYBRID')).toBe(true);
  });

  it('returns false for DIGITAL or unknown formats', () => {
    expect(needsShipping('DIGITAL')).toBe(false);
    expect(needsShipping('')).toBe(false);
    expect(needsShipping(null)).toBe(false);
    expect(needsShipping(undefined)).toBe(false);
  });
});

describe('shippingRequiresValue', () => {
  it('returns true only when the shipping type is FIXED', () => {
    expect(shippingRequiresValue('FIXED')).toBe(true);
  });

  it('returns false for other shipping modes', () => {
    expect(shippingRequiresValue('VARIABLE')).toBe(false);
    expect(shippingRequiresValue('FREE')).toBe(false);
    expect(shippingRequiresValue('')).toBe(false);
    expect(shippingRequiresValue(null)).toBe(false);
  });
});

describe('parseWarrantyDays', () => {
  it('returns the parsed positive integer', () => {
    expect(parseWarrantyDays('7')).toBe(7);
    expect(parseWarrantyDays('30')).toBe(30);
    expect(parseWarrantyDays('  12 ')).toBe(12);
  });

  it('returns null for empty or non-numeric input', () => {
    expect(parseWarrantyDays('')).toBeNull();
    expect(parseWarrantyDays('   ')).toBeNull();
    expect(parseWarrantyDays('abc')).toBeNull();
    expect(parseWarrantyDays(null)).toBeNull();
    expect(parseWarrantyDays(undefined)).toBeNull();
  });

  it('returns null for zero and negative values', () => {
    expect(parseWarrantyDays('0')).toBeNull();
    expect(parseWarrantyDays('-1')).toBeNull();
  });
});

describe('parseShippingValue', () => {
  it('returns the parsed decimal value', () => {
    expect(parseShippingValue('19.9')).toBeCloseTo(19.9);
    expect(parseShippingValue('  0 ')).toBe(0);
  });

  it('returns null for blank, non-numeric, or negative inputs', () => {
    expect(parseShippingValue('')).toBeNull();
    expect(parseShippingValue('   ')).toBeNull();
    expect(parseShippingValue('abc')).toBeNull();
    expect(parseShippingValue('-5')).toBeNull();
    expect(parseShippingValue(null)).toBeNull();
    expect(parseShippingValue(undefined)).toBeNull();
  });
});

describe('shortProductCode', () => {
  it('returns the first 8 characters of the id', () => {
    expect(shortProductCode('4a8c2d1e-1234-5678-9abc-def012345678')).toBe('4a8c2d1e');
  });

  it('handles short ids without padding', () => {
    expect(shortProductCode('abc')).toBe('abc');
  });

  it('returns an empty string for nullish ids', () => {
    expect(shortProductCode(null)).toBe('');
    expect(shortProductCode(undefined)).toBe('');
    expect(shortProductCode('')).toBe('');
  });
});

describe('isApprovedStatus', () => {
  it('only matches the literal APPROVED state', () => {
    expect(isApprovedStatus('APPROVED')).toBe(true);
    expect(isApprovedStatus('DRAFT')).toBe(false);
    expect(isApprovedStatus('approved')).toBe(false);
    expect(isApprovedStatus(null)).toBe(false);
    expect(isApprovedStatus(undefined)).toBe(false);
  });
});

describe('isProductsSwrKey', () => {
  it('matches strings starting with /products', () => {
    expect(isProductsSwrKey('/products')).toBe(true);
    expect(isProductsSwrKey('/products/abc')).toBe(true);
    expect(isProductsSwrKey('/products/abc/plans')).toBe(true);
  });

  it('rejects non-string and unrelated keys', () => {
    expect(isProductsSwrKey('/orders')).toBe(false);
    expect(isProductsSwrKey('')).toBe(false);
    expect(isProductsSwrKey(null)).toBe(false);
    expect(isProductsSwrKey(undefined)).toBe(false);
    expect(isProductsSwrKey(42)).toBe(false);
    expect(isProductsSwrKey({ foo: 'bar' })).toBe(false);
  });
});

describe('normalizeTags', () => {
  it('keeps string entries and drops the rest', () => {
    expect(normalizeTags(['a', 1, 'b', null, 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('returns an empty array for non-array inputs', () => {
    expect(normalizeTags(null)).toEqual([]);
    expect(normalizeTags(undefined)).toEqual([]);
    expect(normalizeTags('a,b')).toEqual([]);
    expect(normalizeTags({})).toEqual([]);
  });
});

describe('isEmailFieldKey / urlOrEmailPlaceholder', () => {
  it('treats keys containing Email as email fields', () => {
    expect(isEmailFieldKey('supportEmail')).toBe(true);
    expect(isEmailFieldKey('contactEmail')).toBe(true);
    expect(isEmailFieldKey('salesPageUrl')).toBe(false);
  });

  it('returns the email placeholder for email fields and the URL placeholder otherwise', () => {
    expect(urlOrEmailPlaceholder('supportEmail')).toBe('suporte@...');
    expect(urlOrEmailPlaceholder('salesPageUrl')).toBe('https://...');
  });
});

describe('productPreviewStorageKey', () => {
  it('namespaces the storage key by product id', () => {
    expect(productPreviewStorageKey('abc-123')).toBe('kloel_product_general_preview_abc-123');
  });
});

describe('saveButtonLabel', () => {
  it('prefers Salvo! when saved is true (even if saving is also true)', () => {
    expect(saveButtonLabel({ saving: false, saved: true })).toBe('Salvo!');
    expect(saveButtonLabel({ saving: true, saved: true })).toBe('Salvo!');
  });

  it('shows Salvando... while saving and not saved', () => {
    expect(saveButtonLabel({ saving: true, saved: false })).toBe('Salvando...');
  });

  it('shows Salvar in the idle state', () => {
    expect(saveButtonLabel({ saving: false, saved: false })).toBe('Salvar');
  });
});

describe('applyProductPatch', () => {
  it('returns a new object with the field updated', () => {
    const base = makeProduct();
    const next = applyProductPatch(base, 'name', 'Novo Nome');
    expect(next.name).toBe('Novo Nome');
    expect(next).not.toBe(base);
    expect(base.name).toBe('Serum Premium');
  });

  it('supports numeric and nullable fields', () => {
    const base = makeProduct({ shippingValue: null });
    const next = applyProductPatch(base, 'shippingValue', 19.9);
    expect(next.shippingValue).toBe(19.9);

    const cleared = applyProductPatch(next, 'shippingValue', null);
    expect(cleared.shippingValue).toBeNull();
  });

  it('supports boolean toggles', () => {
    const base = makeProduct({ active: true });
    const next = applyProductPatch(base, 'active', false);
    expect(next.active).toBe(false);
  });
});
