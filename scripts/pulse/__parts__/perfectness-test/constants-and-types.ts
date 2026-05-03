import type {
  GateEvidencePlan,
  PerfectnessGate,
  PerfectnessPhase,
} from '../../types.perfectness-test';

const ARTIFACT_FILE_NAME = 'PULSE_PERFECTNESS_RESULT.json';
const PULSE_CERTIFICATE_FILE = 'PULSE_CERTIFICATE.json';
const PULSE_AUTONOMY_STATE_FILE = 'PULSE_AUTONOMY_STATE.json';
const PULSE_SANDBOX_STATE_FILE = 'PULSE_SANDBOX_STATE.json';
const SCENARIO_EVIDENCE_FILE = 'PULSE_SCENARIO_EVIDENCE.json';

// ────────────────────────────────────────────────────────────────────────────
// Gate Definitions (canonical 8-gate suite)
// ────────────────────────────────────────────────────────────────────────────

/**
 * The canonical 8-gate perfectness evaluation suite.
 *
 * Each gate defines what is being checked, the target condition,
 * and a plain-language description.
 */
const PERFECTNESS_EVALUATION_KERNEL_GRAMMAR = [
  {
    name: 'pulse-core-green',
    description: 'All PULSE certification gates pass',
    target: 'All certification gates status=pass AND score >= 50',
    phase: 'validation' as PerfectnessPhase,
  },
  {
    name: 'product-core-green',
    description: 'All critical capabilities are real (not partial/latent/phantom)',
    target: 'Certification score >= 60 (proxy for critical capability health)',
    phase: 'validation' as PerfectnessPhase,
  },
  {
    name: 'e2e-core-pass',
    description: 'Scenario pass rate meets threshold',
    target: 'scenario pass rate >= 90%',
    phase: 'validation' as PerfectnessPhase,
  },
  {
    name: 'runtime-stable',
    description: 'No new critical failures during evaluation period',
    target: 'new critical errors = 0',
    phase: 'autonomous_work' as PerfectnessPhase,
  },
  {
    name: 'no-regression',
    description: 'Final score not lower than start score',
    target: 'score end >= score start',
    phase: 'verdict' as PerfectnessPhase,
  },
  {
    name: 'no-rollback-unrecovered',
    description: 'All rollbacks successfully recovered',
    target: 'unrecovered rollbacks = 0',
    phase: 'autonomous_work' as PerfectnessPhase,
  },
  {
    name: 'no-protected-violation',
    description: 'Zero protected file changes during autonomous work',
    target: 'protected violations = 0',
    phase: 'autonomous_work' as PerfectnessPhase,
  },
  {
    name: '72h-elapsed',
    description: 'At least 72 hours of autonomous work completed',
    target: 'duration >= 72h',
    phase: 'verdict' as PerfectnessPhase,
  },
] as const;

// ────────────────────────────────────────────────────────────────────────────
// State File Interfaces
// ────────────────────────────────────────────────────────────────────────────

interface PulseCertState {
  score?: number;
  certified?: boolean;
  status?: string;
  gates?: Record<string, { status?: string; reason?: string }>;
  capabilities?: Array<{ health?: string }>;
}

interface PulseAutonomyState {
  iterations?: Array<{
    accepted: boolean;
    rollback?: boolean;
    recovered?: boolean;
  }>;
  startedAt?: string;
  generatedAt?: string;
  totalIterations?: number;
  acceptedIterations?: number;
  rejectedIterations?: number;
  rollbacks?: number;
  status?: string;
  cycles?: Array<{
    startedAt?: string;
    finishedAt?: string;
    phase?: string;
    result?: string;
    unitId?: string | null;
    filesChanged?: string[];
    scoreBefore?: number;
    scoreAfter?: number;
  }>;
}

interface PulseSandboxState {
  summary?: {
    totalDestructiveActions?: number;
    governanceViolations?: number;
  };
  activeWorkspaces?: Array<{
    patches?: Array<{ safe: boolean }>;
  }>;
  protectedFiles?: string[];
}

interface PulseScenarioEvidence {
  scenarios?: Array<{
    passStatus?: string;
    passRate?: number;
    executed?: boolean;
  }>;
  summary?: {
    passRate?: number;
    totalExecuted?: number;
    totalPassed?: number;
  };
}

type GateEvaluationContext = {
  name: string;
  description: string;
  target: string;
  evidencePlan: GateEvidencePlan | null;
  pulseDir: string;
  startScore: number;
  startTime: string;
  cert: PulseCertState | null;
  autonomy: PulseAutonomyState | null;
  sandbox: PulseSandboxState | null;
  scenarioData: { rate: number; total: number; passed: number };
};

type GateEvaluationRule = {
  supports: (context: GateEvaluationContext) => boolean;
  evaluate: (context: GateEvaluationContext) => PerfectnessGate;
};

type GateMetric = {
  count: number;
  labels: string[];
};

export {
  ARTIFACT_FILE_NAME,
  GateEvaluationContext,
  GateEvaluationRule,
  GateMetric,
  PERFECTNESS_EVALUATION_KERNEL_GRAMMAR,
  PulseAutonomyState,
  PulseCertState,
  PulseSandboxState,
  PulseScenarioEvidence,
  PULSE_AUTONOMY_STATE_FILE,
  PULSE_CERTIFICATE_FILE,
  PULSE_SANDBOX_STATE_FILE,
  SCENARIO_EVIDENCE_FILE,
};
