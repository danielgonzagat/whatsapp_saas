/**
 * PULSE Parser 65: AI Response Quality (STATIC)
 * Layer 8: AI/LLM Quality
 *
 * STATIC analysis: checks that the unified-agent service has the essential
 * structural components for adequate response quality:
 * - temperature and max_tokens are explicitly configured
 * - fallback responses exist for LLM failures (not hardcoded fake text)
 * - checkout link generation is present (required for commercial intent handling)
 *
 * BREAK TYPES:
 *   AI_RESPONSE_INADEQUATE (high) — missing quality/safety configuration in AI service
 */

import * as path from 'path';
import { calculateDynamicRisk } from '../dynamic-risk-model';
import { synthesizeDiagnostic } from '../diagnostic-synthesizer';
import { buildPredicateGraph } from '../predicate-graph';
import { buildPulseSignalGraph, type PulseSignalEvidence } from '../signal-graph';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';

interface AiResponseQualityBreakInput {
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

function buildAiResponseQualityBreak(input: AiResponseQualityBreakInput): Break {
  const signal: PulseSignalEvidence = {
    source: `grammar-kernel:ai-response-quality;predicates=${input.predicates.join(',')}`,
    detector: 'ai-response-quality',
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
    type: `diagnostic:ai-response-quality:${predicateToken || diagnostic.id}`,
    severity: input.severity,
    file: input.file,
    line: input.line,
    description: diagnostic.title,
    detail: `${diagnostic.summary}; evidence=${diagnostic.evidenceIds.join(',')}; ${input.detail}`,
    source: `${signal.source};detector=${signal.detector};truthMode=${signal.truthMode}`,
    surface: 'ai-response-quality',
  };
}

function pushAiResponseQualityBreak(breaks: Break[], input: AiResponseQualityBreakInput): void {
  breaks.push(buildAiResponseQualityBreak(input));
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

/** Check ai response quality. */
export function checkAiResponseQuality(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const agentFiles = findAgentFiles(config.backendDir);

  if (agentFiles.length === 0) {
    // Cannot check if no agent service found — not a break (may not be implemented yet)
    return breaks;
  }

  // Aggregate content of all agent-related service files
  const combinedContent = agentFiles.map(readSafe).join('\n');
  const primaryFile = path.relative(config.rootDir, agentFiles[0]);

  // ── CHECK 1: temperature configured ────────────────────────────────────────
  // LLM calls should have explicit temperature to control response style
  const hasTemperature = /\btemperature\s*:/.test(combinedContent);
  if (!hasTemperature) {
    pushAiResponseQualityBreak(breaks, {
      severity: 'high',
      file: primaryFile,
      line: 1,
      description: 'Unified agent service has no explicit temperature configuration',
      detail:
        'Without temperature set, the LLM defaults to 1.0, producing inconsistent/verbose responses. ' +
        'Set temperature: 0.7-0.9 for sales persona responses.',
      predicates: ['agent_prompt_source_discovered', 'temperature_configuration_absent'],
    });
  }

  // ── CHECK 2: max_tokens configured ────────────────────────────────────────
  // Unbounded max_tokens can produce excessively long responses and increase cost
  const hasMaxTokens = /\bmax_tokens\s*:|\bmax_completion_tokens\s*:/.test(combinedContent);
  if (!hasMaxTokens) {
    pushAiResponseQualityBreak(breaks, {
      severity: 'high',
      file: primaryFile,
      line: 1,
      description: 'Unified agent service has no max_tokens limit configured',
      detail:
        'Without max_tokens, LLM can produce excessively long responses (> 2000 chars) that confuse ' +
        'WhatsApp users and increase API costs. Set max_tokens: 500-800 for conversational use.',
      predicates: ['agent_prompt_source_discovered', 'token_limit_configuration_absent'],
    });
  }

  // ── CHECK 3: fallback response for LLM failures ────────────────────────────
  // When LLM throws (timeout, rate limit, etc.) there must be a fallback path
  const hasFallback =
    /fallback(?:Reply|Response|Model|Brain|Writer)/i.test(combinedContent) ||
    /catch[\s\S]{0,200}(?:return|throw)[\s\S]{0,100}(?:fallback|degraded|indispon)/i.test(
      combinedContent,
    );

  if (!hasFallback) {
    pushAiResponseQualityBreak(breaks, {
      severity: 'high',
      file: primaryFile,
      line: 1,
      description: 'No fallback response found for LLM failures in agent service',
      detail:
        'If the LLM API fails (timeout, rate limit, service error), the agent must return a ' +
        'degraded-state message like "Olá! Estou com dificuldades no momento, tente novamente em instantes." ' +
        'instead of propagating an unhandled error.',
      predicates: ['agent_prompt_source_discovered', 'llm_failure_fallback_absent'],
    });
  }

  // ── CHECK 4: checkout link generation ──────────────────────────────────────
  // The agent must be able to send checkout links when purchase intent is detected
  const hasCheckoutLink = /checkout|checkoutLink|link.*compra|link.*checkout|\/checkout\//i.test(
    combinedContent,
  );

  if (!hasCheckoutLink) {
    pushAiResponseQualityBreak(breaks, {
      severity: 'high',
      file: primaryFile,
      line: 1,
      description: 'Agent service has no checkout link generation capability',
      detail:
        'When the user shows purchase intent, the agent should send a checkout link. ' +
        'Without this, the entire commercial conversion flow is broken. ' +
        'Implement logic to detect intent and inject the product checkout URL into the response.',
      predicates: ['agent_prompt_source_discovered', 'checkout_link_signal_absent'],
    });
  }

  return breaks;
}
