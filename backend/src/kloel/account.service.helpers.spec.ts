import { BadRequestException } from '@nestjs/common';
import {
  buildFiscalDataCreateInput,
  buildPersonalDataUpdates,
  fiscalDataPatch,
  isFiscalDataStringField,
  requireDefinedFiscalType,
} from './account.service.helpers';
import {
  bankAccountPatch,
  deriveBankDisplay,
  normalizePixKeyType,
} from './account.service.helpers';

describe('normalizePixKeyType', () => {
  it('maps canonical types', () => {
    expect(normalizePixKeyType('CPF')).toBe('CPF');
    expect(normalizePixKeyType('cnpj')).toBe('CNPJ');
    expect(normalizePixKeyType('email')).toBe('EMAIL');
  });

  it('maps PT-BR / human aliases', () => {
    expect(normalizePixKeyType('celular')).toBe('PHONE');
    expect(normalizePixKeyType('telefone')).toBe('PHONE');
    expect(normalizePixKeyType('aleatória')).toBe('RANDOM');
    expect(normalizePixKeyType('aleatoria')).toBe('RANDOM');
    expect(normalizePixKeyType('e-mail')).toBe('EMAIL');
  });

  it('returns undefined for unknown or non-string input', () => {
    expect(normalizePixKeyType('bogus')).toBeUndefined();
    expect(normalizePixKeyType('')).toBeUndefined();
    expect(normalizePixKeyType(123)).toBeUndefined();
    expect(normalizePixKeyType(undefined)).toBeUndefined();
  });
});

describe('bankAccountPatch', () => {
  it('keeps only known DATA fields, trimming strings', () => {
    expect(
      bankAccountPatch({ bankCode: ' 341 ', agency: '0001', account: '12', extra: 'drop' }),
    ).toEqual({ bankCode: '341', agency: '0001', account: '12' });
  });

  it('normalizes pixKeyType and ignores empty / non-string values', () => {
    expect(bankAccountPatch({ pixKey: 'a@b.com', pixKeyType: 'email', agency: '' })).toEqual({
      pixKey: 'a@b.com',
      pixKeyType: 'EMAIL',
    });
  });

  it('drops an invalid pixKeyType silently (caller validates separately)', () => {
    expect(bankAccountPatch({ pixKey: 'k', pixKeyType: 'nope' })).toEqual({ pixKey: 'k' });
  });

  it('returns an empty patch for empty input', () => {
    expect(bankAccountPatch({})).toEqual({});
  });
});

describe('deriveBankDisplay', () => {
  it('masks the last 4 of the account number', () => {
    expect(deriveBankDisplay({ account: '123456' })).toBe('****3456');
  });

  it('falls back to the PIX key last 4 when no account', () => {
    expect(deriveBankDisplay({ pixKey: 'user@kloel.com' })).toBe('****.com');
  });

  it('returns null when neither is present', () => {
    expect(deriveBankDisplay({})).toBeNull();
  });
});

