import { Injectable } from '@nestjs/common';

export const TRACER_STEP_KINDS = [
  'step1_inbox_recorded',
  'step2_contact_resolved',
  'step3_memory_queried',
  'step4_concept_classified',
  'step5_policy_chose',
  'step6_determinism_gate',
  'step7_composer_produced',
  'step8_transport_invoked',
  'step9_outcome_recorded',
  'step10_outcome_closed',
  'step11_belief_updated',
  'step12_evidence_consultable',
] as const;

export type TracerStepKind = (typeof TRACER_STEP_KINDS)[number];

export type TracerEvent = {
  kind: TracerStepKind;
  timestamp: number;
  detail: Record<string, unknown>;
};

@Injectable()
export class RuntimeConversationTracerService {
  private trace: TracerEvent[] = [];

  record(kind: TracerStepKind, detail: Record<string, unknown> = {}): void {
    this.trace.push({ kind, timestamp: Date.now(), detail });
  }

  get events(): readonly TracerEvent[] {
    return this.trace;
  }

  steps(): readonly TracerStepKind[] {
    return this.trace.map((e) => e.kind);
  }

  clear(): void {
    this.trace = [];
  }

  toJSON(): string {
    return JSON.stringify(
      this.trace.map((e) => ({ kind: e.kind, timestamp: new Date(e.timestamp).toISOString(), detail: e.detail })),
      null,
      2,
    );
  }

  assertSteps(expected: readonly TracerStepKind[]): void {
    const actual = this.steps();
    const missing = expected.filter((step) => !actual.includes(step));
    if (missing.length > 0) {
      throw new Error(
        `Missing tracer steps: ${missing.join(', ')}. Actual: ${actual.join(', ')}`,
      );
    }
    const actualIndices = new Map(actual.map((step, index) => [step, index]));
    for (let i = 1; i < expected.length; i++) {
      const prev = expected[i - 1];
      const curr = expected[i];
      if (!prev || !curr) continue;
      const prevIdx = actualIndices.get(prev);
      const currIdx = actualIndices.get(curr);
      if (prevIdx != null && currIdx != null && currIdx < prevIdx) {
        throw new Error(
          `Step order violation: ${curr} (index ${currIdx}) occurred before ${prev} (index ${prevIdx})`,
        );
      }
    }
  }
}
