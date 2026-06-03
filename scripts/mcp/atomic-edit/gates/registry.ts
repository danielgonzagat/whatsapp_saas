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
import typeSoundnessGate from './type-soundness-gate.js';
import probeConvergenceGate from './probe-convergence-gate.js';
import deterministicHarnessGate from './deterministic-harness.js';
import propertyGate from './property-gate.js';
import formalGate from './formal-gate.js';
import livenessGate from './liveness-gate.js';
import behaviorContractGate from './behavior-contract-gate.js';
import reexportSymbolGate from './reexport-symbol-gate.js';
import prismaReferenceGate from './prisma-reference-gate.js';
import configKeyGate from './config-key-gate.js';
import structuralLintGate from './structural-lint-gate.js';
import lintFixGate from './lint-fix-gate.js';
import securityGate from './security-gate.js';
import testExecutionGate from './test-execution-gate.js';
import publicContractGate from './public-contract-gate.js';

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
  // Verification ladder, rung 3: in-memory overlay type-check — refuses a write that
  // introduces a NEW TypeScript error (delta vs prior; pre-existing debt tolerated).
  // Dynamic (runs the compiler) but side-effect-free; bails unjudged in the whole-repo lens.
  typeSoundnessGate,
  // Symbol half of the connection fact (red class #7): `export { Foo } from './m'` is
  // a dangling NAMED re-export when './m' resolves but does not EXPORT Foo. Static,
  // in-process ts-morph; NEW-only delta vs priorOf; star/unresolvable → unjudged.
  reexportSymbolGate,
  // Public-contract / breaking-change (proof #3): a write may not REMOVE an exported
  // name still imported by another file in the changed set — that orphans a live
  // consumer (binds to undefined). Static in-process ts-morph; NEW-only (removed vs
  // prior export surface); co-change exonerated; export*/unparseable → unjudged.
  publicContractGate,
  // Red class #11's tsc-blind escape hatch (Prisma): a `prismaAny.<accessor>` whose
  // accessor is not a real model camelCase, or a $queryRaw `FROM "<table>"` whose
  // quoted name is not a real @@map, dangles. Static, schema.prisma dictionary;
  // dynamic accessors / interpolated SQL → unjudged.
  prismaReferenceGate,
  // Config-key membership (red class #12): a literal `config.get('KEY')` whose KEY is
  // not in a CLOSED Joi validationSchema dangles (Joi rejects it at boot). Static,
  // overlay-aware schema scan; OPEN schema / non-literal key / no schema → unjudged.
  configKeyGate,
  // Stratum-1 structural-lint (the type-independent ESLint slice: unused-import,
  // no-useless-escape, no-empty, prefer-const). Static, tree-sitter perception; a
  // write may not INTRODUCE one (NEW-only delta); type-aware rules stay deferred.
  structuralLintGate,
  // Proof #3 security layer: a write may not INTRODUCE a hardcoded secret
  // (AWS/PEM/Stripe-live/GitHub/Slack/Google/JWT shape, or a high-entropy
  // secret-named assignment). Static regex+entropy byte fact; NEW-only delta vs
  // priorOf; placeholders/env exonerated. Perception ceiling: shape, not taint.
  securityGate,
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
  // Behavior-contract: a write must not silently change a fn's prior observed
  // outputs (over K seeded inputs) unless it co-commits @behavior-change-approved.
  // Needs prior-vs-new — converge runs it with the snapshotted prior on disk and
  // the candidate (NEW) in the overlay (see server-tools-converge dynamic path).
  behaviorContractGate,
  // Proof #3 test-execution layer: a write must not turn a previously-passing
  // `// @test-on-change cmd="…"` command into a failing one. Deterministic (run
  // twice; disagreement → unjudged), NEW-failure-only vs prior bytes. Distinct
  // from probe-convergence (reached-bit) and behavior-contract (output stability):
  // this is the canonical "the declared test still passes" execution fact.
  testExecutionGate,
  // Canonical-form drain (the mechanically-fixable, idempotent lint subset, ~prettier).
  // Pure in-process prettier.format over the overlay — NO file write, NO revert (safer
  // than probe-convergence). Reds a non-canonical file and exposes the byte-splice to
  // its canonical form via proposeFixes, so the convergence corpus spans formatting,
  // not just imports. Syntax-broken / no-parser / ignored → unjudged, never red.
  lintFixGate,
];

export interface UnifiedRed {
  gate: string;
  file: string;
  locus?: string;
  fact: string;
}
export type GateAdmissionPolicy = 'permissive' | 'strict';

export interface UnifiedUnjudged {
  gate: string;
  reason: string;
  note?: string;
  affectedFiles: string[];
}

export interface RegistryRun {
  green: boolean;
  reds: UnifiedRed[];
  /** gates whose invariant had no relevant fact/property in this change */
  notApplicable: string[];
  /** gates that honestly could not decide (threw, or returned unjudged) — never counted as red */
  unjudged: string[];
  /** structured evidence for every unjudged domain; the reader must show why unknown stayed unknown */
  unjudgedEvidence?: UnifiedUnjudged[];
  /** gates that actually applied to >=1 changed file and ran */
  ran: string[];
  /** permissive keeps historical lens behavior; strict is the Y write-admission law */
  admissionPolicy?: GateAdmissionPolicy;
}

/**
 * Run a set of gates over one context, mapping every red to a uniform shape. A
 * gate that throws or returns unjudged is recorded honest-unjudged. In the
 * historical permissive policy it does not become a red; in strict Y admission
 * it prevents green because "unjudged" is not approval.
 */
export async function runGates(
  gates: GateModule[],
  repoRoot: string,
  overlay: Map<string, string>,
  changedFiles: string[],
  lensMode = false,
  admissionPolicy: GateAdmissionPolicy = 'permissive',
): Promise<RegistryRun> {
  const reds: UnifiedRed[] = [];
  const notApplicable: string[] = [];
  const unjudged: string[] = [];
  const unjudgedEvidence: UnifiedUnjudged[] = [];
  const ran: string[] = [];
  for (const g of gates) {
    if (!changedFiles.some((f) => g.appliesTo(f))) continue;
    const affectedFiles = changedFiles.filter((f) => g.appliesTo(f)).slice(0, 50);
    ran.push(g.name);
    try {
      const res = await Promise.resolve(g.run(makeContext(repoRoot, overlay, changedFiles, lensMode)));
      if (res.notApplicable) {
        notApplicable.push(g.name);
        continue;
      }
      if (res.unjudged) {
        const reason = res.unjudgedReason ?? res.note ?? 'gate returned unjudged without a specific reason';
        unjudged.push(g.name);
        unjudgedEvidence.push({ gate: g.name, reason, note: res.note, affectedFiles });
        continue;
      }
      for (const r of res.reds) reds.push({ gate: res.gate, file: r.file, locus: r.locus, fact: r.fact });
    } catch (e) {
      const reason = `threw: ${e instanceof Error ? e.message : String(e)}`;
      unjudged.push(`${g.name} (${reason})`);
      unjudgedEvidence.push({ gate: g.name, reason, affectedFiles });
    }
  }
  const green = reds.length === 0 && (admissionPolicy === 'permissive' || unjudged.length === 0);
  return { green, reds, notApplicable, unjudged, unjudgedEvidence, ran, admissionPolicy };
}
