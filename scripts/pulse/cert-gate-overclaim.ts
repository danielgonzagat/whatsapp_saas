/**
 * noOverclaimPass gate evaluator.
 *
 * Detects internal contradictions in PULSE artifact claims.
 * A directive or certificate that simultaneously asserts a positive verdict
 * while its own evidence fields contradict that verdict is an "overclaim".
 *
 * This gate is pure: callers supply the pre-loaded artifact data; no I/O here.
 */
import type { PulseGateResult } from './types';
import { gateFail } from './cert-gate-evaluators';

/** Minimal shape of the cycleProof sub-object inside autonomyProof. */
export interface PulseCycleProof {
  /** Whether the required number of non-regressing cycles was proven. */
  proven: boolean;
  /** Number of successfully completed non-regressing cycles. */
  successfulNonRegressingCycles?: number;
}

/** Minimal shape of the autonomyReadiness sub-object in the directive. */
export interface PulseAutonomyReadiness {
  /** Whether PULSE has a safe next autonomous unit. This is not completion proof. */
  canWorkNow?: boolean;
  /** Whether the system can declare completion without human confirmation. */
  canDeclareComplete?: boolean;
}

/** Minimal proof-readiness summary used to prevent planned/inferred proof overclaims. */
export interface PulseProofReadinessSummary {
  canAdvance?: boolean;
  status?: string;
  plannedEvidence?: number;
  inferredEvidence?: number;
  notAvailableEvidence?: number;
  nonObservedEvidence?: number;
  executableUnproved?: number;
  plannedOrUnexecutedEvidence?: number;
  blockedHumanRequired?: number;
  blockedNotExecutable?: number;
}

/** Minimal shape of the autonomyProof sub-object in the directive. */
export interface PulseAutonomyProof {
  /** The cycle proof that backs production-autonomy verdicts. */
  cycleProof?: PulseCycleProof;
  /** Optional proof-readiness summary embedded by newer directive artifacts. */
  proofReadiness?: PulseProofReadinessSummary;
}

/**
 * Minimal, typed subset of PULSE_CLI_DIRECTIVE.json that the gate needs.
 * All fields are optional to keep the gate resilient against schema evolution.
 */
export interface PulseDirectiveSnapshot {
  /** Top-level verdict: "SIM" when the system claims zero-prompt production guidance. */
  zeroPromptProductionGuidanceVerdict?: string;
  /** Top-level verdict: "SIM" when the system claims full production autonomy. */
  productionAutonomyVerdict?: string;
  /** The nested proof block that should back the verdicts above. */
  autonomyProof?: PulseAutonomyProof;
  /** The authority mode claimed for this run. */
  authorityMode?: string;
  /** Whether this directive is advisory-only (no autonomous actions allowed). */
  advisoryOnly?: boolean;
  /** Readiness sub-object. */
  autonomyReadiness?: PulseAutonomyReadiness;
  /** Optional top-level proof-readiness summary from PULSE_PROOF_READINESS. */
  proofReadiness?: PulseProofReadinessSummary;
}

/**
 * Minimal, typed subset of PULSE_CERTIFICATE.json that the gate needs.
 */
export interface PulseCertificateSnapshot {
  /** Certification status from the last completed run. */
  status?: string;
  /** Stringified content – used for textual contradiction scan. */
  rawContent?: string;
}

function firstNumber(...values: Array<number | undefined>): number {
  return values.find((value): value is number => typeof value === 'number') ?? 0;
}

function resolveProofReadinessSummary(
  directive: PulseDirectiveSnapshot,
): PulseProofReadinessSummary | undefined {
  return directive.proofReadiness ?? directive.autonomyProof?.proofReadiness;
}

export function hasProductionProofReadinessGap(
  summary: PulseProofReadinessSummary | undefined,
): boolean {
  if (!summary) {
    return false;
  }

  return (
    summary.canAdvance === false ||
    (summary.status !== undefined && summary.status !== 'ready') ||
    firstNumber(summary.plannedEvidence, summary.plannedOrUnexecutedEvidence) > 0 ||
    firstNumber(summary.inferredEvidence) > 0 ||
    firstNumber(summary.notAvailableEvidence) > 0 ||
    firstNumber(summary.nonObservedEvidence, summary.plannedOrUnexecutedEvidence) > 0 ||
    firstNumber(summary.executableUnproved) > 0 ||
    firstNumber(summary.blockedHumanRequired) > 0 ||
    firstNumber(summary.blockedNotExecutable) > 0
  );
}

export function formatProofReadinessGap(summary: PulseProofReadinessSummary): string {
  return [
    `status=${summary.status ?? 'unknown'}`,
    `canAdvance=${String(summary.canAdvance ?? 'unknown')}`,
    `planned=${firstNumber(summary.plannedEvidence, summary.plannedOrUnexecutedEvidence)}`,
    `inferred=${firstNumber(summary.inferredEvidence)}`,
    `not_available=${firstNumber(summary.notAvailableEvidence)}`,
    `nonObserved=${firstNumber(summary.nonObservedEvidence, summary.plannedOrUnexecutedEvidence)}`,
    `executableUnproved=${firstNumber(summary.executableUnproved)}`,
  ].join(', ');
}