describe('isFiscalDataStringField', () => {
  it('returns true for known fiscal data string fields', () => {
    expect(isFiscalDataStringField('type')).toBe(true);
    expect(isFiscalDataStringField('cpf')).toBe(true);
    expect(isFiscalDataStringField('cnpj')).toBe(true);
    expect(isFiscalDataStringField('fullName')).toBe(true);
    expect(isFiscalDataStringField('razaoSocial')).toBe(true);
    expect(isFiscalDataStringField('status')).toBe(true);
  });

  it('returns false for unknown fields', () => {
    expect(isFiscalDataStringField('unknown')).toBe(false);
    expect(isFiscalDataStringField('')).toBe(false);
    expect(isFiscalDataStringField('id')).toBe(false);
    expect(isFiscalDataStringField('workspaceId')).toBe(false);
  });
});
describe('fiscalDataPatch', () => {
  it('filters only known string fields from input', () => {
    const result = fiscalDataPatch({
      type: 'pf',
      cpf: '12345678901',
      fullName: 'Test User',
      unknown: 'should be excluded',
      number: 123,
    });
    expect(result).toEqual({
      type: 'pf',
      cpf: '12345678901',
      fullName: 'Test User',
    });
  });

  it('excludes non-string values for known fields', () => {
    const result = fiscalDataPatch({
      type: 'pj',
      cnpj: 12345,
      razaoSocial: null,
      nomeFantasia: 'Acme',
    });
    expect(result).toEqual({
      type: 'pj',
      nomeFantasia: 'Acme',
    });
  });

  it('returns empty object when no valid fields present', () => {
    const result = fiscalDataPatch({});
    expect(result).toEqual({});
  });

  it('throws on null data (defensive — caller must guard)', () => {
    expect(() => fiscalDataPatch(null as unknown as Record<string, unknown>)).toThrow(TypeError);
  });
});
describe('requireDefinedFiscalType', () => {
  it('returns the type from patch when present', () => {
    const result = requireDefinedFiscalType({ type: 'pf' }, undefined);
    expect(result).toBe('pf');
  });

  it('falls back to existingType when patch type is absent', () => {
    const result = requireDefinedFiscalType({ cpf: '123' }, 'pj');
    expect(result).toBe('pj');
  });

  it('prefers patch.type over existingType', () => {
    const result = requireDefinedFiscalType({ type: 'pf' }, 'pj');
    expect(result).toBe('pf');
  });

  it('throws BadRequestException when both are missing', () => {
    expect(() => requireDefinedFiscalType({}, undefined)).toThrow(BadRequestException);
    expect(() => requireDefinedFiscalType({}, undefined)).toThrow('Fiscal type is required');
  });

  it('throws BadRequestException when type is not a string', () => {
    expect(() => requireDefinedFiscalType({ type: 123 as unknown as string }, undefined)).toThrow(
      BadRequestException,
    );
  });

  it('treats empty string as valid (string type)', () => {
    const result = requireDefinedFiscalType({ type: '' }, undefined);
    expect(result).toBe('');
  });
});
describe('buildFiscalDataCreateInput', () => {
  it('spreads patch fields and adds workspaceId + type', () => {
    const result = buildFiscalDataCreateInput('ws-1', { cpf: '123', fullName: 'Test' }, 'pf');
    expect(result).toEqual({
      workspaceId: 'ws-1',
      type: 'pf',
      cpf: '123',
      fullName: 'Test',
    });
  });

  it('overrides patch.type with the explicit type argument', () => {
    const result = buildFiscalDataCreateInput('ws-2', { type: 'old', cpf: '456' }, 'pj');
    expect(result.type).toBe('pj');
    expect(result.cpf).toBe('456');
  });

  it('works with empty patch', () => {
    const result = buildFiscalDataCreateInput('ws-3', {}, 'pf');
    expect(result).toEqual({
      workspaceId: 'ws-3',
      type: 'pf',
    });
  });
});
describe('buildPersonalDataUpdates', () => {
  it('builds updates from non-empty fields', () => {
    const result = buildPersonalDataUpdates({
      name: 'Alice',
      email: 'alice@test.com',
      phone: '5511999999999',
    });
    expect(result).toEqual({
      name: 'Alice',
      email: 'alice@test.com',
      phone: '5511999999999',
    });
  });

  it('excludes undefined fields', () => {
    const result = buildPersonalDataUpdates({ name: 'Bob' });
    expect(result).toEqual({ name: 'Bob' });
  });

  it('excludes empty string fields', () => {
    const result = buildPersonalDataUpdates({ name: '', email: 'bob@test.com' });
    expect(result).toEqual({ email: 'bob@test.com' });
  });

  it('returns empty object when all fields are empty/undefined', () => {
    const result = buildPersonalDataUpdates({});
    expect(result).toEqual({});
  });
});
