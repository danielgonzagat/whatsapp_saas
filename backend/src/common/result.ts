export type Result<T, E = Error> = Ok<T> | Err<E>;

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });

export const err = <E>(error: E): Err<E> => ({ ok: false, error });

export const isOk = <T, E>(r: Result<T, E>): r is Ok<T> => r.ok;

export const isErr = <T, E>(r: Result<T, E>): r is Err<E> => !r.ok;

export function unwrap<T, E>(r: Result<T, E>): T {
  if (!r.ok) throw r.error;
  return r.value;
}

export function unwrapOr<T, E>(r: Result<T, E>, fallback: T): T {
  return r.ok ? r.value : fallback;
}

export function map<T, U, E>(r: Result<T, E>, fn: (v: T) => U): Result<U, E> {
  return r.ok ? ok(fn(r.value)) : r;
}

export function mapErr<T, E, F>(r: Result<T, E>, fn: (e: E) => F): Result<T, F> {
  return r.ok ? r : err(fn(r.error));
}

export function andThen<T, U, E>(r: Result<T, E>, fn: (v: T) => Result<U, E>): Result<U, E> {
  return r.ok ? fn(r.value) : r;
}

export function match<T, E, U>(
  r: Result<T, E>,
  onOk: (v: T) => U,
  onErr: (e: E) => U,
): U {
  return r.ok ? onOk(r.value) : onErr(r.error);
}

/**
 * Wraps a Promise-returning function into a Result-returning one.
 *
 * Catches any thrown error (or Promise rejection) and wraps it in `err()`.
 * Successful values are wrapped in `ok()`.
 *
 * @param fn A function returning a Promise.
 * @returns A Result-wrapped Promise — never throws.
 *
 * @example
 * const result = await capturePromise(() => fetch('/api/data'));
 * if (isOk(result)) console.log(result.value);
 */
export async function capturePromise<T>(fn: () => Promise<T>): Promise<Result<T, unknown>> {
  try {
    return ok(await fn());
  } catch (e) {
    return err(e);
  }
}

/**
 * Wraps a Promise-returning function into a Result-returning one.
 *
 * Catches any thrown error (or Promise rejection) and wraps it in `err()`.
 * Successful values are wrapped in `ok()`.
 *
 * @param fn A function returning a Promise.
 * @returns A Result-wrapped Promise — never throws.
 *
 * @example
 * const result = await fromPromise(() => fetch('/api/data'));
 * if (isOk(result)) console.log(result.value);
 */
export async function fromPromise<T>(fn: () => Promise<T>): Promise<Result<T, unknown>> {
  try {
    return ok(await fn());
  } catch (e) {
    return err(e);
  }
}
