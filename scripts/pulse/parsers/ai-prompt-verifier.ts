/**
 * PULSE Parser 64: AI Prompt Verifier
 * Layer 8: AI/LLM Quality
 * Mode: STATIC (source code analysis - no runtime needed)
 *
 * This parser does not keep a fixed catalog of agent files or required prompt
 * sections. It discovers prompt-building source files, extracts context inputs
 * that the code itself loads or receives, and requires proof that each discovered
 * context signal reaches the prompt/message payload.
 */

import * as path from 'path';
import { readTextFile } from '../safe-fs';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

interface AgentContent {
  file: string;
  content: string;
}

interface ContextGrammarRule {
  token: string;
  identifier: RegExp;
}

interface ContextInputProof {
  symbol: string;
  token: string;
  file: string;
  line: number;
}

const CONTEXT_GRAMMAR_RULES: ContextGrammarRule[] = [
  { token: 'product', identifier: /\bproducts?\w*/i },
  { token: 'configuration', identifier: /\b\w*(?:configs?|settings?)\w*/i },
  { token: 'cognition', identifier: /\b\w*(?:cognit|sentiment|leadScore)\w*/i },
  { token: 'history', identifier: /\b\w*(?:history|ledger|transcript)\w*/i },
  { token: 'workspace', identifier: /\bworkspace\w*/i },
  { token: 'message', identifier: /\bmessage(?:Content)?\b/i },
  { token: 'knowledge', identifier: /\b\w*(?:knowledge|kbContext)\w*/i },
  { token: 'memory', identifier: /\bcompressedContext\b|\bmemory\b/i },
  { token: 'instruction', identifier: /\b\w*(?:instruction|policy|hint|directive)\w*/i },
];

function readSafe(file: string): string {
  try {
    return readTextFile(file, 'utf8');
  } catch {
    return '';
  }
}

function shouldSkipSource(file: string): boolean {
  return /(?:^|[/\\])(?:dist|node_modules|__tests__|__mocks__)(?:[/\\]|$)|\.(?:spec|test)\.ts$/.test(
    file,
  );
}

function hasPromptAssemblyEvidence(content: string): boolean {
  return (
    /\b(?:systemPrompt|userMessage|messages|promptText|build[A-Za-z0-9_]*Prompt)\b/.test(content) &&
    /\b(?:OpenAI|generateResponse|chatCompletion|completion|model)\b/i.test(content)
  );
}

function discoverAgentContents(config: PulseConfig): AgentContent[] {
  const roots = [config.backendDir, config.workerDir].filter((dir) => dir.trim().length > 0);
  const discovered: AgentContent[] = [];

  for (const root of roots) {
    for (const file of walkFiles(root, ['.ts'])) {
      if (shouldSkipSource(file)) {
        continue;
      }
      const content = readSafe(file);
      if (content && hasPromptAssemblyEvidence(content)) {
        discovered.push({ file, content });
      }
    }
  }

  return discovered.sort((left, right) => left.file.localeCompare(right.file));
}

function lineNumberFor(content: string, index: number): number {
  return content.slice(0, Math.max(0, index)).split('\n').length;
}

function identifierTokens(source: string): string[] {
  return source.match(/\b[A-Za-z_][A-Za-z0-9_]*\b/g) ?? [];
}

function isContextPayloadSymbol(symbol: string): boolean {
  if (/(?:^|_)(?:id|ids)$/i.test(symbol) || /Id$|Ids$/.test(symbol)) {
    return false;
  }
  return CONTEXT_GRAMMAR_RULES.some((rule) => rule.identifier.test(symbol));
}

function contextTokenFor(symbol: string): string {
  return CONTEXT_GRAMMAR_RULES.find((rule) => rule.identifier.test(symbol))?.token ?? 'context';
}

function collectContextInputProofs(agentContents: readonly AgentContent[]): ContextInputProof[] {
  const proofs = new Map<string, ContextInputProof>();

  for (const { file, content } of agentContents) {
    const declarationSignals = content.matchAll(
      /\b(?:const|let|var)\s+([^=;]+?)\s*=\s*(?:await\s+)?[\s\S]*?(?:;|\n\s*\])/g,
    );

    for (const match of declarationSignals) {
      const declaration = match[1] ?? '';
      for (const symbol of identifierTokens(declaration)) {
        if (!isContextPayloadSymbol(symbol)) {
          continue;
        }
        const line = lineNumberFor(content, match.index ?? 0);
        proofs.set(`${file}:${symbol}:${line}`, {
          symbol,
          token: contextTokenFor(symbol),
          file,
          line,
        });
      }
    }

    const parameterSignals = content.matchAll(/\b(?:params|input|data)\.([A-Za-z_][A-Za-z0-9_]*)/g);
    for (const match of parameterSignals) {
      const symbol = match[1];
      if (!symbol || !isContextPayloadSymbol(symbol)) {
        continue;
      }
      const line = lineNumberFor(content, match.index ?? 0);
      proofs.set(`${file}:${symbol}:${line}`, {
        symbol,
        token: contextTokenFor(symbol),
        file,
        line,
      });
    }
  }

  return [...proofs.values()];
}

