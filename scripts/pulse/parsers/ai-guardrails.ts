/**
 * PULSE Parser 66: AI Guardrails (STATIC)
 * Layer 8: AI/LLM Quality
 *
 * STATIC analysis: checks that prompt-injection sanitization and guardrail
 * patterns exist in the AI pipeline.
 *
 * CHECKS:
 * 1. prompt-sanitizer middleware exists and is registered in the app
 * 2. The sanitizer covers injection patterns (ignore instructions, jailbreak, etc.)
 * 3. System prompt includes restrictions/limitations language
 * 4. hideAiIdentity / maxDiscountPercent guardrail fields are consumed by the agent
 *
 * BREAK TYPES:
 *   AI_GUARDRAIL_BROKEN (high) — missing or unregistered guardrail that leaves agent unprotected
 */

import * as path from 'path';
import { calculateDynamicRisk } from '../dynamic-risk-model';
import { synthesizeDiagnostic } from '../diagnostic-synthesizer';
import { buildPredicateGraph } from '../predicate-graph';
import { buildPulseSignalGraph, type PulseSignalEvidence } from '../signal-graph';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';

interface AiGuardrailBreakInput {
  severity: Break['severity'];
  file: string;
  line: number;
  description: string;
  detail: string;
  predicates: readonly string[];
}