/**
 * Evaluate the noOverclaimPass gate.
 *
 * Returns pass:true when no contradictions are found.
 * Returns a structured fail with reason 'overclaim:{field}' for the first
 * contradiction detected.
 *
 * Contradiction rules checked in order:
 *  a) zeroPromptProductionGuidanceVerdict=SIM but cycleProof.proven=false
 *  b) productionAutonomyVerdict=SIM but certificate.status is not CERTIFIED
 *  c) autonomyReadiness.canDeclareComplete=true but productionAutonomyVerdict is not SIM
 *  d) authorityMode=certified-autonomous but advisoryOnly=true
 *  e) certificate raw text mentions "proven non-regressing cycles" while cycleProof.proven=false
 */
export function evaluateNoOverclaimGate(
  directive: PulseDirectiveSnapshot | null | undefined,
  certificate: PulseCertificateSnapshot | null | undefined,
): PulseGateResult {
  if (!directive) {
    return {
      status: 'pass',
      reason: 'No previous directive artifact found; overclaim check skipped for first run.',
      evidenceMode: 'inferred',
      confidence: 'low',
    };
  }

  const cycleProof = directive.autonomyProof?.cycleProof;
  const proofReadiness = resolveProofReadinessSummary(directive);
  const productionProofReadinessGap = hasProductionProofReadinessGap(proofReadiness);

  // Rule a: zeroPromptProductionGuidanceVerdict=SIM but cycleProof not proven
  if (directive.zeroPromptProductionGuidanceVerdict === 'SIM') {
    if (!cycleProof || cycleProof.proven !== true) {
      const cycles = cycleProof?.successfulNonRegressingCycles ?? 0;
      return gateFail(
        `overclaim:zeroPromptProductionGuidanceVerdict — directive claims SIM but cycleProof.proven=${String(cycleProof?.proven ?? 'missing')} (successfulNonRegressingCycles=${cycles}).`,
        'checker_gap',
        { evidenceMode: 'observed', confidence: 'high' },
      );
    }
  }

  // Rule b: productionAutonomyVerdict=SIM but certificate status is not CERTIFIED
  if (directive.productionAutonomyVerdict === 'SIM' && certificate) {
    if (certificate.status !== 'CERTIFIED') {
      return gateFail(
        `overclaim:productionAutonomyVerdict — directive claims SIM but certificate.status="${certificate.status ?? 'unknown'}".`,
        'checker_gap',
        { evidenceMode: 'observed', confidence: 'high' },
      );
    }
  }
  if (directive.productionAutonomyVerdict === 'SIM' && productionProofReadinessGap) {
    return gateFail(
      `overclaim:productionAutonomyVerdict — directive claims SIM but proofReadiness has non-observed production proof (${formatProofReadinessGap(proofReadiness ?? {})}).`,
      'checker_gap',
      { evidenceMode: 'observed', confidence: 'high' },
    );
  }

  // Rule c: canDeclareComplete=true but productionAutonomyVerdict is not SIM
  if (directive.autonomyReadiness?.canDeclareComplete === true) {
    if (directive.productionAutonomyVerdict !== 'SIM') {
      return gateFail(
        `overclaim:autonomyReadiness.canDeclareComplete — readiness claims true but productionAutonomyVerdict="${directive.productionAutonomyVerdict ?? 'missing'}".`,
        'checker_gap',
        { evidenceMode: 'observed', confidence: 'high' },
      );
    }
    if (productionProofReadinessGap) {
      return gateFail(
        `overclaim:autonomyReadiness.canDeclareComplete — readiness claims true but proofReadiness has non-observed production proof (${formatProofReadinessGap(proofReadiness ?? {})}).`,
        'checker_gap',
        { evidenceMode: 'observed', confidence: 'high' },
      );
    }
  }

  // Rule d: authorityMode=certified-autonomous but advisoryOnly=true
  if (directive.authorityMode === 'certified-autonomous' && directive.advisoryOnly === true) {
    return gateFail(
      'overclaim:authorityMode — authorityMode="certified-autonomous" contradicts advisoryOnly=true.',
      'checker_gap',
      { evidenceMode: 'observed', confidence: 'high' },
    );
  }

  // Rule e: certificate text mentions "proven non-regressing cycles" but proof not established
  if (certificate?.rawContent && cycleProof?.proven === false) {
    const provenPhrase = 'proven non-regressing cycles';
    if (certificate.rawContent.toLowerCase().includes(provenPhrase)) {
      return gateFail(
        `overclaim:certificate.rawContent — certificate text claims "${provenPhrase}" while cycleProof.proven=false.`,
        'checker_gap',
        { evidenceMode: 'observed', confidence: 'medium' },
      );
    }
  }

  return {
    status: 'pass',
    reason:
      'No internal contradictions detected between directive verdicts and supporting evidence.',
    evidenceMode: 'observed',
    confidence: 'high',
  };
}
