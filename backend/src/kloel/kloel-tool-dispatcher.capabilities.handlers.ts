/**
 * Internal cognition-capability dispatch helpers extracted from
 * KloelToolDispatcherService. Covers the three self-contained, deterministic
 * "thinking tools" hosted by {@link KloelCapabilitiesService}:
 *
 *   - mind.capability.extract_structured_text  (-> structured_text_extractor)
 *   - mind.capability.advise_response_depth     (-> response_depth_advisor)
 *   - mind.capability.refine_prompt             (-> prompt_refiner)
 *
 * These are INTERNAL capabilities the agent loop invokes while reasoning. They
 * are never surfaced as user-facing buttons and never leak a skill/brand name:
 * the dispatch names use a `mind.capability.*` prefix and the underlying
 * provider/source is not exposed in the returned result. Each capability is
 * pure-logic and read-only (no external provider, no mutation), so it is safe
 * for the agent to call inline within a single turn.
 *
 * Behaviour mirrors the established `is*Tool` / `dispatch*Tool` fast-path
 * pattern: the predicate gates the domain, the dispatcher coerces args into the
 * capability's typed input and returns a structured {@link ToolResult}; an
 * unknown name yields `null` so the caller falls through.
 */

import type { KloelCapabilitiesService } from './capabilities/kloel-capabilities.service';
import type { UnknownRecord } from '../common/types';

type ToolResult = {
  success: boolean;
  message?: string;
  error?: string;
  [key: string]: unknown;
};

/**
 * Internal dispatch names for the cognition capabilities. Kept distinct from
 * user-facing tool names via the `mind.capability.` prefix so they can never be
 * confused with, or surfaced as, a customer-visible action.
 */
export const CAPABILITY_TOOL_NAMES = new Set<string>([
  'mind.capability.extract_structured_text',
  'mind.capability.advise_response_depth',
  'mind.capability.refine_prompt',
]);

export function isCapabilityTool(toolName: string): boolean {
  return CAPABILITY_TOOL_NAMES.has(toolName);
}

/** Dependencies required by the capability dispatcher. */
export interface CapabilityToolDeps {
  kloelCapabilities: KloelCapabilitiesService | undefined;
}

/** Coerce an arg to a trimmed string, or return undefined when absent. */
function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Coerce an arg to a finite number, or return undefined when absent/invalid. */
function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Coerce an arg to a string array (column names), or return undefined. */
function optionalStringArray(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const strings = value.filter((v): v is string => typeof v === 'string');
  return strings.length > 0 ? strings : undefined;
}

/**
 * Dispatch an internal cognition capability. Returns `null` when the tool name
 * is not part of the capability domain so the caller can fall through to the
 * generic resolver / direct dispatch.
 */
export function dispatchCapabilityTool(
  deps: CapabilityToolDeps,
  toolName: string,
  args: UnknownRecord,
): ToolResult | null {
  const { kloelCapabilities } = deps;
  if (!kloelCapabilities) {
    return { success: false, error: 'capabilities_service_unavailable' };
  }

  switch (toolName) {
    case 'mind.capability.extract_structured_text': {
      const text = optionalString(args?.text);
      if (text === undefined || text.trim() === '') {
        return { success: false, error: 'missing_text' };
      }
      const result = kloelCapabilities.extractStructuredText({
        text,
        columns: optionalStringArray(args?.columns),
        confidenceThreshold: optionalNumber(args?.confidenceThreshold),
      });
      return { success: true, ...result };
    }
    case 'mind.capability.advise_response_depth': {
      const prompt = optionalString(args?.prompt);
      if (prompt === undefined || prompt.trim() === '') {
        return { success: false, error: 'missing_prompt' };
      }
      const result = kloelCapabilities.adviseResponseDepth({
        prompt,
        maxOutputTokens: optionalNumber(args?.maxOutputTokens),
      });
      return { success: true, ...result };
    }
    case 'mind.capability.refine_prompt': {
      const prompt = optionalString(args?.prompt);
      if (prompt === undefined || prompt.trim() === '') {
        return { success: false, error: 'missing_prompt' };
      }
      const result = kloelCapabilities.refinePrompt({ prompt });
      return { success: true, ...result };
    }
    default:
      return null;
  }
}
