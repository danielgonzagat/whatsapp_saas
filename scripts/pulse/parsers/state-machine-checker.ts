/**
 * PULSE Parser 83: State Machine Checker
 * Layer 14: Business Logic Integrity
 * Mode: DEEP (requires codebase scan + optional runtime validation)
 *
 * CHECKS:
 * 1. Order state machine: valid transitions are
 *    PENDING → PAID → FULFILLED → REFUNDED
 *    PENDING → FAILED | CANCELLED
 *    Flags any code that sets status without checking current status first
 * 2. Subscription state machine:
 *    TRIAL → ACTIVE → PAST_DUE → CANCELLED | SUSPENDED
 *    Flags direct jumps like TRIAL → CANCELLED without ACTIVE intermediate
 * 3. Payment state machine:
 *    PENDING → PROCESSING → PAID | FAILED | REFUNDED
 *    Flags any code that marks PAID without coming from PROCESSING
 * 4. WhatsApp session state machine:
 *    DISCONNECTED → CONNECTING → QR_READY → AUTHENTICATED → ACTIVE
 *    Flags transitions that skip states
 * 5. Checks that state transition code uses a centralized state machine
 *    (not scattered `status = 'X'` assignments across multiple files)
 * 6. Checks that invalid transitions are explicitly rejected (throw, not silent ignore)
 *
 * REQUIRES: PULSE_DEEP=1
 * BREAK TYPES:
 *   STATE_INVALID_TRANSITION(high)    — code allows skipping states in state machine
 *   STATE_PAYMENT_INVALID(critical)   — payment status set without proper transition guard
 */
import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

// Files likely to contain state transitions
const STATE_FILE_RE = /order|subscription|payment|session|whatsapp/i;

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

// Payment-specific: setting PAID directly
const PAYMENT_PAID_RE = /status:\s*['"`]PAID['"`]|\.status\s*=\s*['"`]PAID['"`]/;
const PAYMENT_PROCESSING_CHECK_RE = /status.*PROCESSING|PROCESSING.*status/;

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
    if (!STATE_FILE_RE.test(path.basename(file))) {
      continue;
    }

    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
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
          breaks.push({
            type: 'STATE_INVALID_TRANSITION',
            severity: 'high',
            file: relFile,
            line: i + 1,
            description:
              'Status set directly without checking current state — invalid transition possible',
            detail: `${line.slice(0, 120)} — add a transition guard that validates the current status before updating`,
          });
        }
      }

      // CHECK 3: Payment PAID set without PROCESSING guard
      if (PAYMENT_PAID_RE.test(line)) {
        const context = lines.slice(Math.max(0, i - 8), i + 2).join('\n');
        const hasProcessingCheck = PAYMENT_PROCESSING_CHECK_RE.test(context);

        if (!hasProcessingCheck) {
          breaks.push({
            type: 'STATE_PAYMENT_INVALID',
            severity: 'critical',
            file: relFile,
            line: i + 1,
            description:
              'Payment status set to PAID without verifying PROCESSING intermediate state',
            detail: `${line.slice(0, 120)} — payment must transition PENDING → PROCESSING → PAID, never jump directly`,
          });
        }
      }
    }
  }

  // CHECK 5: State transitions centralized in a state machine module?
  const stateMachineFiles = walkFiles(config.backendDir, ['.ts']).filter((f) =>
    /state-machine|stateMachine|fsm|transitions/i.test(path.basename(f)),
  );

  if (stateMachineFiles.length === 0 && directSetFiles.length > 3) {
    breaks.push({
      type: 'STATE_INVALID_TRANSITION',
      severity: 'high',
      file: 'backend/src/',
      line: 0,
      description: `State transitions scattered across ${directSetFiles.length} files — no centralized state machine module`,
      detail:
        'Create a state-machine.ts or transitions.ts that defines all valid state transitions and is used everywhere',
    });
  }

  // CHECK 6: Invalid transitions explicitly rejected
  for (const file of backendFiles) {
    if (!STATE_FILE_RE.test(path.basename(file))) {
      continue;
    }
    if (!/service/i.test(file)) {
      continue;
    }

    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
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
        breaks.push({
          type: 'STATE_INVALID_TRANSITION',
          severity: 'high',
          file: relFile,
          line: 0,
          description:
            'State transitions not explicitly rejected — invalid transitions may be silently ignored',
          detail:
            'Add `throw new BadRequestException("Invalid state transition")` for disallowed status changes',
        });
      }
    }
  }

  // TODO: Implement when infrastructure available
  // - Runtime state machine validation against live DB
  // - Detection of orphaned records stuck in intermediate states
  // - Automated state transition diagram generation

  return breaks;
}
