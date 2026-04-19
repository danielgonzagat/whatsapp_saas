/**
 * Low-level byte/buffer predicates used by file-signature detection.
 *
 * Extracted from file-signature.util.ts so each helper is measured on its
 * own by complexity scanners (Codacy / lizard conflate neighbouring TS
 * functions in the same file into a single super-function with inflated CCN).
 */
const ALLOWED_CONTROL_BYTES: ReadonlySet<number> = new Set([9, 10, 13]);

export function isTextSafeByte(byte: number): boolean {
  if (ALLOWED_CONTROL_BYTES.has(byte)) return true;
  if (byte >= 32 && byte <= 126) return true;
  return byte >= 128;
}

export function isSuspiciousControlByte(byte: number): boolean {
  return !isTextSafeByte(byte);
}

export function countSuspiciousControlBytes(sample: Buffer): number {
  let count = 0;
  for (const byte of sample) {
    if (isSuspiciousControlByte(byte)) count += 1;
  }
  return count;
}

export function looksLikeUtf8Text(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  if (!sample.length) return false;

  if (sample.toString('utf8').includes('\uFFFD')) {
    return false;
  }

  return countSuspiciousControlBytes(sample) / sample.length < 0.02;
}

export function bufferStartsWith(buffer: Buffer, signature: readonly number[]): boolean {
  if (buffer.length < signature.length) return false;
  for (let i = 0; i < signature.length; i += 1) {
    if (buffer[i] !== signature[i]) return false;
  }
  return true;
}

export function bufferSliceEquals(
  buffer: Buffer,
  start: number,
  end: number,
  ascii: string,
): boolean {
  if (buffer.length < end) return false;
  return buffer.subarray(start, end).toString('ascii') === ascii;
}