function diagnosticToken(value: string): string {
  return value
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function buildAiGuardrailBreak(input: AiGuardrailBreakInput): Break {
  const signal: PulseSignalEvidence = {
    source: `grammar-kernel:ai-guardrails;predicates=${input.predicates.join(',')}`,
    detector: 'ai-guardrails',
    truthMode: 'confirmed_static',
    summary: input.description,
    detail: input.detail,
    location: {
      file: input.file,
      line: input.line,
    },
  };
  const signalGraph = buildPulseSignalGraph([signal]);
  const predicateGraph = buildPredicateGraph(signalGraph);
  const diagnostic = synthesizeDiagnostic(
    signalGraph,
    predicateGraph,
    calculateDynamicRisk({ predicateGraph }),
  );
  const predicateToken = input.predicates.map(diagnosticToken).filter(Boolean).join('+');

  return {
    type: `diagnostic:ai-guardrails:${predicateToken || diagnostic.id}`,
    severity: input.severity,
    file: input.file,
    line: input.line,
    description: diagnostic.title,
    detail: `${diagnostic.summary}; evidence=${diagnostic.evidenceIds.join(',')}; ${input.detail}`,
    source: `${signal.source};detector=${signal.detector};truthMode=${signal.truthMode}`,
    surface: 'ai-guardrails',
  };
}

function pushAiGuardrailBreak(breaks: Break[], input: AiGuardrailBreakInput): void {
  breaks.push(buildAiGuardrailBreak(input));
}

function readSafe(file: string): string {
  try {
    return readTextFile(file, 'utf8');
  } catch {
    return '';
  }
}

/** Find unified-agent service files */
function findAgentFiles(backendDir: string): string[] {
  return walkFiles(backendDir, ['.ts']).filter(
    (f) =>
      /unified-agent|autopilot.*service|agent.*service/i.test(path.basename(f)) &&
      !/\.(spec|test)\.ts$|dist\//.test(f),
  );
}

function isAppModuleFile(file: string): boolean {
  return path.basename(file).toLowerCase() === 'app.module.ts';
}

/** Check ai guardrails. */
export function checkAiGuardrails(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const backendFiles = walkFiles(config.backendDir, ['.ts']).filter(
    (f) => !/\.(spec|test)\.ts$|dist\//.test(f),
  );

  // ── CHECK 1: prompt-sanitizer exists ──────────────────────────────────────
  const sanitizerFile = backendFiles.find((f) => /prompt-sanitizer/i.test(path.basename(f)));

  if (!sanitizerFile) {
    pushAiGuardrailBreak(breaks, {
      severity: 'high',
      file: path.relative(config.rootDir, config.backendDir),
      line: 1,
      description: 'No prompt-sanitizer file found in backend',
      detail:
        'Without a prompt sanitizer, user inputs containing injection patterns ' +
        '("ignore all previous instructions", jailbreak attempts, etc.) reach the LLM unfiltered. ' +
        'Create a NestJS middleware or utility that strips known injection patterns before forwarding to the LLM.',
      predicates: ['backend_source_scanned', 'prompt_sanitizer_file_absent'],
    });
  } else {
    const sanitizerContent = readSafe(sanitizerFile);
    const relSanitizer = path.relative(config.rootDir, sanitizerFile);

    // ── CHECK 2: sanitizer covers common injection patterns ─────────────────
    const hasIgnoreInstructions = /ignore.*instructions|instrucoes|instru[çc][õo]es/i.test(
      sanitizerContent,
    );
    const hasJailbreak = /jailbreak|DAN|unrestricted|no.*restrictions/i.test(sanitizerContent);
    const hasSysPromptExfil = /system.*prompt|reveal.*prompt|show.*prompt/i.test(sanitizerContent);

    if (!hasIgnoreInstructions) {
      pushAiGuardrailBreak(breaks, {
        severity: 'high',
        file: relSanitizer,
        line: 1,
        description: 'Prompt sanitizer does not handle "ignore instructions" injection pattern',
        detail:
          'The most common prompt injection is "ignore all previous instructions". ' +
          'Add a pattern that detects and removes this phrase in English and Portuguese.',
        predicates: ['prompt_sanitizer_file_present', 'ignore_instruction_grammar_absent'],
      });
    }

    if (!hasJailbreak) {
      pushAiGuardrailBreak(breaks, {
        severity: 'high',
        file: relSanitizer,
        line: 1,
        description:
          'Prompt sanitizer does not handle jailbreak patterns (DAN, unrestricted, etc.)',
        detail:
          'Jailbreak prompts like "you are now DAN" or "act without restrictions" ' +
          'bypass the system prompt persona. Add regex patterns to detect and strip these.',
        predicates: ['prompt_sanitizer_file_present', 'jailbreak_grammar_absent'],
      });
    }

    if (!hasSysPromptExfil) {
      pushAiGuardrailBreak(breaks, {
        severity: 'high',
        file: relSanitizer,
        line: 1,
        description: 'Prompt sanitizer does not block system prompt exfiltration attempts',
        detail:
          '"Print your system prompt" or "reveal your instructions" requests can leak ' +
          'proprietary business context. Add detection for these prompt-exfil patterns.',
        predicates: ['prompt_sanitizer_file_present', 'system_prompt_exfiltration_grammar_absent'],
      });
    }

    // ── CHECK 3: sanitizer is registered in the app ─────────────────────────
    const appModuleFile = backendFiles.find(isAppModuleFile);
    if (appModuleFile) {
      const appContent = readSafe(appModuleFile);
      const sanitizerImported = /prompt-sanitizer|PromptSanitizer/i.test(appContent);
      const sanitizerApplied =
        /apply\s*\([^)]*PromptSanitizer|consumer\.apply.*PromptSanitizer/i.test(appContent);

      if (!sanitizerImported) {
        pushAiGuardrailBreak(breaks, {
          severity: 'high',
          file: path.relative(config.rootDir, appModuleFile),
          line: 1,
          description: 'PromptSanitizerMiddleware exists but is not imported in AppModule',
          detail:
            'The sanitizer file exists but is not registered. ' +
            'Add it to AppModule.configure() with consumer.apply(PromptSanitizerMiddleware).forRoutes(...)',
          predicates: [
            'prompt_sanitizer_file_present',
            'app_module_discovered',
            'sanitizer_import_absent',
          ],
        });
      } else if (!sanitizerApplied) {
        pushAiGuardrailBreak(breaks, {
          severity: 'high',
          file: path.relative(config.rootDir, appModuleFile),
          line: 1,
          description: 'PromptSanitizerMiddleware imported but not applied via consumer.apply()',
          detail:
            'Import alone is not enough. Call consumer.apply(PromptSanitizerMiddleware).forRoutes() ' +
            'in the configure() method of AppModule.',
          predicates: [
            'prompt_sanitizer_file_present',
            'app_module_discovered',
            'sanitizer_import_present',
            'sanitizer_application_absent',
          ],
        });
      }
    }
  }

  // ── CHECK 4: Agent enforces hideAiIdentity and maxDiscountPercent ────────────
  const agentFiles = findAgentFiles(config.backendDir);

  if (agentFiles.length > 0) {
    const agentContent = agentFiles.map(readSafe).join('\n');
    const primaryFile = path.relative(config.rootDir, agentFiles[0]);

    const hasIdentityGuard = /hideAiIdentity|hide_ai_identity|ocultar.*ia|identidade.*ia/i.test(
      agentContent,
    );

    if (!hasIdentityGuard) {
      pushAiGuardrailBreak(breaks, {
        severity: 'high',
        file: primaryFile,
        line: 1,
        description: 'Agent does not enforce hideAiIdentity guardrail from ProductAIConfig',
        detail:
          'When hideAiIdentity=true, the agent must not reveal it is an AI. ' +
          'Check for hideAiIdentity in the system prompt builder and add instructions ' +
          'to never confirm or deny being a chatbot.',
        predicates: ['agent_prompt_source_discovered', 'identity_guardrail_signal_absent'],
      });
    }

    const hasDiscountGuard =
      /maxDiscountPercent|max_discount_percent|desconto.*maximo|maxDiscount/i.test(agentContent);

    if (!hasDiscountGuard) {
      pushAiGuardrailBreak(breaks, {
        severity: 'high',
        file: primaryFile,
        line: 1,
        description: 'Agent does not enforce maxDiscountPercent guardrail from ProductAIConfig',
        detail:
          'Without a discount limit in the system prompt, the LLM may offer arbitrary discounts ' +
          'when users pressure it. Inject "never offer more than X% discount" into the system prompt ' +
          'using the ProductAIConfig.maxDiscountPercent value.',
        predicates: ['agent_prompt_source_discovered', 'discount_guardrail_signal_absent'],
      });
    }
  }

  return breaks;
}
