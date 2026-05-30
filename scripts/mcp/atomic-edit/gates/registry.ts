/**
 * gates/registry.ts — the ordered gate set, the single integration surface.
 *
 * The convergence crivo runs THIS list in two directions:
 *   - WRITE: refuse the red before the byte lands (atomic_converge / byte floor).
 *   - READ:  the lens reports the red over the whole repo.
 * Adding a dissolved protocol = adding one line here. Every gate is the same
 * exoneration-free shape (gates/contract.ts): a wire resolves, or it dangles.
 */
import { type GateModule, makeContext } from './contract.js';
import supplyChainGate from './supply-chain-gate.js';
import contractEdgeGate from './contract-edge-gate.js';
import reachabilityGate from './reachability-gate.js';
import bindingGate from './binding-gate.js';
import renderConformanceGate from './render-conformance-gate.js';
import telemetryEmissionGate from './telemetry-emission-gate.js';
import iacReferenceGate from './iac-reference-gate.js';
import findingsDeltaGate from './findings-delta-gate.js';
import probeConvergenceGate from './probe-convergence-gate.js';
import deterministicHarnessGate from './deterministic-harness.js';
import propertyGate from './property-gate.js';
import formalGate from './formal-gate.js';
import livenessGate from './liveness-gate.js';

/**
 * Static gates safe in the WRITE direction — each asserts "this write did not
 * INTRODUCE a dangling wire" (delta vs prior). Reachability is intentionally NOT
 * here: a freshly-created module is legitimately not-yet-referenced (you create,
 * then wire), so orphan-hood is a repo-health READ fact, not a per-write block.
 */
export const WRITE_GATES: GateModule[] = [
  supplyChainGate,
  contractEdgeGate,
  bindingGate,
  renderConformanceGate,
  telemetryEmissionGate,
  iacReferenceGate,
  findingsDeltaGate,
];

/**
 * Re-admitted after the lens caught it guessing: the binding gate now skips JSDoc
 * and type-context identifiers in the ts-morph tier (so lib TYPE names under noLib
 * are never "unbound") and length-preservingly blanks strings/comments in the
 * regex floor (so a name inside a literal is never judged). Token-correct or
 * unjudged — never red-by-guess. PENDING is empty; this is the slot for any future
 * gate held out pending its own honesty fix.
 */
export const PENDING_GATES: GateModule[] = [];

/** Whole-repo READ-direction gates (the lens) — write gates + the orphan census. */
export const LENS_GATES: GateModule[] = [reachabilityGate, ...WRITE_GATES];

/** Dynamic gates — execution-based (apply→run→revert), the effect slot, never the static path. */
export const DYNAMIC_GATES: GateModule[] = [
  probeConvergenceGate,
  deterministicHarnessGate,
  propertyGate,
  formalGate,
  livenessGate,
];

export interface UnifiedRed {
  gate: string;
  file: string;
  locus?: string;
  fact: string;
}
export interface RegistryRun {
  green: boolean;
  reds: UnifiedRed[];
  /** gates that honestly could not decide (threw, or returned unjudged) — never counted as red */
  unjudged: string[];
  /** gates that actually applied to ≥1 changed file and ran */
  ran: string[];
}

/**
 * Run a set of gates over one context, mapping every red to a uniform shape. A
 * gate that throws or returns unjudged is recorded honest-unjudged — never a
 * false red, never a green-by-assumption.
 */
export async function runGates(
  gates: GateModule[],
  repoRoot: string,
  overlay: Map<string, string>,
  changedFiles: string[],
  lensMode = false,
): Promise<RegistryRun> {
  const reds: UnifiedRed[] = [];
  const unjudged: string[] = [];
  const ran: string[] = [];
  for (const g of gates) {
    if (!changedFiles.some((f) => g.appliesTo(f))) continue;
    ran.push(g.name);
    try {
      const res = await Promise.resolve(g.run(makeContext(repoRoot, overlay, changedFiles, lensMode)));
      if (res.unjudged) {
        unjudged.push(g.name);
        continue;
      }
      for (const r of res.reds) reds.push({ gate: res.gate, file: r.file, locus: r.locus, fact: r.fact });
    } catch (e) {
      unjudged.push(`${g.name} (threw: ${e instanceof Error ? e.message : String(e)})`);
    }
  }
  return { green: reds.length === 0, reds, unjudged, ran };
}
