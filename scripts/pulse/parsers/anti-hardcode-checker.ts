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
const SKIP_FILE_RE =
  /(?:^|\/)(?:__tests__|__mocks__|coverage|dist|node_modules|test)(?:\/|$)|\.(?:spec|test)\.[jt]sx?$/;
const STRING_LITERAL_RE = /['"`][^'"`\n]{0,240}['"`]/;

const FORBIDDEN_PSEUDO_THINKING = [
  {
    pattern: /Entendendo sua/i,
    description:
      'Hardcoded pseudo-thinking text found in product code — model cognition is being simulated.',
    detail:
      'Remove the pseudo-thinking copy or move it to an explicit system/runtime state. If it looks like model reasoning, it must come from the model.',
  },
  {
    pattern: /Redigindo a resposta/i,
    description:
      'Hardcoded drafting narration found — assistant response is being impersonated by product code.',
    detail:
      'Do not hardcode narration like "Redigindo a resposta". Keep only branded motion/timer unless real reasoning came from the provider.',
  },
  {
    pattern: /Processando sua/i,
    description: 'Hardcoded processing narration found — product is inventing AI activity text.',
    detail:
      'Replace generic processing prose with honest runtime state. The anti-hardcode contract forbids fake cognition text.',
  },
  {
    pattern: /Executando a ferramenta/i,
    description: 'Tool narration is being exposed as model speech.',
    detail:
      'Internal tool activity must not be rendered as if it were the model speaking to the user.',
  },
  {
    pattern: /Integrando o resultado/i,
    description: 'Hardcoded tool/result narration found — model reasoning is being simulated.',
    detail:
      'System/runtime summaries must be explicit system states, not imitation of the model internal process.',
  },
  {
    pattern: /Consolidando os resultados/i,
    description: 'Hardcoded consolidation narration found in product code.',
    detail:
      'The product cannot fabricate intermediate reasoning prose. Remove the text or source it from the model.',
  },
  {
    pattern: /Reprocessando esta/i,
    description: 'Hardcoded reprocessing narration found — product is faking model workflow text.',
    detail:
      'Do not narrate model internals with hardcoded copy. Use explicit system state only when needed.',
  },
  {
    pattern: /Resposta pronta/i,
    description: 'Hardcoded "response ready" cognition text found.',
    detail:
      'This phrasing impersonates internal model activity. Remove it or convert it to clearly-marked system state.',
  },
  {
    pattern: /reunindo o contexto/i,
    description: 'Hardcoded context-gathering narration found.',
    detail:
      'The product cannot claim the model is gathering context unless the model explicitly returned that text.',
  },
  {
    pattern: /Avaliando se precisa/i,
    description: 'Hardcoded decision narration found in AI-facing product code.',
    detail: 'Do not hardcode phrases that pretend the model is evaluating or deciding internally.',
  },
];

function isSkippable(relPath: string): boolean {
  return SKIP_FILE_RE.test(relPath);
}

function looksLikeUserFacingLiteral(line: string): boolean {
  return STRING_LITERAL_RE.test(line);
}

export function checkAntiHardcode(config: PulseConfig): Break[] {
  const breaks: Break[] = [];
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

      for (const rule of FORBIDDEN_PSEUDO_THINKING) {
        if (!rule.pattern.test(line)) {
          continue;
        }
        breaks.push({
          type: 'AI_PSEUDO_THINKING_HARDCODED',
          severity: 'critical',
          file: relFile,
          line: index + 1,
          description: rule.description,
          detail: rule.detail,
        });
        break;
      }
    }
  }

  return breaks;
}
