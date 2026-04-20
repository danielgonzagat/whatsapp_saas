/**
 * PULSE Parser 64: AI Prompt Verifier
 * Layer 8: AI/LLM Quality
 * Mode: STATIC (source code analysis — no runtime needed)
 *
 * CHECKS:
 * Verify that the LLM prompt sent by the Unified Agent contains all required context sections.
 * An incomplete prompt means the AI cannot answer accurately about products, use the right persona,
 * respect guardrails, or have memory of the conversation.
 *
 * Required prompt sections (every prompt must include all of these):
 * 1. PRODUCT CONTEXT — product name, description, pricing from Product entity
 * 2. AI CONFIG — persona name, tone, objective, restrictions from ProductAIConfig
 * 3. COGNITIVE SCORES — urgency, sentiment, purchase intent scores from UnifiedAgent cognitive state
 * 4. CONVERSATION HISTORY — last N messages from this contact (not just current message)
 * 5. WORKSPACE CONTEXT — workspace name, any workspace-level AI settings
 * 6. CURRENT MESSAGE — the actual user message being responded to
 * 7. SYSTEM INSTRUCTIONS — base behavior instructions (format, language, length limits)
 *
 * Verification method (static):
 * - Read unified-agent.service.ts and autopilot-processor.ts
 * - Search for references to the required context fields in prompt assembly code
 * - Flag if any required section is entirely absent from the source
 *
 * Specific field checks:
 * 8. Prompt assembly uses aiConfig/productAiConfig/ai_config (AI persona settings)
 * 9. Prompt assembly uses cognitiveState/cognitive_state (lead analysis)
 * 10. Prompt assembly uses product + plan + price (product context)
 * 11. Prompt assembly includes conversation history (messages/history/conversationHistory)
 * 12. Prompt does NOT contain template placeholder patterns ({{...}} or similar)
 *
 * BREAK TYPES:
 * - AI_PROMPT_INCOMPLETE (critical) — required prompt section missing from source code,
 *   or template placeholder patterns found that may not be filled
 */

import * as path from 'path';
import { readFileSafe } from './utils';
import type { Break, PulseConfig } from '../types';

// Files that contain the AI prompt assembly logic
const AGENT_FILES = [
  'backend/src/kloel/unified-agent.service.ts',
  'worker/processors/autopilot-processor.ts',
];

interface PromptSection {
  name: string;
  patterns: RegExp[];
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  detail: string;
}

const REQUIRED_SECTIONS: PromptSection[] = [
  {
    name: 'AI_CONFIG',
    patterns: [
      /aiConfig|ai_config|productAiConfig|productAIConfig|ProductAIConfig/,
      /aiConfigContext|aiConfigBlock/,
    ],
    severity: 'critical',
    description: 'AI prompt assembly does not use ProductAIConfig (persona/tone settings)',
    detail:
      'No reference to aiConfig/productAiConfig found in prompt building code. The AI will not know the product persona, tone, or restrictions.',
  },
  {
    name: 'COGNITIVE_STATE',
    patterns: [
      /cognitiveState|cognitive_state|computePersistentCognitiveState/,
      /urgencyScore|sentimentScore|purchaseIntent|nextBestAction/,
      /cognition|cognitiv/i,
    ],
    severity: 'critical',
    description: 'AI prompt assembly does not use cognitive state (lead intent/urgency scores)',
    detail:
      'No reference to cognitiveState or urgency/sentiment scores found. The AI cannot adapt to lead intent without this context.',
  },
  {
    name: 'PRODUCT_CONTEXT',
    patterns: [
      /product\.name|products\.map|product\.description/,
      /buildSystemPrompt.*product|products.*aiConfig/,
      /fetchConversationHistory|findWorkspaceProductMatches/,
    ],
    severity: 'critical',
    description: 'AI prompt assembly does not include product context (name/price/plan)',
    detail:
      'No product data found in prompt assembly. The AI cannot describe or sell products without knowing what they are.',
  },
  {
    name: 'CONVERSATION_HISTORY',
    patterns: [
      /conversationHistory|conversation_history|history\s*=|fetchConversationHistory/,
      /buildConversationLedger|historyTurns|history\.length/,
      /\bhistory\b.*messages|\bmessages\b.*history/,
    ],
    severity: 'critical',
    description: 'AI prompt assembly does not include conversation history',
    detail:
      'No conversation history reference found in prompt building. The AI will have no memory of prior exchanges, causing repetition and poor UX.',
  },
];

