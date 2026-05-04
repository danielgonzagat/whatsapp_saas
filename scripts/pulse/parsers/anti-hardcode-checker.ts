/**
 * PULSE Parser 104: Anti-Hardcode Contract Checker
 * Contract: docs/design/KLOEL_ANTI_HARDCODE_CONTRACT.md
 * Mode: STATIC
 *
 * Detects pseudo-thinking and fake cognition strings that would make the
 * product look like the model is narrating internal steps it never produced.
 */
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { readFileSafe, walkFiles } from './utils';

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];
const SKIPPABLE_PATH_GRAMMAR =
  /(?:^|\/)(?:__tests__|__mocks__|coverage|dist|node_modules|test)(?:\/|$)|\.(?:spec|test)\.[jt]sx?$/;
const STRING_LITERAL_GRAMMAR = /['"`][^'"`\n]{0,240}['"`]/;
const ANTI_HARDCODE_DIAGNOSTIC_PREFIX = 'AI_PSEUDO_THINKING';
const ANTI_HARDCODE_DIAGNOSTIC_SUFFIX = 'HARDCODED';

interface PseudoThinkingGrammarRule {
  readonly tokenSequence: readonly string[];
  readonly category: string;
  readonly description: string;
  readonly detail: string;
}

const PSEUDO_THINKING_GRAMMAR: readonly PseudoThinkingGrammarRule[] = [
  {
    tokenSequence: ['entendendo', 'sua'],
    category: 'context_parsing_narration',
    description:
      'Hardcoded pseudo-thinking text found in product code — model cognition is being simulated.',
    detail:
      'Remove the pseudo-thinking copy or move it to an explicit system/runtime state. If it looks like model reasoning, it must come from the model.',
  },
  {
    tokenSequence: ['redigindo', 'a', 'resposta'],
    category: 'drafting_narration',
    description:
      'Hardcoded drafting narration found — assistant response is being impersonated by product code.',
    detail:
      'Do not hardcode narration like "Redigindo a resposta". Keep only branded motion/timer unless real reasoning came from the provider.',
  },
  {
    tokenSequence: ['processando', 'sua'],
    category: 'processing_narration',
    description: 'Hardcoded processing narration found — product is inventing AI activity text.',
    detail:
      'Replace generic processing prose with honest runtime state. The anti-hardcode contract forbids fake cognition text.',
  },
  {
    tokenSequence: ['executando', 'a', 'ferramenta'],
    category: 'tool_execution_narration',
    description: 'Tool narration is being exposed as model speech.',
    detail:
      'Internal tool activity must not be rendered as if it were the model speaking to the user.',
  },
  {
    tokenSequence: ['integrando', 'o', 'resultado'],
    category: 'tool_result_narration',
    description: 'Hardcoded tool/result narration found — model reasoning is being simulated.',
    detail:
      'System/runtime summaries must be explicit system states, not imitation of the model internal process.',
  },
  {
    tokenSequence: ['consolidando', 'os', 'resultados'],
    category: 'result_consolidation_narration',
    description: 'Hardcoded consolidation narration found in product code.',
    detail:
      'The product cannot fabricate intermediate reasoning prose. Remove the text or source it from the model.',
  },
  {
    tokenSequence: ['reprocessando', 'esta'],
    category: 'reprocessing_narration',
    description: 'Hardcoded reprocessing narration found — product is faking model workflow text.',
    detail:
      'Do not narrate model internals with hardcoded copy. Use explicit system state only when needed.',
  },
  {
    tokenSequence: ['resposta', 'pronta'],
    category: 'completion_narration',
    description: 'Hardcoded "response ready" cognition text found.',
    detail:
      'This phrasing impersonates internal model activity. Remove it or convert it to clearly-marked system state.',
  },
  {
    tokenSequence: ['reunindo', 'o', 'contexto'],
    category: 'context_gathering_narration',
    description: 'Hardcoded context-gathering narration found.',
    detail:
      'The product cannot claim the model is gathering context unless the model explicitly returned that text.',
  },
  {
    tokenSequence: ['avaliando', 'se', 'precisa'],
    category: 'decision_narration',
    description: 'Hardcoded decision narration found in AI-facing product code.',
    detail: 'Do not hardcode phrases that pretend the model is evaluating or deciding internally.',
  },
];

function isSkippable(relPath: string): boolean {
  return SKIPPABLE_PATH_GRAMMAR.test(relPath);
}

function looksLikeUserFacingLiteral(line: string): boolean {
  return STRING_LITERAL_GRAMMAR.test(line);
}

function normalizeGrammarInput(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function matchesTokenSequence(line: string, tokenSequence: readonly string[]): boolean {
  const normalizedLine = normalizeGrammarInput(line);
  let searchFrom = 0;

  for (const token of tokenSequence) {
    const normalizedToken = normalizeGrammarInput(token);
    const tokenIndex = normalizedLine.indexOf(normalizedToken, searchFrom);
    if (tokenIndex === -1) {
      return false;
    }
    searchFrom = tokenIndex + normalizedToken.length;
  }

  return true;
}

function findPseudoThinkingGrammarRule(line: string): PseudoThinkingGrammarRule | null {
  return (
    PSEUDO_THINKING_GRAMMAR.find((rule) => matchesTokenSequence(line, rule.tokenSequence)) ?? null
  );
}

function buildAntiHardcodeDiagnostic(input: {
  readonly file: string;
  readonly line: number;
  readonly sourceLine: string;
  readonly rule: PseudoThinkingGrammarRule;
}): Break {
  const type = `${ANTI_HARDCODE_DIAGNOSTIC_PREFIX}_${ANTI_HARDCODE_DIAGNOSTIC_SUFFIX}`;
  const sourceSample = input.sourceLine.trim().slice(0, 120);
  const predicateKinds = [
    'source_string_literal_observed',
    'pseudo_cognition_grammar_matched',
    input.rule.category,
  ];

  return {
    type,
    severity: 'critical',
    file: input.file,
    line: input.line,
    description: input.rule.description,
    detail:
      `${input.rule.detail} Evidence: source string literal matched kernel ` +
      `pseudo-cognition grammar; predicates=${predicateKinds.join(',')}; sample=${sourceSample}`,
    source: `grammar-kernel:anti-hardcode-checker;truthMode=confirmed_static;predicates=${predicateKinds.join(',')}`,
  };
}

/** Check anti hardcode. */
export function checkAntiHardcode(config: PulseConfig): Break[] {
  const diagnostics: Break[] = [];
  const sourceFiles = [
    ...walkFiles(config.backendDir, SOURCE_EXTENSIONS),
    ...walkFiles(config.frontendDir, SOURCE_EXTENSIONS),
    ...walkFiles(config.workerDir, SOURCE_EXTENSIONS),
  ];

  for (const file of sourceFiles) {
    const relFile = path.relative(config.rootDir, file);
    if (isSkippable(relFile)) {
      continue;
    }

    const content = readFileSafe(file);
    if (!content) {
      continue;
    }

    const lines = content.split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!looksLikeUserFacingLiteral(line)) {
        continue;
      }

      const rule = findPseudoThinkingGrammarRule(line);
      if (rule) {
        diagnostics.push(
          buildAntiHardcodeDiagnostic({
            file: relFile,
            line: index + 1,
            sourceLine: line,
            rule,
          }),
        );
      }
    }
  }

  return diagnostics;
}
