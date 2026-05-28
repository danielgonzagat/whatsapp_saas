/**
 * Agent tool dispatch helpers extracted from KloelToolDispatcherService.
 * Covers the `*_agent_*` family of capabilities — pure delegations to
 * {@link KloelChatToolsService} with no canonical-receipt wrapping:
 *
 *   - create_agent_job
 *   - list_agent_jobs
 *   - set_agent_job_enabled
 *   - search_agent_memory      (-> toolSearchAgentMemoryWithContacts)
 *   - search_agent_sessions
 *   - get_agent_artifact
 *   - upsert_agent_skill
 *   - record_agent_skill_outcome
 *   - record_agent_delegation
 *   - record_agent_evidence
 *   - search_agent_evidence
 *   - list_agent_evidence
 *   - verify_agent_evidence
 *
 * Behaviour is preserved one-for-one with the previous inline switch cases:
 * argument coercion via `asToolArgs`, and `toolVerifyAgentEvidence` is called
 * with only the workspaceId (no args), mirroring the dispatcher's original
 * signature.
 */

import type { KloelChatToolsService } from './kloel-chat-tools.service';
import type { UnknownRecord } from '../common/types';

type ToolResult = {
  success: boolean;
  message?: string;
  error?: string;
  [key: string]: unknown;
};

/**
 * Tool names handled by {@link dispatchAgentTool}. Kept in sync with the
 * dispatcher's switch cases so spec coverage continues to exercise this module.
 */
export const AGENT_TOOL_NAMES = new Set<string>([
  'create_agent_job',
  'list_agent_jobs',
  'set_agent_job_enabled',
  'search_agent_memory',
  'search_agent_sessions',
  'get_agent_artifact',
  'upsert_agent_skill',
  'record_agent_skill_outcome',
  'record_agent_delegation',
  'record_agent_evidence',
  'search_agent_evidence',
  'list_agent_evidence',
  'verify_agent_evidence',
]);

export function isAgentTool(toolName: string): boolean {
  return AGENT_TOOL_NAMES.has(toolName);
}

/**
 * Dispatch an agent-* tool. Returns `null` when the tool name is not part
 * of the agent domain so the caller can fall through.
 */
export async function dispatchAgentTool(
  chatToolsService: KloelChatToolsService,
  workspaceId: string,
  toolName: string,
  args: UnknownRecord,
): Promise<ToolResult | null> {
  const asToolArgs = <T>(value: UnknownRecord): T => value as T;

  switch (toolName) {
    case 'create_agent_job':
      return await chatToolsService.toolCreateAgentJob(workspaceId, asToolArgs(args));
    case 'list_agent_jobs':
      return await chatToolsService.toolListAgentJobs(workspaceId);
    case 'set_agent_job_enabled':
      return await chatToolsService.toolSetAgentJobEnabled(workspaceId, asToolArgs(args));
    case 'search_agent_memory':
      return await chatToolsService.toolSearchAgentMemoryWithContacts(
        workspaceId,
        asToolArgs(args),
      );
    case 'search_agent_sessions':
      return await chatToolsService.toolSearchAgentSessions(workspaceId, asToolArgs(args));
    case 'get_agent_artifact':
      return await chatToolsService.toolGetAgentArtifact(workspaceId, asToolArgs(args));
    case 'upsert_agent_skill':
      return await chatToolsService.toolUpsertAgentSkill(workspaceId, asToolArgs(args));
    case 'record_agent_skill_outcome':
      return await chatToolsService.toolRecordAgentSkillOutcome(workspaceId, asToolArgs(args));
    case 'record_agent_delegation':
      return await chatToolsService.toolRecordAgentDelegation(workspaceId, asToolArgs(args));
    case 'record_agent_evidence':
      return await chatToolsService.toolRecordAgentEvidence(workspaceId, asToolArgs(args));
    case 'search_agent_evidence':
      return await chatToolsService.toolSearchAgentEvidence(workspaceId, asToolArgs(args));
    case 'list_agent_evidence':
      return await chatToolsService.toolListAgentEvidence(workspaceId, asToolArgs(args));
    case 'verify_agent_evidence':
      return await chatToolsService.toolVerifyAgentEvidence(workspaceId);
    default:
      return null;
  }
}
