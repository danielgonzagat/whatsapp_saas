import { describe, expect, it } from 'vitest';

import {
  DIGIT_PATTERN,
  EMAIL_PATTERN,
  UPPERCASE_PATTERN,
  getPasswordStrength,
  validateEmail,
  validateSignUpForm,
} from './auth-modal.helpers';

describe('EMAIL_PATTERN', () => {
  it('matches the loose RFC-5322 shape used by the modal', () => {
    expect(EMAIL_PATTERN.test('foo@bar.com')).toBe(true);
    expect(EMAIL_PATTERN.test('foo+tag@bar.co')).toBe(true);
  });

  it('rejects whitespace and missing TLD', () => {
    expect(EMAIL_PATTERN.test('')).toBe(false);
    expect(EMAIL_PATTERN.test('foo bar@bar.com')).toBe(false);
    expect(EMAIL_PATTERN.test('foo@bar')).toBe(false);
  });
});

describe('UPPERCASE_PATTERN / DIGIT_PATTERN', () => {
  it('detects ASCII uppercase and digits respectively', () => {
    expect(UPPERCASE_PATTERN.test('abcA')).toBe(true);
    expect(UPPERCASE_PATTERN.test('abc')).toBe(false);
    expect(DIGIT_PATTERN.test('ab1')).toBe(true);
    expect(DIGIT_PATTERN.test('abc')).toBe(false);
  });
});

describe('validateEmail', () => {
  it('returns true for valid emails', () => {
    expect(validateEmail('foo@bar.com')).toBe(true);
  });

  it('returns false for malformed emails and empty strings', () => {
    expect(validateEmail('')).toBe(false);
    expect(validateEmail('no-at-sign')).toBe(false);
    expect(validateEmail('foo@bar')).toBe(false);
  });
});

describe('getPasswordStrength', () => {
  it('returns level 0 for empty password', () => {
    expect(getPasswordStrength('')).toEqual({ level: 0, label: '', color: 'bg-gray-200' });
  });

  it('returns level 1 (Fraca) for length < 6', () => {
    expect(getPasswordStrength('abc')).toEqual({ level: 1, label: 'Fraca', color: 'bg-red-500' });
    expect(getPasswordStrength('abcde')).toEqual({
      level: 1,
      label: 'Fraca',
      color: 'bg-red-500',
    });
  });

  it('returns level 2 (Media) for length 6 or 7', () => {
    expect(getPasswordStrength('abcdef')).toEqual({
      level: 2,
      label: 'Media',
      color: 'bg-yellow-500',
    });
    expect(getPasswordStrength('abcdefg')).toEqual({
      level: 2,
      label: 'Media',
      color: 'bg-yellow-500',
    });
  });

  it('returns level 3 (Boa) for length >= 8 missing uppercase or digit', () => {
    expect(getPasswordStrength('abcdefgh')).toEqual({
      level: 3,
      label: 'Boa',
      color: 'bg-blue-500',
    });
    expect(getPasswordStrength('abcdefghA')).toEqual({
      level: 3,
      label: 'Boa',
      color: 'bg-blue-500',
    });
    expect(getPasswordStrength('abcdefgh1')).toEqual({
      level: 3,
      label: 'Boa',
      color: 'bg-blue-500',
    });
  });

  it('returns level 4 (Forte) for length >= 8 with both uppercase AND digit', () => {
    expect(getPasswordStrength('Abcdefg1')).toEqual({
      level: 4,
      label: 'Forte',
      color: 'bg-green-500',
    });
  });
});

describe('validateSignUpForm', () => {
  const valid = {
    name: 'Daniel',
    password: 'Abcdefg1',
    confirmPassword: 'Abcdefg1',
    acceptedTerms: true,
  };

  it('returns empty object for a fully valid form', () => {
    expect(validateSignUpForm(valid)).toEqual({});
  });

  it('flags blank/whitespace name', () => {
    expect(validateSignUpForm({ ...valid, name: '   ' })).toEqual({
      name: 'Nome e obrigatorio',
    });
  });

  it('flags password shorter than 8 characters', () => {
    const errors = validateSignUpForm({
      ...valid,
      password: 'short',
      confirmPassword: 'short',
    });
    expect(errors.password).toBe('Senha deve ter pelo menos 8 caracteres');
  });

  it('flags mismatched confirmPassword', () => {
    const errors = validateSignUpForm({ ...valid, confirmPassword: 'different1' });
    expect(errors.confirmPassword).toBe('As senhas nao coincidem');
  });

  it('flags un-accepted terms', () => {
    expect(validateSignUpForm({ ...valid, acceptedTerms: false })).toEqual({
      terms: 'Voce deve aceitar os termos',
    });
  });

  it('aggregates every field that fails in a single call', () => {
    const errors = validateSignUpForm({
      name: '',
      password: 'a',
      confirmPassword: 'b',
      acceptedTerms: false,
    });
    expect(errors).toEqual({
      name: 'Nome e obrigatorio',
      password: 'Senha deve ter pelo menos 8 caracteres',
      confirmPassword: 'As senhas nao coincidem',
      terms: 'Voce deve aceitar os termos',
    });
  });
});
