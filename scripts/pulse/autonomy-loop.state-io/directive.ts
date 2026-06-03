/** State read/write, seed builders, and directive IO for the autonomy loop. */
import * as path from 'node:path';
import type {
  PulseAutonomousDirective,
  PulseAutonomySummarySnapshot,
} from '../autonomy-loop.types';
import { readOptionalArtifact } from '../autonomy-loop.utils';

export function directiveDigest(directive: PulseAutonomousDirective): string {
  const crypto = require('node:crypto') as typeof import('node:crypto');
  return crypto
    .createHash('sha1')
    .update(
      JSON.stringify({
        currentCheckpoint: directive.currentCheckpoint || null,
        currentState: directive.currentState || null,
        visionGap: directive.visionGap || null,
        nextExecutableUnits: directive.nextExecutableUnits || [],
        blockedUnits: directive.blockedUnits || [],
      }),
    )
    .digest('hex');
}

export function getDirectiveSnapshot(
  directive: PulseAutonomousDirective,
): PulseAutonomySummarySnapshot {
  const executionMatrixSummary =
    directive.executionMatrix?.summary ??
    (
      directive.currentState as {
        executionMatrixSummary?: PulseAutonomySummarySnapshot['executionMatrixSummary'];
      } | null
    )?.executionMatrixSummary ??
    null;

  return {
    certificationStatus: directive.currentState?.certificationStatus || null,
    blockingTier:
      typeof directive.currentState?.blockingTier === 'number'
        ? directive.currentState.blockingTier
        : null,
    score: typeof directive.currentState?.score === 'number' ? directive.currentState.score : null,
    visionGap: directive.visionGap || null,
    executionMatrixSummary,
  };
}

export function readDirectiveArtifact(rootDir: string): PulseAutonomousDirective | null {
  const canonicalPath = path.join(rootDir, '.pulse', 'current', 'PULSE_CLI_DIRECTIVE.json');
  const mirrorPath = path.join(rootDir, 'PULSE_CLI_DIRECTIVE.json');
  return (
    readOptionalArtifact<PulseAutonomousDirective>(canonicalPath) ||
    readOptionalArtifact<PulseAutonomousDirective>(mirrorPath)
  );
}
