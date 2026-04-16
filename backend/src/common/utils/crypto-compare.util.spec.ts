import { safeCompareStrings } from './crypto-compare.util';

describe('safeCompareStrings', () => {
  it('returns true for equal strings', () => {
    expect(safeCompareStrings('abc123', 'abc123')).toBe(true);
  });

  it('returns false for different strings of same length', () => {
    expect(safeCompareStrings('abc123', 'xyz789')).toBe(false);
  });

  it('returns false for different-length strings', () => {
    expect(safeCompareStrings('short', 'muchlonger')).toBe(false);
  });

  it('returns false when first argument is empty', () => {
    expect(safeCompareStrings('', 'notempty')).toBe(false);
  });

  it('returns false when second argument is empty', () => {
    expect(safeCompareStrings('notempty', '')).toBe(false);
  });

  it('returns false when both are empty', () => {
    expect(safeCompareStrings('', '')).toBe(false);
  });

  it('handles unicode strings correctly', () => {
    expect(safeCompareStrings('toke\u00F1', 'toke\u00F1')).toBe(true);
    expect(safeCompareStrings('toke\u00F1', 'token')).toBe(false);
  });
});
