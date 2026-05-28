/**
 * Dependency-graph and test-coverage tool dispatch helpers extracted from
 * KloelToolDispatcherService. Covers the `dependencies`, `code_coverage`,
 * and `affected_tests` capabilities (Wave 7 PI-EE), all of which delegate
 * to {@link DepsCoverageService}.
 *
 * Behaviour and argument coercion are preserved one-for-one from the
 * previous inline switch.
 */

import type { DepsCoverageService } from './self-awareness/deps-coverage.service';
import type { UnknownRecord } from '../common/types';

type ToolResult = {
  success: boolean;
  message?: string;
  error?: string;
  [key: string]: unknown;
};

/**
 * Tool names handled by {@link dispatchDepsCoverageTool}. Mirrors the case
 * labels that previously lived in the dispatcher switch.
 */
export const DEPS_COVERAGE_TOOL_NAMES = new Set<string>([
  'dependencies',
  'code_coverage',
  'affected_tests',
]);

export function isDepsCoverageTool(toolName: string): boolean {
  return DEPS_COVERAGE_TOOL_NAMES.has(toolName);
}

/** Dependencies required by the deps-coverage dispatcher. */
export interface DepsCoverageToolDeps {
  depsCoverage: DepsCoverageService | undefined;
}

/**
 * Dispatch a deps/coverage tool. Returns `null` when the tool name is not
 * part of the deps-coverage domain so the caller can fall through.
 */
export async function dispatchDepsCoverageTool(
  deps: DepsCoverageToolDeps,
  toolName: string,
  args: UnknownRecord,
): Promise<ToolResult | null> {
  const { depsCoverage } = deps;

  switch (toolName) {
    case 'dependencies': {
      if (!depsCoverage) {
        return { success: false, error: 'deps_coverage_service_unavailable' };
      }
      const ws = typeof args.workspace === 'string' ? args.workspace : '';
      const pattern = typeof args.pattern === 'string' ? args.pattern : undefined;
      const result = await depsCoverage.dependencies(ws, pattern);
      return {
        success: result.success,
        capabilityId: 'dependencies',
        outputs: result,
        ...(result.error ? { error: result.error } : {}),
      };
    }
    case 'code_coverage': {
      if (!depsCoverage) {
        return { success: false, error: 'deps_coverage_service_unavailable' };
      }
      const filePath = typeof args.filePath === 'string' ? args.filePath : undefined;
      const ws = typeof args.workspace === 'string' ? args.workspace : undefined;
      const result = await depsCoverage.codeCoverage(filePath, ws);
      return { success: true, capabilityId: 'code_coverage', outputs: result };
    }
    case 'affected_tests': {
      if (!depsCoverage) {
        return { success: false, error: 'deps_coverage_service_unavailable' };
      }
      const filesRaw = typeof args.files === 'string' ? args.files : '';
      const files = filesRaw
        .split(',')
        .map((f) => f.trim())
        .filter(Boolean);
      if (files.length === 0) {
        return { success: false, error: 'files_required' };
      }
      const result = await depsCoverage.affectedTests(files);
      return { success: true, capabilityId: 'affected_tests', outputs: result };
    }
    default:
      return null;
  }
}