function collectPromptCorpus(agentContents: readonly AgentContent[]): string {
  const slices: string[] = [];

  for (const { content } of agentContents) {
    const lines = content.split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      if (
        /\b(?:systemPrompt|userMessage|messages|promptText|generateResponse|chatCompletion)\b/.test(
          lines[index] ?? '',
        )
      ) {
        const statementLines: string[] = [];
        let balance = 0;
        for (let cursor = index; cursor < lines.length; cursor += 1) {
          const line = lines[cursor] ?? '';
          statementLines.push(line);
          for (const char of line) {
            if (char === '(' || char === '[' || char === '{') {
              balance += 1;
            }
            if (char === ')' || char === ']' || char === '}') {
              balance -= 1;
            }
          }
          if (balance <= 0 && /[;)]\s*$/.test(line.trim())) {
            break;
          }
        }
        slices.push(statementLines.join('\n'));
      }
    }
  }

  return slices.join('\n');
}

function hasPromptUsage(promptCorpus: string, proof: ContextInputProof): boolean {
  return new RegExp(`\\b${proof.symbol}\\b`).test(promptCorpus);
}

function createPromptBreak(params: {
  file: string;
  line: number;
  severity: Break['severity'];
  description: string;
  detail: string;
}): Break {
  return {
    type: 'AI_PROMPT_INCOMPLETE',
    severity: params.severity,
    file: params.file,
    line: params.line,
    description: params.description,
    detail: params.detail,
  };
}

function pushMissingContextBreaks(
  breaks: Break[],
  config: PulseConfig,
  proofs: readonly ContextInputProof[],
  promptCorpus: string,
): void {
  const proofsByToken = new Map<string, ContextInputProof[]>();
  for (const proof of proofs) {
    const tokenProofs = proofsByToken.get(proof.token) ?? [];
    tokenProofs.push(proof);
    proofsByToken.set(proof.token, tokenProofs);
  }

  for (const [token, tokenProofs] of proofsByToken.entries()) {
    if (tokenProofs.some((proof) => hasPromptUsage(promptCorpus, proof))) {
      continue;
    }

    const proof = tokenProofs[0];
    if (!proof) {
      continue;
    }
    const relFile = path.relative(config.rootDir, proof.file);
    breaks.push(
      createPromptBreak({
        file: proof.file,
        line: proof.line,
        severity: 'critical',
        description: `AI prompt assembly drops discovered ${token} context`,
        detail:
          `${relFile}:${proof.line}: discovered context input "${proof.symbol}" ` +
          `but no prompt/message payload references any ${token} context symbol. ` +
          'Prompt completeness is derived from source evidence, not from a fixed section list.',
      }),
    );
  }
}

function pushTemplateAndSerializationBreaks(
  breaks: Break[],
  agentContents: readonly AgentContent[],
): void {
  for (const { file, content } of agentContents) {
    const lines = content.split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? '';
      if (!/\b(?:systemPrompt|buildPrompt|promptText|prompt)\b/i.test(line)) {
        continue;
      }
      if (/\{\{[^}]+\}\}|<%[^%]+%>/.test(line)) {
        breaks.push(
          createPromptBreak({
            file,
            line: index + 1,
            severity: 'critical',
            description: 'Unfilled template placeholder in AI prompt',
            detail:
              `Line ${index + 1}: Found unresolved template placeholder in prompt assembly. ` +
              'Template evidence must be filled before sending to the LLM.',
          }),
        );
        break;
      }
    }

    const serializationMatch = content.match(
      /\[object Object\]|"undefined"|'undefined'|\+ undefined\b/,
    );
    if (serializationMatch) {
      breaks.push(
        createPromptBreak({
          file,
          line: lineNumberFor(content, serializationMatch.index ?? 0),
          severity: 'critical',
          description: 'Prompt serialization error',
          detail: `Found "${serializationMatch[0]}" in AI prompt source. This corrupts the LLM prompt with non-evidence values.`,
        }),
      );
    }
  }
}

/** Check ai prompt verifier. */
export function checkAiPromptVerifier(config: PulseConfig): Break[] {
  const breaks: Break[] = [];
  const agentContents = discoverAgentContents(config);

  if (agentContents.length === 0) {
    breaks.push(
      createPromptBreak({
        file: config.backendDir,
        line: 0,
        severity: 'critical',
        description: 'AI prompt assembly source not discovered',
        detail:
          'PULSE scanned backend/worker sources and found no file with both prompt assembly and LLM invocation evidence.',
      }),
    );
    return breaks;
  }

  const contextInputProofs = collectContextInputProofs(agentContents);
  const promptCorpus = collectPromptCorpus(agentContents);

  pushMissingContextBreaks(breaks, config, contextInputProofs, promptCorpus);
  pushTemplateAndSerializationBreaks(breaks, agentContents);

  return breaks;
}
