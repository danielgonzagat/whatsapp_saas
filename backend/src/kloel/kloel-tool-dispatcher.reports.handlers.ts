/**
 * Reports/CRM tool dispatch helpers extracted from
 * KloelToolDispatcherService. Covers the `reports.operations`,
 * `reports.abandonments`, and `crm.pipeline` capabilities, all of which
 * delegate to {@link ReportService}.
 *
 * Behaviour and argument coercion are preserved one-for-one from the
 * previous inline switch.
 */

import type { ReportService } from './report.service';
import { periodToSince } from './kloel-tool-dispatcher.helpers';
import type { UnknownRecord } from '../common/types';

type ToolResult = {
  success: boolean;
  message?: string;
  error?: string;
  [key: string]: unknown;
};

/**
 * Tool names handled by {@link dispatchReportsTool}. Mirrors the case
 * labels that previously lived in the dispatcher switch.
 */
export const REPORTS_TOOL_NAMES = new Set<string>([
  'reports.operations',
  'reports.abandonments',
  'get_abandonments',
  'crm.pipeline',
]);

export function isReportsTool(toolName: string): boolean {
  return REPORTS_TOOL_NAMES.has(toolName);
}

/** Dependencies required by the reports dispatcher. */
export interface ReportsToolDeps {
  reportService: ReportService | undefined;
}

/**
 * Dispatch a reports/CRM tool. Returns `null` when the tool name is not
 * part of the reports domain so the caller can fall through.
 */
export async function dispatchReportsTool(
  deps: ReportsToolDeps,
  workspaceId: string,
  toolName: string,
  args: UnknownRecord,
): Promise<ToolResult | null> {
  const { reportService } = deps;

  switch (toolName) {
    case 'reports.operations': {
      if (!reportService) {
        return { success: false, error: 'report_service_unavailable' };
      }
      const period = typeof args?.period === 'string' ? args.period : undefined;
      const since = periodToSince(period);
      const res = await reportService.operations(workspaceId, { since });
      return { success: true, ...res };
    }
    case 'reports.abandonments': {
      if (!reportService) {
        return { success: false, error: 'report_service_unavailable' };
      }
      const period = typeof args?.period === 'string' ? args.period : undefined;
      const since = periodToSince(period);
      const res = await reportService.abandonments(workspaceId, { since });
      return { success: true, ...res };
    }
    case 'get_abandonments': {
      if (!reportService) {
        return { success: false, error: 'report_service_unavailable' };
      }
      const res = await reportService.abandonments(workspaceId);
      return { success: true, ...res };
    }
    case 'crm.pipeline': {
      if (!reportService) {
        return { success: false, error: 'report_service_unavailable' };
      }
      const res = await reportService.pipeline(workspaceId);
      return { success: true, ...res };
    }
    default:
      return null;
  }
}
