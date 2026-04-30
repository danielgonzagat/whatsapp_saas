/**
 * PULSE Parser 83: State Machine Checker
 * Layer 14: Business Logic Integrity
 * Mode: DEEP (requires codebase scan + optional runtime validation)
 *
 * DIAGNOSTICS:
 * Regex and curated status tokens are weak sensors only. They identify state
 * transition evidence that needs validation; they are not domain authority.
 *
 * CHECKS:
 * 1. Stateful flows must check current status before assigning a new terminal status
 * 2. Status changes that carry money-like state require an intermediate processing guard
 * 3. Authentication/session-like state transitions must not skip intermediate states
 * 5. Checks that state transition code uses a centralized state machine
 *    (not scattered `status = 'X'` assignments across multiple files)
 * 6. Checks that invalid transitions are explicitly rejected (throw, not silent ignore)
 *
 * REQUIRES: PULSE_DEEP=1
 * DIAGNOSTIC TYPES:
 *   Derived from observed predicates, for example:
 *   diagnostic:state-machine-checker:direct-status-assignment+missing-nearby-current-state-evidence
 */
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';

type StateMachineTruthMode = 'weak_signal' | 'confirmed_static';

type StateMachineDiagnosticBreak = Break & {
  truthMode: StateMachineTruthMode;
};

interface StateMachineDiagnosticInput {
  predicateKinds: string[];
  severity: Break['severity'];
  file: string;
  line: number;
  description: string;
  detail: string;
  truthMode: StateMachineTruthMode;
}

function buildStateMachineDiagnostic(
  input: StateMachineDiagnosticInput,
): StateMachineDiagnosticBreak {
  const predicateToken = input.predicateKinds
    .map((predicate) => predicate.replace(/[^a-z0-9]+/gi, '-').toLowerCase())
    .filter(Boolean)
    .join('+');

  return {
    type: `diagnostic:state-machine-checker:${predicateToken || 'state-transition-observation'}`,
    severity: input.severity,
    file: input.file,
    line: input.line,
    description: input.description,
    detail: input.detail,
    source: `regex-heuristic:state-machine-checker;truthMode=${input.truthMode};predicates=${input.predicateKinds.join(',')}`,
    surface: 'state-machine',
    truthMode: input.truthMode,
  };
}

