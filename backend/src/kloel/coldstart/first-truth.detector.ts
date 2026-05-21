/**
 * UTP-COLDSTART-006 — First Truth Detector.
 *
 * Detects when a workspace has established its first commercial truth.
 * A commercial truth is a measurable outcome that confirms or refutes
 * a hypothesis with sufficient confidence.
 *
 * Detection signals:
 *  - at least one micro-test executed
 *  - payment or conversion events observed after test start
 *  - sufficient volume for confidence
 *
 * Pure function. Stateless.
 */
import type { SpineEventRef } from '../mind/mind.types';
import type { MicroTest } from './coldstart.types';

export interface FirstTruthDetectionInput {
  readonly events: readonly SpineEventRef[];
  readonly microTests: readonly MicroTest[];
  readonly workspaceId: string;
  readonly nowMs?: number | undefined;
}

export interface FirstTruthResult {
  readonly workspaceId: string;
  readonly truthEstablished: boolean;
  readonly confidence: number;
  readonly supportingEventCount: number;
  readonly testedHypothesisCount: number;
  readonly evidence: readonly string[];
  readonly detectedAt: string;
}

export function detectFirstTruth(input: FirstTruthDetectionInput): FirstTruthResult {
  const now = new Date(input.nowMs ?? Date.now()).toISOString();

  const executedTests = input.microTests.filter((t) => t.workspaceId === input.workspaceId);

  if (executedTests.length === 0) {
    return {
      workspaceId: input.workspaceId,
      truthEstablished: false,
      confidence: 0,
      supportingEventCount: 0,
      testedHypothesisCount: 0,
      evidence: [],
      detectedAt: now,
    };
  }

  const terminalEvents = input.events.filter(
    (e) =>
      e.workspaceId === input.workspaceId &&
      (e.eventName === 'commerce.payment.approved' ||
        e.eventName === 'commerce.lead.converted' ||
        e.eventName === 'commerce.crm.deal_won'),
  );

  const supportingEventCount = terminalEvents.length;
  const testedHypothesisCount = new Set(executedTests.map((t) => t.hypothesisTemplateId)).size;

  const confidence = computeConfidence(
    executedTests.length,
    supportingEventCount,
    testedHypothesisCount,
  );

  const truthEstablished = confidence >= 0.6;

  const evidence: string[] = [];
  if (executedTests.length > 0) {
    evidence.push(`${executedTests.length} micro-testes executados`);
  }
  if (supportingEventCount > 0) {
    evidence.push(`${supportingEventCount} eventos comerciais terminais observados`);
  }
  if (testedHypothesisCount > 0) {
    evidence.push(`${testedHypothesisCount} hipoteses testadas`);
  }

  return {
    workspaceId: input.workspaceId,
    truthEstablished,
    confidence,
    supportingEventCount,
    testedHypothesisCount,
    evidence,
    detectedAt: now,
  };
}

function computeConfidence(testCount: number, eventCount: number, hypothesisCount: number): number {
  if (testCount === 0) {
    return 0;
  }

  const testScore = Math.min(1, testCount / 3);
  const eventScore = Math.min(1, eventCount / 5);
  const hypothesisScore = Math.min(1, hypothesisCount / 2);

  return 0.4 * testScore + 0.35 * eventScore + 0.25 * hypothesisScore;
}
