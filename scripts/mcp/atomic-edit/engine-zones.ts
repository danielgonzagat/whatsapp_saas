/**
 * EditZones topology analyzer for atomic-edit/engine.ts.
 *
 * Computes byte-level preservation / modification / movement zones from a
 * before/after string pair. Extracted from engine.ts so the engine entry
 * point stays below the architecture-guard 600-line budget.
 */

import type { PreservationZone, ModifiedZone, MovementZone } from './trace.js';
import * as crypto from 'crypto';

const sha256 = (s: string): string => crypto.createHash('sha256').update(s).digest('hex');

export interface EditZones {
  preservedZones: PreservationZone[];
  modifiedZones: ModifiedZone[];
  movementZones: MovementZone[];
}

export const EMPTY_ZONES: EditZones = {
  preservedZones: [],
  modifiedZones: [],
  movementZones: [],
};


/**
 * Compute exact preservation / modification / movement zones by comparing
 * `before` and `after` byte-by-byte. This is the universal topology analyser
 * that works for ANY edit type — range, text, symbol, import, etc.
 *
 * Strategy:
 *  1. Find the first byte where before[i] !== after[i]  → prefix preserved zone
 *  2. Find the last byte where before[j] !== after[j]    → suffix preserved zone
 *  3. The span between first and last diff is the modified zone
 *  4. If before and after are identical → no zones
 */
export function computeZones(
  before: string,
  after: string,
  opKind = 'changed_span',
): EditZones {
  const preservedZones: PreservationZone[] = [];
  const modifiedZones: ModifiedZone[] = [];

  if (before === after) {
    preservedZones.push({
      kind: 'unchanged_content',
      description: `Full file (${before.length} bytes) unchanged`,
      byteStart: 0,
      byteEnd: before.length,
      byteLength: before.length,
      beforeHash: sha256(before),
      afterHash: sha256(after),
    });
    return { preservedZones, modifiedZones, movementZones: [] };
  }

  let firstDiff = 0;
  while (
    firstDiff < before.length &&
    firstDiff < after.length &&
    before[firstDiff] === after[firstDiff]
  ) {
    firstDiff++;
  }

  let lastBeforeDiff = before.length - 1;
  let lastAfterDiff = after.length - 1;
  while (
    lastBeforeDiff >= firstDiff &&
    lastAfterDiff >= firstDiff &&
    before[lastBeforeDiff] === after[lastAfterDiff]
  ) {
    lastBeforeDiff--;
    lastAfterDiff--;
  }
  lastBeforeDiff++;
  lastAfterDiff++;

  if (firstDiff > 0) {
    const prefixText = before.slice(0, firstDiff);
    preservedZones.push({
      kind: 'prefix_preserved',
      description: `Bytes 0–${firstDiff - 1} — prefix preserved unchanged`,
      byteStart: 0,
      byteEnd: firstDiff,
      byteLength: firstDiff,
      beforeHash: sha256(prefixText),
      afterHash: sha256(prefixText),
      sample: prefixText.length > 80 ? prefixText.slice(-80) : prefixText,
    });
  }

  const oldChunk = before.slice(firstDiff, lastBeforeDiff);
  const newChunk = after.slice(firstDiff, lastAfterDiff);
  modifiedZones.push({
    kind: opKind,
    byteStart: firstDiff,
    byteEnd: lastBeforeDiff,
    newByteLength: newChunk.length,
    oldTextHash: sha256(oldChunk),
    newTextHash: sha256(newChunk),
    oldSample: oldChunk.slice(0, 200),
    newSample: newChunk.slice(0, 200),
    description:
      oldChunk.length === 0
        ? `Insert ${newChunk.length} bytes at offset ${firstDiff}`
        : newChunk.length === 0
          ? `Delete ${oldChunk.length} bytes at offset ${firstDiff}`
          : `Replace ${oldChunk.length} bytes at offset ${firstDiff} with ${newChunk.length} bytes`,
  });

  if (lastBeforeDiff < before.length) {
    const suffixText = before.slice(lastBeforeDiff);
    if (suffixText.length > 0) {
      preservedZones.push({
        kind: 'suffix_preserved',
        description: `Bytes ${lastBeforeDiff}–${before.length - 1} — suffix preserved unchanged`,
        byteStart: lastBeforeDiff,
        byteEnd: before.length,
        byteLength: suffixText.length,
        beforeHash: sha256(suffixText),
        afterHash: sha256(suffixText),
        sample: suffixText.length > 80 ? suffixText.slice(0, 80) : suffixText,
      });
    }
  }

  return { preservedZones, modifiedZones, movementZones: [] };
}
