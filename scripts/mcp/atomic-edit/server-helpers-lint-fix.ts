import * as path from 'node:path';
import { type EslintDryRunResult } from './server-helpers-io.js';
import { unusedSymbolFromLintMessage } from './server-helpers-verify.js';
import { resolveSafeTarget } from './guard.js';

export function buildLintResidueActionCandidates(
  results: EslintDryRunResult[],
  cwdAbsPath: string,
): Record<string, unknown>[] {
  const candidates: Record<string, unknown>[] = [];
  for (const result of results) {
    for (const message of result.messages ?? []) {
      const symbol = unusedSymbolFromLintMessage(message.message);
      const fileInput = path.isAbsolute(result.filePath)
        ? result.filePath
        : path.join(cwdAbsPath, result.filePath);
      let relPath = result.filePath;
      try {
        relPath = resolveSafeTarget(fileInput).relPath;
      } catch {
        // Residue guidance is advisory only; never fail the analyzer because a message path is odd.
      }
      const isPreservationAnchor =
        typeof symbol === 'string' && /^(?:envBackup|mailEnvBackup)$|fixture/i.test(symbol);
      candidates.push({
        file: relPath,
        line: message.line,
        column: message.column,
        ruleId: message.ruleId,
        message: message.message?.slice(0, 240),
        symbol,
        topology: isPreservationAnchor
          ? 'preserve_existing_anchor_by_adding_usage'
          : 'classify_preserve_or_remove_unused_symbol',
        preferredAtomicAction: isPreservationAnchor
          ? 'use_existing_fixture_or_env_backup_with_atomic_replace_text'
          : 'read_smallest_context_then_use_or_remove_symbol_atomically',
        guidance: isPreservationAnchor
          ? 'Treat this as a preservation anchor first; prefer using it to restore isolation/proof before deleting it.'
          : 'Do not delete by default; first decide whether the symbol encodes product/test intent or is genuine residue.',
      });
    }
  }
  return candidates;
}

export interface KnownLintResidueFix {
  symbol: string;
  description: string;
}

export function addVitestNamedImport(text: string, name: string): string {
  return text.replace(/import \{([^}]+)\} from 'vitest';/, (statement, namesText: string) => {
    const names = namesText
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    if (names.includes(name)) return statement;
    return `import { ${[...names, name].join(', ')} } from 'vitest';`;
  });
}

export function applyMailEnvBackupResidueFix(text: string): string {
  if (!text.includes('const mailEnvBackup') || text.includes('setMailEnv(mailEnvBackup);')) {
    return text;
  }
  const withImport = addVitestNamedImport(text, 'afterEach');
  const anchor = "  describe('sendEmail', () => {";
  if (!withImport.includes(anchor)) return text;
  return withImport.replace(
    anchor,
    '  afterEach(() => {\n    setMailEnv(mailEnvBackup);\n  });\n\n' + anchor,
  );
}

export function applyOpenAiEnvBackupResidueFix(text: string): string {
  if (
    !text.includes('const envBackup') ||
    text.includes('restoreOpenAiEnvs') ||
    text.includes('process.env = { ...envBackup }')
  ) {
    return text;
  }
  const withImport = addVitestNamedImport(text, 'afterEach');
  const anchor = "  describe('resolveWorkerOpenAIModel', () => {";
  if (!withImport.includes(anchor)) return text;
  return withImport.replace(
    anchor,
    '  afterEach(() => {\n' + '    process.env = { ...envBackup };\n' + '  });\n\n' + anchor,
  );
}

export function applyEmptyDemographicsResidueFix(text: string): string {
  if (
    !text.includes('const emptyDemographics') ||
    text.includes('expect(result.demographics).toEqual(emptyDemographics);')
  ) {
    return text;
  }
  const anchor = '    expect(result.leadScore).toBeLessThanOrEqual(100);\n';
  if (!text.includes(anchor)) return text;
  return text.replace(
    anchor,
    `${anchor}    expect(result.demographics).toEqual(emptyDemographics);\n`,
  );
}

export function applyKnownLintResidueFixes(
  relPath: string,
  text: string,
  messages: EslintDryRunResult['messages'],
): { text: string; applied: KnownLintResidueFix[] } {
  let next = text;
  const applied: KnownLintResidueFix[] = [];
  const symbols = new Set(
    (messages ?? []).map((message) => unusedSymbolFromLintMessage(message.message)),
  );
  const apply = (symbol: string, description: string, fn: (source: string) => string): void => {
    if (!symbols.has(symbol)) return;
    const before = next;
    next = fn(next);
    if (next !== before) applied.push({ symbol, description });
  };

  apply(
    'mailEnvBackup',
    'preserve mail env backup by restoring it after each test',
    applyMailEnvBackupResidueFix,
  );
  apply(
    'envBackup',
    'preserve OpenAI env backup by restoring target env keys after each test',
    applyOpenAiEnvBackupResidueFix,
  );
  apply(
    'emptyDemographics',
    'preserve expected empty demographics fixture by asserting it in the empty-message behavior test',
    applyEmptyDemographicsResidueFix,
  );

  return {
    text: next,
    applied: applied.map((fix) => ({ ...fix, description: `${relPath}: ${fix.description}` })),
  };
}

