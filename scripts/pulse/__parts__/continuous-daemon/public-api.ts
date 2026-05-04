import { resolveRoot } from '../../lib/safe-path';
import type { ContinuousDaemonState } from '../../types.continuous-daemon';
import { shutdownRequested } from './signals-and-paths';
import { loadAutonomyState } from './signals-and-paths';

/**
 * Stop the continuous daemon by signaling a graceful shutdown.
 *
 * The daemon will finish its current cycle and exit on the next iteration
 * check. If no daemon is running, this is a no-op.
 */
export function stopContinuousDaemon(): void {
  shutdownRequested = true;
}

/**
 * Get the current daemon status.
 *
 * Reads the persisted autonomy state from `.pulse/current/PULSE_AUTONOMY_STATE.json`
 * and returns it. Returns `null` if no state exists or if reading fails.
 *
 * @param rootDir Absolute or relative path to the repository root.
 * @returns The current autonomy state, or null.
 */
export function getDaemonStatus(rootDir: string): ContinuousDaemonState | null {
  let resolvedRoot = resolveRoot(rootDir);
  return loadAutonomyState(resolvedRoot);
}
