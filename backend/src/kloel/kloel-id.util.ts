import { randomUUID } from 'node:crypto';
import { UUID_DASH_RE } from '../common/regex';

function buildEntropySegment(length = 8) {
  return randomUUID().replace(UUID_DASH_RE, '').slice(0, length);
}

/** Build timestamped underscore-delimited runtime id. */
export function buildTimestampedRuntimeId(prefix: string, entropyLength = 8) {
  return `${prefix}_${Date.now()}_${buildEntropySegment(entropyLength)}`;
}

/** Build timestamped colon-delimited runtime key. */
export function buildTimestampedRuntimeKey(prefix: string, entropyLength = 6) {
  return `${prefix}:${Date.now()}:${buildEntropySegment(entropyLength)}`;
}
