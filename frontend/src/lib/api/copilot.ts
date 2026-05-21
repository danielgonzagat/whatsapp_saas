import { api } from './core';

export interface CopilotSuggestionsResponse {
  suggestions: string[];
  context?: string;
}

export function getCopilotSuggestions(
  workspaceId: string,
  contactId: string,
): Promise<{ data: CopilotSuggestionsResponse }> {
  return api.get<CopilotSuggestionsResponse>(
    `/copilot/suggest/${encodeURIComponent(workspaceId)}/${encodeURIComponent(contactId)}`,
  );
}
