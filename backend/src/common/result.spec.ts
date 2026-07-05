import { ok, err, isOk, isErr, unwrap, unwrapOr, map, mapErr, andThen, match } from './result';

describe('Result', () => {
  describe('ok', () => {
    it('creates Ok with correct value', () => {
      const r = ok(42);
      expect(r.ok).toBe(true);
      expect(r.value).toBe(42);
    });

    it('creates Ok with undefined value', () => {
      const r = ok(undefined);
      expect(r.ok).toBe(true);
      expect(r.value).toBeUndefined();
    });

    it('creates Ok with null value', () => {
      const r = ok(null);
      expect(r.ok).toBe(true);
      expect(r.value).toBeNull();
    });
  });

  describe('err', () => {
    it('creates Err with correct error', () => {
      const r = err('something went wrong');
      expect(r.ok).toBe(false);
      expect(r.error).toBe('something went wrong');
    });

    it('creates Err with Error object', () => {
      const e = new Error('boom');
      const r = err(e);
      expect(r.ok).toBe(false);
      expect(r.error).toBe(e);
      expect(r.error.message).toBe('boom');
    });
  });

  describe('isOk / isErr', () => {
    it('isOk returns true for Ok, false for Err', () => {
      expect(isOk(ok(1))).toBe(true);
      expect(isOk(err('fail'))).toBe(false);
    });

    it('isErr returns false for Ok, true for Err', () => {
      expect(isErr(ok(1))).toBe(false);
      expect(isErr(err('fail'))).toBe(true);
    });

    it('isOk narrows types so value is accessible', () => {
      const r = ok('hello') as ReturnType<typeof ok<string>>;
      if (isOk(r)) {
        expect(r.value.toUpperCase()).toBe('HELLO');
      } else {
        fail('expected Ok');
      }
    });

    it('isErr narrows types so error is accessible', () => {
      const r = err('bad') as ReturnType<typeof err<string>>;
      if (isErr(r)) {
        expect(r.error.length).toBe(3);
      } else {
        fail('expected Err');
      }
    });
  });

  describe('unwrap', () => {
    it('returns value for Ok', () => {
      expect(unwrap(ok(42))).toBe(42);
    });

    it('throws for Err', () => {
      expect(() => unwrap(err('boom'))).toThrow('boom');
    });

    it('throws Error object for Err with Error', () => {
      const e = new Error('network error');
      expect(() => unwrap(err(e))).toThrow(e);
    });
  });

  describe('unwrapOr', () => {
    it('returns value for Ok', () => {
      expect(unwrapOr(ok(10), 0)).toBe(10);
    });

    it('returns fallback for Err', () => {
      expect(unwrapOr(err('fail'), 0)).toBe(0);
    });
  });

  describe('map', () => {
    it('transforms Ok value', () => {
      const r = map(ok(5), (v) => v * 2);
      expect(unwrap(r)).toBe(10);
    });

    it('passes Err through unchanged', () => {
      const r = map(err('fail'), (v: number) => v * 2);
      expect(isErr(r)).toBe(true);
    });
  });

  describe('mapErr', () => {
    it('transforms Err error', () => {
      const r = mapErr(err('original'), (e) => `wrapped: ${e}`);
      expect(isErr(r)).toBe(true);
      if (isErr(r)) {
        expect(r.error).toBe('wrapped: original');
      }
    });

    it('passes Ok through unchanged', () => {
      const r = mapErr(ok(42), (e: string) => e.length);
      expect(unwrap(r)).toBe(42);
    });
  });

  describe('andThen', () => {
    it('chains Ok result', () => {
      const r = andThen(ok(2), (v) => ok(v * 3));
      expect(unwrap(r)).toBe(6);
    });

    it('short-circuits on Err', () => {
      const r = andThen(err<string>('stop'), (_v: unknown) => err<string>('not reached'));
      expect(isErr(r)).toBe(true);
    });
  });

  describe('match', () => {
    it('calls onOk for Ok', () => {
      const result = match(ok(7), (v) => `ok: ${v}`, (e) => `err: ${e}`);
      expect(result).toBe('ok: 7');
    });

    it('calls onErr for Err', () => {
      const result = match(err('fail'), (v: number) => `ok: ${v}`, (e) => `err: ${e}`);
      expect(result).toBe('err: fail');
    });
  });

  describe('edge cases', () => {
    it('supports nested Results', () => {
      const inner = ok(1);
      const outer = ok(inner);
      expect(isOk(outer)).toBe(true);
      if (isOk(outer)) {
        expect(unwrap(outer.value)).toBe(1);
      }
    });

    it('supports null as Ok value', () => {
      const r = ok<number | null>(null);
      expect(unwrap(r)).toBeNull();
    });

    it('supports undefined as Err error', () => {
      const r = err(undefined);
      expect(isErr(r)).toBe(true);
      if (isErr(r)) {
        expect(r.error).toBeUndefined();
      }
    });
  });
});
