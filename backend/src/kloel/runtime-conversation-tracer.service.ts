import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';

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

export type ScopedRecordInput = {
  workspaceId: string;
  contactId: string;
  correlationId: string;
  kind: TracerStepKind;
  detail?: Record<string, unknown>;
};

export type ScopedGetTraceInput = {
  workspaceId: string;
  contactId: string;
  correlationId: string;
};

export type TraceEntry = {
  workspaceId: string;
  contactId: string;
  correlationId: string;
  events: TracerEvent[];
};

const DEFAULT_KEY = '__default__';
const MAX_TRACES = 100;
const TTL_MS = 3_600_000;

function scopedKey(input: ScopedGetTraceInput): string {
  return `${input.workspaceId}:${input.contactId}:${input.correlationId}`;
}

@Injectable()
export class RuntimeConversationTracerService {
  private readonly logger = StructuredLogger.from(RuntimeConversationTracerService.name);

  constructor() {
    this.logger.debug?.(`RuntimeConversationTracerService initialized`);
  }

  private traces = new Map<string, TracerEvent[]>();

  private ensureKey(key: string): TracerEvent[] {
    let events = this.traces.get(key);
    if (!events) {
      events = [];
      this.traces.set(key, events);
      this.evictIfNeeded();
    }
    return events;
  }

  private evictIfNeeded(): void {
    if (this.traces.size <= MAX_TRACES) {
      return;
    }

    const now = Date.now();
    const staleKeys: string[] = [];
    for (const [key, events] of this.traces) {
      if (key === DEFAULT_KEY) {
        continue;
      }
      const lastEvent = events.length > 0 ? events[events.length - 1] : null;
      const lastTimestamp = lastEvent?.timestamp ?? 0;
      if (now - lastTimestamp > TTL_MS) {
        staleKeys.push(key);
      }
    }
    for (const key of staleKeys) {
      this.traces.delete(key);
    }

    while (this.traces.size > MAX_TRACES) {
      let oldestKey = '';
      let oldestTimestamp = Infinity;
      for (const [key, events] of this.traces) {
        if (key === DEFAULT_KEY) {
          continue;
        }
        const firstEvent = events.length > 0 ? events[0] : null;
        const firstTimestamp = firstEvent?.timestamp ?? 0;
        if (firstTimestamp < oldestTimestamp) {
          oldestTimestamp = firstTimestamp;
          oldestKey = key;
        }
      }
      if (oldestKey) {
        this.traces.delete(oldestKey);
      } else {
        break;
      }
    }
  }

  record(input: ScopedRecordInput): void;
  record(kind: TracerStepKind, detail?: Record<string, unknown>): void;
  record(kindOrInput: TracerStepKind | ScopedRecordInput, detail?: Record<string, unknown>): void {
    if (typeof kindOrInput === 'object') {
      const { workspaceId, contactId, correlationId, kind, detail: inputDetail } = kindOrInput;
      const key = scopedKey({ workspaceId, contactId, correlationId });
      const events = this.ensureKey(key);
      events.push({ kind, timestamp: Date.now(), detail: inputDetail ?? {} });
      return;
    }

    const events = this.ensureKey(DEFAULT_KEY);
    events.push({ kind: kindOrInput, timestamp: Date.now(), detail: detail ?? {} });
  }

  getTrace(input: ScopedGetTraceInput): readonly TracerEvent[] {
    const key = scopedKey(input);
    return this.traces.get(key) ?? [];
  }

  listTraces(): TraceEntry[] {
    const entries: TraceEntry[] = [];
    for (const [key, events] of this.traces) {
      if (key === DEFAULT_KEY) {
        continue;
      }
      const [workspaceId, contactId, correlationId] = key.split(':');
      if (!workspaceId || !contactId || !correlationId) {
        continue;
      }
      entries.push({ workspaceId, contactId, correlationId, events });
    }
    return entries;
  }

  get events(): readonly TracerEvent[] {
    return this.traces.get(DEFAULT_KEY) ?? [];
  }

  steps(): readonly TracerStepKind[] {
    return this.events.map((e) => e.kind);
  }

  clear(): void {
    this.traces.clear();
  }

  toJSON(): string {
    return JSON.stringify(
      this.events.map((e) => ({
        kind: e.kind,
        timestamp: new Date(e.timestamp).toISOString(),
        detail: e.detail,
      })),
      null,
      2,
    );
  }

  assertSteps(expected: readonly TracerStepKind[]): void {
    const actual = this.steps();
    const missing = expected.filter((step) => !actual.includes(step));
    if (missing.length > 0) {
      throw new Error(`Missing tracer steps: ${missing.join(', ')}. Actual: ${actual.join(', ')}`);
    }
    const actualIndices = new Map(actual.map((step, index) => [step, index]));
    for (let i = 1; i < expected.length; i += 1) {
      const prev = expected[i - 1];
      const curr = expected[i];
      if (!prev || !curr) {
        continue;
      }
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
