import { buildKloelResponseEnginePrompt } from '../kloel.prompts';
import type { ExpertiseLevel } from '../kloel-reply-engine.service';

export function buildKloelDashboardPrompt(params: {
  currentDate: string;
  userName?: string | null;
  workspaceName?: string | null;
  expertiseLevel?: ExpertiseLevel;
}): string {
  return buildKloelResponseEnginePrompt(params);
}
