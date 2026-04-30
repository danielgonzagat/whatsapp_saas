import * as path from 'path';
import { calculateDynamicRisk } from '../dynamic-risk-model';
import { synthesizeDiagnostic } from '../diagnostic-synthesizer';
import { buildPredicateGraph } from '../predicate-graph';
import { buildPulseSignalGraph, type PulseSignalEvidence } from '../signal-graph';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';

// Files excluded from the export check — these are entrypoints or re-export
// aggregators that NestJS or Next.js auto-discovers.
function isEntrypointFile(filePath: string): boolean {
  const base = path.basename(filePath);
  return (
    base === 'index.ts' ||
    base === 'main.ts' ||
    base === 'bootstrap.ts' ||
    base.endsWith('.module.ts') ||
    base === 'page.tsx' ||
    base === 'route.ts' ||
    base === 'layout.tsx' ||
    base === 'loading.tsx' ||
    base === 'error.tsx' ||
    base === 'not-found.tsx'
  );
}

function shouldSkipFile(filePath: string): boolean {
  return /\.(spec|test|d)\.ts$|__tests__|__mocks__|\/seed\.|\/migration\.|fixture/i.test(filePath);
}

/**
 * Extract exported identifiers from a TypeScript source file.
 * Handles: export function X, export class X, export const X, export type X,
 * export interface X, export enum X, export { X }, export default (ignored).
 */
function extractExports(content: string): string[] {
  const names: string[] = [];

  // Named statement exports: export (async)? (function|class|const|let|var|enum|abstract class) NAME
  // NOTE: Exclude `export interface` and `export type` — these are consumed implicitly
  // by TypeScript's declaration emit and don't need explicit import references.
  const stmtRe =
    /^export\s+(?:async\s+)?(?:function|class|const|let|var|enum|abstract\s+class)\s+([A-Za-z_$][A-Za-z0-9_$]*)/gm;
  let m: RegExpExecArray | null;
  while ((m = stmtRe.exec(content)) !== null) {
    names.push(m[1]);
  }

  // Named export lists: export { A, B as C }
  const listRe = /^export\s+\{([^}]+)\}/gm;
  while ((m = listRe.exec(content)) !== null) {
    for (const part of m[1].split(',')) {
      // "A as B" → use B (the external name)
      const alias = part.trim().split(/\s+as\s+/);
      const exported = alias[alias.length - 1].trim();
      if (exported && /^[A-Za-z_$]/.test(exported)) {
        names.push(exported);
      }
    }
  }

  return names;
}

function isIdentifierChar(value: string): boolean {
  return /[A-Za-z0-9_$]/.test(value);
}

function containsIdentifier(content: string, name: string): boolean {
  let index = content.indexOf(name);
  while (index >= 0) {
    const before = index > 0 ? content[index - 1] : '';
    const after = content[index + name.length] || '';
    if (!isIdentifierChar(before) && !isIdentifierChar(after)) {
      return true;
    }
    index = content.indexOf(name, index + name.length);
  }
  return false;
}

interface DeadExportBreakInput {
  file: string;
  line: number;
  exportedName: string;
  sourceFileName: string;
}

function diagnosticToken(value: string): string {
  return value
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function buildDeadExportBreak(input: DeadExportBreakInput): Break {
  const predicates = ['exported_symbol_observed', 'cross_file_reference_absent'];
  const summary = `Exported symbol '${input.exportedName}' has no references in other files`;
  const detail = `'${input.exportedName}' is exported from ${input.sourceFileName} but not imported/used anywhere in the backend. Consider removing or making it private.`;
  const signal: PulseSignalEvidence = {
    source: `grammar-kernel:dead-code-finder;predicates=${predicates.join(',')}`,
    detector: 'dead-code-finder',
    truthMode: 'confirmed_static',
    summary,
    detail,
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
  const predicateToken = predicates.map(diagnosticToken).filter(Boolean).join('+');

  return {
    type: `diagnostic:dead-code-finder:${predicateToken || diagnostic.id}`,
    severity: 'low',
    file: input.file,
    line: input.line,
    description: diagnostic.title,
    detail: `${diagnostic.summary}; evidence=${diagnostic.evidenceIds.join(',')}; ${detail}`,
    source: `${signal.source};detector=${signal.detector};truthMode=${signal.truthMode}`,
    surface: 'dead-code',
  };
}

/** Check dead code. */
export function checkDeadCode(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  // Only scan backend services and controllers — not frontend (too many re-exports)
  const targetFiles = walkFiles(config.backendDir, ['.ts']).filter((f) => {
    if (shouldSkipFile(f) || isEntrypointFile(f)) {
      return false;
    }
    const rel = path.relative(config.backendDir, f);
    // Only services and controllers
    return rel.includes('.service.ts') || rel.includes('.controller.ts');
  });

  if (targetFiles.length === 0) {
    return breaks;
  }

  // Build a corpus of all backend .ts files to search for references
  const allBackendFiles = walkFiles(config.backendDir, ['.ts']).filter((f) => !shouldSkipFile(f));

  // Cache file contents to avoid repeated reads
  const contentCache = new Map<string, string>();
  for (const f of allBackendFiles) {
    try {
      contentCache.set(f, readTextFile(f, 'utf8'));
    } catch {
      // skip unreadable
    }
  }

  for (const file of targetFiles) {
    const content = contentCache.get(file);
    if (!content) {
      continue;
    }

    const relFile = path.relative(config.rootDir, file);
    const exportedNames = extractExports(content);

    for (const name of exportedNames) {
      // Skip very short names and common generic names that will have many false positives
      if (name.length < 4) {
        continue;
      }
      if (['default', 'type', 'interface', 'enum'].includes(name)) {
        continue;
      }

      let foundReference = false;

      // Search all other backend files for any reference to this name
      for (const [otherFile, otherContent] of contentCache) {
        if (otherFile === file) {
          continue;
        }

        if (containsIdentifier(otherContent, name)) {
          foundReference = true;
          break;
        }
      }

      if (!foundReference) {
        // Find the line number of the export in the file
        const lines = content.split('\n');
        let lineNum = 1;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes('export') && containsIdentifier(lines[i], name)) {
            lineNum = i + 1;
            break;
          }
        }

        breaks.push(
          buildDeadExportBreak({
            file: relFile,
            line: lineNum,
            exportedName: name,
            sourceFileName: path.basename(file),
          }),
        );
      }
    }
  }

  return breaks;
}
