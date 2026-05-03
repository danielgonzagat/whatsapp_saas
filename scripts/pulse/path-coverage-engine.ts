/**
 * PULSE Wave 6, Module B — Full Path Coverage Engine.
 *
 * Consumes the execution matrix and produces a {@link PathCoverageState}
 * artifact that classifies every path, pinpoints inferred-only gaps, and
 * generates test/probe definitions for critical uncovered paths.
 *
 * Stored at `.pulse/current/PULSE_PATH_COVERAGE.json`.
 */

export {
  buildPathCoverageState,
  classifyPath,
  generateTestForPath,
  isSafeToExecute,
  computeCoveragePercent,
} from './__parts__/path-coverage-engine/core';
