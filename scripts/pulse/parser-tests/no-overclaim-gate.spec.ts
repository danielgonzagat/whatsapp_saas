/**
 * Unit tests for the noOverclaimPass gate evaluator.
 *
 * Each test exercises one contradiction rule from evaluateNoOverclaimGate.
 * The test framework is the PULSE ParserTestSuite infrastructure.
 */

import { runParserSuite, formatTestResults, exitIfFailed } from './parser-test.framework';
import { evaluateNoOverclaimGate } from '../cert-gate-overclaim';
import type { PulseDirectiveSnapshot, PulseCertificateSnapshot } from '../cert-gate-overclaim';

type GateInput = {
  directive: PulseDirectiveSnapshot | null | undefined;
  certificate: PulseCertificateSnapshot | null | undefined;
};

function runGate(input: unknown): unknown {
  const { directive, certificate } = input as GateInput;
  return evaluateNoOverclaimGate(directive, certificate);
}

async function testNoOverclaimGate() {
  return runParserSuite('no-overclaim-gate', runGate, [
    // --- PASS cases ---
    {
      name: 'pass when no previous directive exists',
      input: {
        directive: null,
        certificate: null,
      } satisfies GateInput,
      expectedOutput: {
        status: 'pass',
        reason: 'No previous directive artifact found; overclaim check skipped for first run.',
        evidenceMode: 'inferred',
        confidence: 'low',
      },
    },
    {
      name: 'pass when verdicts and proof are coherent',
      input: {
        directive: {
          zeroPromptProductionGuidanceVerdict: 'NAO',
          productionAutonomyVerdict: 'NAO',
          authorityMode: 'autonomous-execution',
          advisoryOnly: false,
          autonomyReadiness: { canDeclareComplete: false },
          autonomyProof: {
            cycleProof: { proven: false, successfulNonRegressingCycles: 0 },
          },
        } satisfies PulseDirectiveSnapshot,
        certificate: { status: 'PARTIAL' } satisfies PulseCertificateSnapshot,
      } satisfies GateInput,
      expectedOutput: {
        status: 'pass',
        reason:
          'No internal contradictions detected between directive verdicts and supporting evidence.',
        evidenceMode: 'observed',
        confidence: 'high',
      },
    },
    {
      name: 'pass when SIM verdict is backed by proven cycles',
      input: {
        directive: {
          zeroPromptProductionGuidanceVerdict: 'SIM',
          productionAutonomyVerdict: 'SIM',
          authorityMode: 'certified-autonomous',
          advisoryOnly: false,
          autonomyReadiness: { canDeclareComplete: true },
          autonomyProof: {
            cycleProof: { proven: true, successfulNonRegressingCycles: 5 },
          },
        } satisfies PulseDirectiveSnapshot,
        certificate: { status: 'CERTIFIED' } satisfies PulseCertificateSnapshot,
      } satisfies GateInput,
      expectedOutput: {
        status: 'pass',
        reason:
          'No internal contradictions detected between directive verdicts and supporting evidence.',
        evidenceMode: 'observed',
        confidence: 'high',
      },
    },

    // --- FAIL cases (one per contradiction rule) ---

    // Rule a: zeroPromptProductionGuidanceVerdict=SIM but cycleProof not proven
    {
      name: 'fail rule-a: SIM verdict but cycleProof.proven=false',
      input: {
        directive: {
          zeroPromptProductionGuidanceVerdict: 'SIM',
          productionAutonomyVerdict: 'NAO',
          autonomyProof: {
            cycleProof: { proven: false, successfulNonRegressingCycles: 0 },
          },
        } satisfies PulseDirectiveSnapshot,
        certificate: null,
      } satisfies GateInput,
      expectedOutput: {
        status: 'fail',
        reason:
          'overclaim:zeroPromptProductionGuidanceVerdict — directive claims SIM but cycleProof.proven=false (successfulNonRegressingCycles=0).',
        failureClass: 'checker_gap',
        evidenceMode: 'observed',
        confidence: 'high',
        affectedCapabilityIds: undefined,
        affectedFlowIds: undefined,
      },
    },
    {
      name: 'fail rule-a: SIM verdict with missing cycleProof block',
      input: {
        directive: {
          zeroPromptProductionGuidanceVerdict: 'SIM',
        } satisfies PulseDirectiveSnapshot,
        certificate: null,
      } satisfies GateInput,
      expectedOutput: {
        status: 'fail',
        reason:
          'overclaim:zeroPromptProductionGuidanceVerdict — directive claims SIM but cycleProof.proven=missing (successfulNonRegressingCycles=0).',
        failureClass: 'checker_gap',
        evidenceMode: 'observed',
        confidence: 'high',
        affectedCapabilityIds: undefined,
        affectedFlowIds: undefined,
      },
    },

    // Rule b: productionAutonomyVerdict=SIM but certificate not CERTIFIED
    {
      name: 'fail rule-b: productionAutonomyVerdict=SIM but certificate PARTIAL',
      input: {
        directive: {
          zeroPromptProductionGuidanceVerdict: 'NAO',
          productionAutonomyVerdict: 'SIM',
          autonomyProof: {
            cycleProof: { proven: true, successfulNonRegressingCycles: 3 },
          },
        } satisfies PulseDirectiveSnapshot,
        certificate: { status: 'PARTIAL' } satisfies PulseCertificateSnapshot,
      } satisfies GateInput,
      expectedOutput: {
        status: 'fail',
        reason:
          'overclaim:productionAutonomyVerdict — directive claims SIM but certificate.status="PARTIAL".',
        failureClass: 'checker_gap',
        evidenceMode: 'observed',
        confidence: 'high',
        affectedCapabilityIds: undefined,
        affectedFlowIds: undefined,
      },
    },

    // Rule c: canDeclareComplete=true but productionAutonomyVerdict is not SIM
    {
      name: 'fail rule-c: canDeclareComplete=true but productionAutonomyVerdict=NAO',
      input: {
        directive: {
          productionAutonomyVerdict: 'NAO',
          autonomyReadiness: { canDeclareComplete: true },
          autonomyProof: {
            cycleProof: { proven: false, successfulNonRegressingCycles: 0 },
          },
        } satisfies PulseDirectiveSnapshot,
        certificate: null,
      } satisfies GateInput,
      expectedOutput: {
        status: 'fail',
        reason:
          'overclaim:autonomyReadiness.canDeclareComplete — readiness claims true but productionAutonomyVerdict="NAO".',
        failureClass: 'checker_gap',
        evidenceMode: 'observed',
        confidence: 'high',
        affectedCapabilityIds: undefined,
        affectedFlowIds: undefined,
      },
    },

    // Rule d: authorityMode=certified-autonomous but advisoryOnly=true
    {
      name: 'fail rule-d: certified-autonomous authority but advisoryOnly=true',
      input: {
        directive: {
          authorityMode: 'certified-autonomous',
          advisoryOnly: true,
        } satisfies PulseDirectiveSnapshot,
        certificate: null,
      } satisfies GateInput,
      expectedOutput: {
        status: 'fail',
        reason:
          'overclaim:authorityMode — authorityMode="certified-autonomous" contradicts advisoryOnly=true.',
        failureClass: 'checker_gap',
        evidenceMode: 'observed',
        confidence: 'high',
        affectedCapabilityIds: undefined,
        affectedFlowIds: undefined,
      },
    },

    // Rule e: certificate text mentions proven cycles but proof is false
    {
      name: 'fail rule-e: certificate text claims proven cycles but proof is false',
      input: {
        directive: {
          autonomyProof: {
            cycleProof: { proven: false, successfulNonRegressingCycles: 0 },
          },
        } satisfies PulseDirectiveSnapshot,
        certificate: {
          status: 'PARTIAL',
          rawContent: 'System has completed 3 proven non-regressing cycles as of last run.',
        } satisfies PulseCertificateSnapshot,
      } satisfies GateInput,
      expectedOutput: {
        status: 'fail',
        reason:
          'overclaim:certificate.rawContent — certificate text claims "proven non-regressing cycles" while cycleProof.proven=false.',
        failureClass: 'checker_gap',
        evidenceMode: 'observed',
        confidence: 'medium',
        affectedCapabilityIds: undefined,
        affectedFlowIds: undefined,
      },
    },

    // --- Current repo state: detects the KNOWN overclaim in PULSE_CLI_DIRECTIVE.json ---
    // Verifies that the gate catches the real contradiction described in the task.
    {
      name: 'detects known overclaim: SIM verdict with successfulNonRegressingCycles=0',
      input: {
        directive: {
          zeroPromptProductionGuidanceVerdict: 'SIM',
          productionAutonomyVerdict: 'NAO',
          advisoryOnly: false,
          authorityMode: 'autonomous-execution',
          autonomyReadiness: { canDeclareComplete: false },
          autonomyProof: {
            cycleProof: {
              proven: false,
              successfulNonRegressingCycles: 0,
            },
          },
        } satisfies PulseDirectiveSnapshot,
        certificate: { status: 'PARTIAL' } satisfies PulseCertificateSnapshot,
      } satisfies GateInput,
      expectedOutput: {
        status: 'fail',
        reason:
          'overclaim:zeroPromptProductionGuidanceVerdict — directive claims SIM but cycleProof.proven=false (successfulNonRegressingCycles=0).',
        failureClass: 'checker_gap',
        evidenceMode: 'observed',
        confidence: 'high',
        affectedCapabilityIds: undefined,
        affectedFlowIds: undefined,
      },
    },
  ]);
}

async function runNoOverclaimSpecs() {
  console.log('Running noOverclaimPass gate unit tests...\n');

  const suites = [await testNoOverclaimGate()];

  console.log(formatTestResults(suites));
  exitIfFailed(suites);
}

runNoOverclaimSpecs().catch((err) => {
  console.error('Test framework error:', err);
  process.exit(1);
});