// Direct status assignment patterns (not using a transition function)
const DIRECT_STATUS_SET_RE =
  /\.status\s*=\s*['"`](?:PAID|ACTIVE|FULFILLED|AUTHENTICATED|PROCESSING)['"`]/;
const PRISMA_STATUS_UPDATE_RE =
  /update\s*\(\s*\{[^}]*status:\s*['"`](?:PAID|ACTIVE|FULFILLED|AUTHENTICATED)['"`]/;

// Patterns indicating proper transition guard
const TRANSITION_GUARD_RE =
  /allowedTransitions|validTransitions|canTransition|stateMachine|fsm|transition\s*\(/i;
const STATUS_CHECK_RE =
  /current(Status|State)|fromStatus|fromState|existing\.status|record\.status/i;

// Money-like terminal state: setting PAID directly
const PAYMENT_PAID_RE = /status:\s*['"`]PAID['"`]|\.status\s*=\s*['"`]PAID['"`]/;
const PAYMENT_PROCESSING_CHECK_RE = /status.*PROCESSING|PROCESSING.*status/;
const STATEFUL_CONTENT_RE =
  /\b(?:status|state|currentStatus|currentState|transition|allowedTransitions|validTransitions)\b/i;
const MONEY_STATE_RE =
  /\b(?:amount|amountCents|total|subtotal|price|priceCents|currency|balance|saldo|fee|commission|refund|charge|ledger|transaction)\b/i;

/** Check state machine. */
export function checkStateMachine(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const backendFiles = walkFiles(config.backendDir, ['.ts']);

  // Track how many files set status directly vs. using transition functions
  const directSetFiles: string[] = [];
  const transitionGuardFiles: string[] = [];

  for (const file of backendFiles) {
    if (!/service|controller/i.test(file)) {
      continue;
    }
    if (/\.spec\.ts$/.test(file)) {
      continue;
    }

    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }
    if (!STATEFUL_CONTENT_RE.test(content)) {
      continue;
    }

    const relFile = path.relative(config.rootDir, file);
    const lines = content.split('\n');

    const hasTransitionGuard = TRANSITION_GUARD_RE.test(content);
    const hasStatusCheck = STATUS_CHECK_RE.test(content);

    if (hasTransitionGuard) {
      transitionGuardFiles.push(relFile);
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip comments
      if (line.startsWith('//') || line.startsWith('*') || line.startsWith('/*')) {
        continue;
      }

      // CHECK 1-4: Direct status assignment without transition guard
      if (DIRECT_STATUS_SET_RE.test(line) || PRISMA_STATUS_UPDATE_RE.test(line)) {
        // Look for status check in surrounding context (5 lines before)
        const context = lines.slice(Math.max(0, i - 5), i + 2).join('\n');
        const guardedByCheck = STATUS_CHECK_RE.test(context) || TRANSITION_GUARD_RE.test(context);

        if (!guardedByCheck) {
          directSetFiles.push(relFile);
          breaks.push(
            buildStateMachineDiagnostic({
              severity: 'high',
              file: relFile,
              line: i + 1,
              description: 'Static state-change signal lacks nearby current-state evidence',
              detail: `${line.slice(0, 120)} — weak static signal from assignment/update syntax; verify a current-state guard or transition validator before treating this as an invalid-transition finding`,
              predicateKinds: ['direct-status-assignment', 'missing-nearby-current-state-evidence'],
              truthMode: 'weak_signal',
            }),
          );
        }
      }

      // CHECK 3: Money-like terminal state signal without nearby intermediate-state evidence
      if (PAYMENT_PAID_RE.test(line) && MONEY_STATE_RE.test(content)) {
        const context = lines.slice(Math.max(0, i - 40), i + 2).join('\n');
        const hasProcessingCheck =
          PAYMENT_PROCESSING_CHECK_RE.test(context) ||
          /validatePaymentTransition\s*\([\s\S]*['"`](?:APPROVED|PAID)['"`]/.test(context);

        if (!hasProcessingCheck) {
          breaks.push(
            buildStateMachineDiagnostic({
              severity: 'critical',
              file: relFile,
              line: i + 1,
              description:
                'Money-like state-change signal lacks nearby intermediate-state evidence',
              detail: `${line.slice(0, 120)} — weak static signal from money-like content plus terminal status syntax; verify the domain transition source of truth before treating this as a skipped-intermediate-state finding`,
              predicateKinds: [
                'money-like-content',
                'terminal-status-syntax',
                'missing-processing-evidence',
              ],
              truthMode: 'weak_signal',
            }),
          );
        }
      }
    }
  }

  // CHECK 5: Centralized state-machine evidence by filename convention.
  const stateMachineFiles = walkFiles(config.backendDir, ['.ts']).filter((f) =>
    /state-machine|stateMachine|fsm|transitions/i.test(path.basename(f)),
  );

  if (stateMachineFiles.length === 0 && directSetFiles.length > 3) {
    breaks.push(
      buildStateMachineDiagnostic({
        severity: 'high',
        file: 'backend/src/',
        line: 0,
        description: `Static scan found state-change signals across ${directSetFiles.length} files without centralized filename evidence`,
        detail:
          'Filename and regex evidence did not identify a state-machine/transitions module. This is a weak architecture signal; confirm the real transition authority before prescribing a module shape.',
        predicateKinds: ['direct-status-assignment-files', 'missing-centralized-filename-evidence'],
        truthMode: 'weak_signal',
      }),
    );
  }

  // CHECK 6: Nearby explicit rejection evidence for state transition code.
  for (const file of backendFiles) {
    if (!/service/i.test(file)) {
      continue;
    }

    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }
    if (!STATEFUL_CONTENT_RE.test(content)) {
      continue;
    }

    const relFile = path.relative(config.rootDir, file);

    // If file has status assignments but no throw/BadRequest for invalid transitions
    if (DIRECT_STATUS_SET_RE.test(content) || PRISMA_STATUS_UPDATE_RE.test(content)) {
      if (
        !/throw.*invalid.*transition|throw.*cannot.*status|BadRequestException.*status/i.test(
          content,
        )
      ) {
        breaks.push(
          buildStateMachineDiagnostic({
            severity: 'high',
            file: relFile,
            line: 0,
            description: 'Static state-change signal lacks explicit rejection evidence',
            detail:
              'Weak static scan found status assignment/update syntax without a nearby invalid-transition rejection pattern. Confirm the real state-machine authority before prescribing exception text.',
            predicateKinds: [
              'direct-status-assignment',
              'missing-invalid-transition-rejection-evidence',
            ],
            truthMode: 'weak_signal',
          }),
        );
      }
    }
  }

  // TODO: Implement when infrastructure available
  // - Runtime state machine validation against live DB
  // - Detection of orphaned records stuck in intermediate states
  // - Automated state transition diagram generation

  return breaks;
}
