import { GateMode, GateName } from './pulse-gates.types';

/**
 * UTP-PULSE-008 — Gate mode controller (log_only → hard_fail orchestrator).
 *
 * Implements PCI.4 §4.3 + Tabela §7. Maps each gate to the mode it should
 * run in for the current onda. The controller is consulted by every gate
 * factory at construction so the operator can re-tune modes via env var
 * without redeploying.
 *
 * Default policy is the "introduction" column from PCI.4 §7. Promotion to
 * `hard_fail` is a deliberate per-gate decision encoded here.
 *
 * Override via env var `KLOEL_PULSE_GATE_MODES` — comma-separated
 * `gateName=mode` pairs. Example:
 *   KLOEL_PULSE_GATE_MODES="no-roleplay=hard_fail,prompt-leakage=hard_fail"
 *
 * Invalid overrides are ignored with a console warning (no throw at boot).
 */

export const GATE_DEFAULT_MODE: Record<GateName, GateMode> = {
  // Onda 2 — hard_fail (promoted per PCI.4 §7)
  'no-roleplay': 'hard_fail',
  'identity-projection': 'hard_fail',
  'no-overclaim': 'hard_fail',
  'truth-mode-honesty': 'hard_fail',
  'evidence-provenance': 'hard_fail',
  'prompt-leakage': 'hard_fail',
  // Critical — hard_fail since Onda 1
  'lineage-integrity': 'hard_fail',
  'origin-immutability': 'hard_fail',
  'protected-files-firewall': 'hard_fail',
  'codacy-rigor-enforcer': 'hard_fail',
  // Future — log_only on introduction
  'ecosystem-privacy-guard': 'hard_fail',
  'internal-knowledge-leak-guard': 'log_only',
  'platform-bias-monitor': 'log_only',
  'disclosure-engine': 'log_only',
};

const VALID_GATE_NAMES = new Set<string>(Object.keys(GATE_DEFAULT_MODE));
const VALID_MODES = new Set<string>(['log_only', 'hard_fail']);

function parseOverrides(raw: string | undefined): Partial<Record<GateName, GateMode>> {
  if (!raw) return {};
  const out: Partial<Record<GateName, GateMode>> = {};
  const pairs = raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  for (const pair of pairs) {
    const [name, mode] = pair.split('=').map((s) => s.trim());
    if (!name || !mode || !VALID_GATE_NAMES.has(name) || !VALID_MODES.has(mode)) {
      process.emitWarning(`[gate-mode-controller] ignoring invalid override pair "${pair}"`);
      continue;
    }
    out[name as GateName] = mode as GateMode;
  }
  return out;
}

const OVERRIDES = parseOverrides(process.env['KLOEL_PULSE_GATE_MODES']);

/**
 * Resolve the effective mode for a given gate. Override > default.
 */
export function resolveGateMode(gate: GateName): GateMode {
  return OVERRIDES[gate] ?? GATE_DEFAULT_MODE[gate];
}

/**
 * Snapshot of every gate's effective mode. Useful for the PULSE truth
 * snapshot in the ABI (so the LLM knows which gates are advisory vs binding).
 */
export function effectiveGateModes(): Readonly<Record<GateName, GateMode>> {
  const map: Record<GateName, GateMode> = { ...GATE_DEFAULT_MODE };
  for (const [name, mode] of Object.entries(OVERRIDES)) {
    if (mode) map[name as GateName] = mode;
  }
  return Object.freeze(map);
}
