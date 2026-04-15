import { describe, expect, it } from 'vitest';
import { firstName, resolveGreeting } from './admin-greeting';

describe('resolveGreeting', () => {
  it.each([
    [0, 'Boa madrugada'],
    [4, 'Boa madrugada'],
    [5, 'Bom dia'],
    [11, 'Bom dia'],
    [12, 'Boa tarde'],
    [17, 'Boa tarde'],
    [18, 'Boa noite'],
    [23, 'Boa noite'],
  ])('hour %i -> %s', (hour, expected) => {
    expect(resolveGreeting(hour)).toBe(expected);
  });

  it('falls back to a neutral salutation on invalid input', () => {
    expect(resolveGreeting(-1)).toBe('Olá');
    expect(resolveGreeting(24)).toBe('Olá');
    expect(resolveGreeting(3.5)).toBe('Olá');
  });
});

describe('firstName', () => {
  it('returns the first token', () => {
    expect(firstName('Daniel Gonzaga')).toBe('Daniel');
    expect(firstName('  Daniel   Gonzaga  ')).toBe('Daniel');
    expect(firstName('Madonna')).toBe('Madonna');
    expect(firstName('')).toBe('');
    expect(firstName('   ')).toBe('');
  });
});
