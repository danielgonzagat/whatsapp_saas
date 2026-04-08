import {
  PaginationLimitPipe,
  PaginationPagePipe,
  clampLimit,
  clampPage,
} from './pagination-clamp.pipe';

describe('PaginationLimitPipe', () => {
  const pipe = new PaginationLimitPipe();
  const meta = { type: 'query' as const };

  it('returns default 20 when value is undefined', () => {
    expect(pipe.transform(undefined, meta)).toBe(20);
  });

  it('returns default 20 when value is empty string', () => {
    expect(pipe.transform('', meta)).toBe(20);
  });

  it('returns default 20 when value is non-numeric', () => {
    expect(pipe.transform('banana', meta)).toBe(20);
  });

  it('returns default 20 when value is NaN', () => {
    expect(pipe.transform(NaN, meta)).toBe(20);
  });

  it('parses a valid numeric string', () => {
    expect(pipe.transform('50', meta)).toBe(50);
  });

  it('clamps values above 100 down to 100 — the I17 ceiling', () => {
    expect(pipe.transform('1000000', meta)).toBe(100);
    expect(pipe.transform(9999, meta)).toBe(100);
  });

  it('clamps values below 1 up to 1', () => {
    expect(pipe.transform('-5', meta)).toBe(1);
    expect(pipe.transform(0, meta)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(pipe.transform('12.9', meta)).toBe(12);
    expect(pipe.transform(7.5, meta)).toBe(7);
  });

  it('accepts ClampOptions for per-endpoint customization', () => {
    const custom = new PaginationLimitPipe({ min: 5, max: 50, default: 10 });
    expect(custom.transform(undefined, meta)).toBe(10);
    expect(custom.transform('3', meta)).toBe(5);
    expect(custom.transform('999', meta)).toBe(50);
  });
});

describe('PaginationPagePipe', () => {
  const pipe = new PaginationPagePipe();
  const meta = { type: 'query' as const };

  it('returns default page 1 when value is undefined', () => {
    expect(pipe.transform(undefined, meta)).toBe(1);
  });

  it('clamps to max 10_000 pages', () => {
    expect(pipe.transform('99999999', meta)).toBe(10_000);
  });

  it('clamps below 1 to 1', () => {
    expect(pipe.transform('0', meta)).toBe(1);
    expect(pipe.transform('-1', meta)).toBe(1);
  });

  it('parses a valid page number', () => {
    expect(pipe.transform('42', meta)).toBe(42);
  });
});

describe('clampLimit / clampPage helpers', () => {
  it('clampLimit honors options', () => {
    expect(clampLimit('500')).toBe(100);
    expect(clampLimit('500', { max: 200 })).toBe(200);
  });

  it('clampPage honors options', () => {
    expect(clampPage(undefined)).toBe(1);
    expect(clampPage('42')).toBe(42);
  });

  it('rejects NaN and Infinity consistently', () => {
    expect(clampLimit(NaN)).toBe(20);
    expect(clampLimit(Infinity)).toBe(20);
    expect(clampLimit(-Infinity)).toBe(20);
  });
});
