import type { CapabilityRegistrySnapshot } from '../capability-registry/capability-registry.types';
import { fail, Gate, GateMode, GateVerdict, pass } from './pulse-gates.types';

export interface NoOverclaimInput {
  readonly abiPayload: unknown;
  readonly registrySnapshot?: CapabilityRegistrySnapshot;
}

const MEASURED_BY = 'no-overclaim.gate' as const;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function buildRegistryMap(
  snapshot: CapabilityRegistrySnapshot | undefined,
): ReadonlyMap<string, { consecutiveFailures: number }> {
  if (!snapshot) return new Map();
  const map = new Map<string, { consecutiveFailures: number }>();
  for (const rec of snapshot.records) {
    map.set(rec.id, { consecutiveFailures: rec.consecutiveFailures });
  }
  return map;
}

function extractAvailable(
  payload: unknown,
): readonly { idx: number; cap: Record<string, unknown> }[] {
  if (!isObject(payload)) return [];
  const caps = payload['capabilities'];
  if (!isObject(caps)) return [];
  const available = caps['available'];
  if (!Array.isArray(available)) return [];
  const out: { idx: number; cap: Record<string, unknown> }[] = [];
  available.forEach((cap, idx) => {
    if (isObject(cap)) out.push({ idx, cap });
  });
  return out;
}

function normalizeInput(raw: unknown): NoOverclaimInput {
  if (isObject(raw) && 'abiPayload' in raw) {
    return raw as unknown as NoOverclaimInput;
  }
  return { abiPayload: raw };
}

export function makeNoOverclaimGate(mode: GateMode = 'hard_fail'): Gate<unknown> {
  return {
    name: 'no-overclaim',
    mode,
    check: (raw: unknown): GateVerdict => {
      const input = normalizeInput(raw);
      const payload = input.abiPayload;
      if (!isObject(payload)) {
        return fail(
          'no-overclaim',
          mode,
          MEASURED_BY,
          'ABI payload is not a plain object',
          [{ detail: 'payload must be a plain object to check overclaim' }],
        );
      }

      const available = extractAvailable(payload);
      if (available.length === 0) {
        return pass('no-overclaim', mode, MEASURED_BY);
      }

      const registryMap = buildRegistryMap(input.registrySnapshot);
      const evidence: { path: string; detail: string }[] = [];

      for (const { idx, cap } of available) {
        const id = typeof cap['capabilityId'] === 'string' ? cap['capabilityId'] : '?';
        const maturity = cap['maturity'];
        const evidencePct = cap['runtimeEvidencePct'];

        if (maturity === 'operational' || maturity === 'productionReady') {
          if (typeof evidencePct !== 'number' || !(evidencePct > 0)) {
            evidence.push({
              path: `$.capabilities.available[${idx}]`,
              detail: `capability "${id}" declared as ${String(maturity)} without runtime evidence (runtimeEvidencePct=${String(evidencePct)})`,
            });
          }
        }

        if (input.registrySnapshot && typeof id === 'string' && id !== '?' && !registryMap.has(id)) {
          evidence.push({
            path: `$.capabilities.available[${idx}]`,
            detail: `capability "${id}" referenced in ABI but not found in capability-registry`,
          });
        }

        if (
          input.registrySnapshot &&
          maturity === 'productionReady' &&
          typeof id === 'string' &&
          id !== '?'
        ) {
          const record = registryMap.get(id);
          if (record && record.consecutiveFailures >= 3) {
            evidence.push({
              path: `$.capabilities.available[${idx}]`,
              detail: `capability "${id}" declared productionReady but has ${record.consecutiveFailures} consecutive failures in registry`,
            });
          }
        }
      }

      if (evidence.length === 0) {
        return pass('no-overclaim', mode, MEASURED_BY);
      }

      return fail(
        'no-overclaim',
        mode,
        MEASURED_BY,
        `${evidence.length} capability overclaim detected`,
        evidence,
      );
    },
  };
}