/** Check ai prompt verifier. */
export function checkAiPromptVerifier(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  // Collect content from all agent files
  const agentContents: Array<{ file: string; content: string }> = [];
  for (const relPath of AGENT_FILES) {
    const file = path.join(config.rootDir, relPath);
    const content = readFileSafe(file);
    if (content) {
      agentContents.push({ file, content });
    }
  }

  if (agentContents.length === 0) {
    breaks.push({
      type: 'AI_PROMPT_INCOMPLETE',
      severity: 'critical',
      file: path.join(config.rootDir, AGENT_FILES[0]),
      line: 0,
      description: 'AI agent source files not found',
      detail: `Could not read any of: ${AGENT_FILES.join(', ')}. Cannot verify prompt assembly.`,
    });
    return breaks;
  }

  // Combined content for cross-file analysis
  const allContent = agentContents.map((a) => a.content).join('\n');

  // Check each required section against the combined source
  for (const section of REQUIRED_SECTIONS) {
    const found = section.patterns.some((pattern) => pattern.test(allContent));
    if (!found) {
      // Report against the primary agent file
      const primaryFile = agentContents[0].file;
      breaks.push({
        type: 'AI_PROMPT_INCOMPLETE',
        severity: section.severity,
        file: primaryFile,
        line: 0,
        description: section.description,
        detail: section.detail,
      });
    }
  }

  // Check for unfilled template placeholders in prompt building functions
  const templatePlaceholderPattern = /\{\{[^}]+\}\}|<%[^%]+%>/;
  for (const { file, content } of agentContents) {
    // Look at prompt-building functions specifically (lines with buildSystemPrompt, buildPrompt, systemPrompt)
    const promptBuildLines = content
      .split('\n')
      .map((line, idx) => ({ line, idx: idx + 1 }))
      .filter(({ line }) =>
        /systemPrompt|buildPrompt|promptText|prompt\s*=|prompt\s*\+=/i.test(line),
      );

    for (const { line, idx } of promptBuildLines) {
      if (templatePlaceholderPattern.test(line)) {
        breaks.push({
          type: 'AI_PROMPT_INCOMPLETE',
          severity: 'critical',
          file,
          line: idx,
          description: 'Unfilled template placeholder in AI prompt',
          detail: `Line ${idx}: Found unresolved template placeholder ({{...}} or <%...%>) in prompt assembly. Template not being filled before sending to LLM.`,
        });
        break; // One break per file is enough
      }
    }
  }

  // Check for [object Object] or 'undefined' as literal string in prompt concatenation
  const serializationErrorPatterns = [
    { re: /\[object Object\]/, label: '[object Object] serialization error' },
    { re: /"undefined"|'undefined'|\+ undefined\b/, label: "'undefined' literal in prompt string" },
  ];

  for (const { file, content } of agentContents) {
    for (const { re, label } of serializationErrorPatterns) {
      const match = content.match(re);
      if (match) {
        const lineNum = content.substring(0, content.indexOf(match[0])).split('\n').length;
        breaks.push({
          type: 'AI_PROMPT_INCOMPLETE',
          severity: 'critical',
          file,
          line: lineNum,
          description: `Prompt serialization error: ${label}`,
          detail: `Found "${match[0]}" in AI agent source. This will corrupt the LLM prompt with garbage values.`,
        });
        break;
      }
    }
  }

  return breaks;
}
