// PULSE — Wave 7 Module B: Structural Memory Engine
//
// Persistent per-unit memory that tracks attempt history, learns which
// strategies work on which kinds of units, and escalates repeated automated
// failures into validation strategies that remain autonomous.
//
// Two persistence layers:
//   1. `.pulse/current/PULSE_STRUCTURAL_MEMORY.json` — aggregate state
//   2. `.pulse/audit/structural-memory.audit.jsonl` — append-only attempt log

export {
  fingerprintStrategy,
  recordAttempt,
  detectRepeatedFailures,
  getLearnedPatterns,
  markFalsePositive,
  markAcceptedRisk,
  markStaleEvidence,
  learnPatterns,
  buildStructuralMemoryState,
  buildStructuralMemory,
  checkForRepeatedFailures,
  loadAttemptHistory,
} from './__parts__/structural-memory/public-api';
