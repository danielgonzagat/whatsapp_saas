import * as path from 'path';

import type { ExitAction, GateExitCondition } from '../../types.perfectness-test';
import { pathExists, readJsonFile } from '../../safe-fs';
import {
  PULSE_AUTONOMY_STATE_FILE,
  PULSE_CERTIFICATE_FILE,
  PULSE_SANDBOX_STATE_FILE,
} from './constants-and-types';
import { buildTestSuite } from './test-suite';

function readStateFile<T>(pulseDir: string, fileName: string): T | null {
  const filePath = path.join(pulseDir, fileName);

  if (!pathExists(filePath)) {
    return null;
  }

  try {
    return readJsonFile<T>(filePath);
  } catch {
    return null;
  }
}

/**
 * Resolve the exit action for a specific gate's evaluation result.
 *
 * The autonomy loop calls this to determine what to do next
 * after evaluating a gate.
 */
export function resolveExitAction(
  gateName: string,
  passed: boolean,
  retryCount: number,
): { action: ExitAction; description: string } {
  const conditions = buildTestSuite().exitConditions;
  const condition = conditions.find((c) => c.gateName === gateName);

  if (!condition) {
    return {
      action: passed ? 'continue_autonomous' : 'retry_sandbox',
      description: `No exit condition defined for gate "${gateName}". Defaulting.`,
    };
  }

  if (passed) {
    return {
      action: condition.onPass,
      description: condition.description,
    };
  }

  // On fail: check if we can retry
  if (retryCount < condition.maxRetries) {
    return {
      action: 'retry_sandbox',
      description: `Gate "${gateName}" failed. Retry ${retryCount + 1}/${condition.maxRetries}. ${condition.description}`,
    };
  }

  // Max retries exceeded — use the configured governed action.
  return {
    action: condition.onFail,
    description: `Gate "${gateName}" failed after ${retryCount} retries. ${condition.description}`,
  };
}

export {
  PULSE_AUTONOMY_STATE_FILE,
  PULSE_CERTIFICATE_FILE,
  PULSE_SANDBOX_STATE_FILE,
  readStateFile,
};
