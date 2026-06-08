import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { REPO_ROOT } from './guard.js';
import { atomicWrite } from './server-helpers-io.js';

const MEMORY_REL = '.atomic/learning/intent-converge-gate-failures.jsonl';
const MEMORY_ABS = path.join(REPO_ROOT, MEMORY_REL);
const MAX_EVENTS = 500;

export interface IntentFailureLearningEvent {
  schema: 'atomic.intent.failure-learning.v1';
  at: string;
  goalHash: string;
  targetIntegration: string;
  kind: string;
  gates: string[];
  residualFacts: string[];
  acceptedSplices: string[];
}

export interface IntentFailurePrediction {
  memoryFile: string;
  totalMatchingFailures: number;
  gateCounts: Record<string, number>;
  likelyFailureGates: string[];
  priorFailureProbability: number;
  reason: string;
}

function goalHash(goal: string): string {
  return crypto.createHash('sha256').update(goal.trim().toLowerCase()).digest('hex');
}

function readEvents(): IntentFailureLearningEvent[] {
  let raw = '';
  try {
    raw = fs.readFileSync(MEMORY_ABS, 'utf8');
  } catch {
    return [];
  }
  const events: IntentFailureLearningEvent[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as IntentFailureLearningEvent;
      if (parsed.schema === 'atomic.intent.failure-learning.v1') events.push(parsed);
    } catch {
      // Corrupt learning rows are ignored rather than trusted as evidence.
    }
  }
  return events.slice(-MAX_EVENTS);
}

function predictionFrom(events: readonly IntentFailureLearningEvent[]): IntentFailurePrediction {
  const gateCounts: Record<string, number> = {};
  for (const event of events) {
    for (const gate of event.gates) gateCounts[gate] = (gateCounts[gate] ?? 0) + 1;
  }
  const likelyFailureGates = Object.entries(gateCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([gate]) => gate);
  const totalMatchingFailures = events.length;
  return {
    memoryFile: MEMORY_REL,
    totalMatchingFailures,
    gateCounts,
    likelyFailureGates,
    priorFailureProbability: Number((totalMatchingFailures / (totalMatchingFailures + 2)).toFixed(3)),
    reason: totalMatchingFailures === 0
      ? 'no prior matching failures recorded for this intent/integration'
      : `observed ${totalMatchingFailures} prior matching failure(s); likely gates: ${likelyFailureGates.join(', ') || 'none'}`,
  };
}

export function summarizeIntentFailureMemory(goal: string, targetIntegration: string): IntentFailurePrediction {
  const hash = goalHash(goal);
  const events = readEvents().filter((event) => event.goalHash === hash && event.targetIntegration === targetIntegration);
  return predictionFrom(events);
}

export function recordIntentFailureLearning(args: {
  goal: string;
  targetIntegration: string;
  kind: string;
  gates: readonly string[];
  residualFacts: readonly string[];
  acceptedSplices: readonly string[];
}): IntentFailureLearningEvent {
  const event: IntentFailureLearningEvent = {
    schema: 'atomic.intent.failure-learning.v1',
    at: new Date().toISOString(),
    goalHash: goalHash(args.goal),
    targetIntegration: args.targetIntegration,
    kind: args.kind,
    gates: [...new Set(args.gates)].sort(),
    residualFacts: [...args.residualFacts].slice(0, 20),
    acceptedSplices: [...args.acceptedSplices].slice(0, 20),
  };
  const existing = readEvents();
  const lines = [...existing.slice(-(MAX_EVENTS - 1)), event].map((entry) => JSON.stringify(entry));
  atomicWrite(MEMORY_ABS, lines.join('\n') + '\n');
  return event;
}
