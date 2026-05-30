import * as fs from 'node:fs';
import * as path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { validate } from './engine.js';
import { resolveSafeTarget } from './guard.js';
import { renameSymbolCrossFile, renameMemberCrossFile } from './advanced.js';
import { log } from './server-helpers-io.js';
import { ok, fail } from './server-helpers-result.js';
import { writeWholeFilePlan } from './server-helpers-multifile.js';

export function registerToolsD(server: McpServer): void {
server.registerTool(
  'atomic_rename_symbol_cross_file',
  {
    title: 'Scope-correct rename across the whole project',
    description:
      'True semantic rename via the TypeScript language service (nearest tsconfig): renames the symbol ' +
      'at (line,column) and ALL its references across every file, respecting scope/shadowing. ' +
      'All-or-nothing: if even one touched file would break, NOTHING is written. This is the Kiro ' +
      "'use program analysis, not LLM guessing' operator. Supports preview.",
    inputSchema: {
      file: z.string(),
      line: z.number().int().min(1),
      column: z.number().int().min(1),
      newName: z.string().min(1),
      preview: z.boolean().optional().describe('dry-run: list files + refs, do not write'),
      includeStrings: z
        .boolean()
        .optional()
        .describe(
          'after TS rename, also do regex-based string replacement of oldName->newName across all repo text files',
        ),
    },
  },
  async (a) => {
    try {
      const { absPath, repoRoot } = resolveSafeTarget(a.file);
      const r = await renameSymbolCrossFile(absPath, repoRoot, a.line, a.column, a.newName);
      const bad = r.validations.filter((v) => !v.ok);
      if (bad.length > 0) {
        return fail(
          `rejected: rename would break ${bad.length} file(s): ` +
            bad.map((b) => `${b.file} (${b.introduced ?? 'syntax error'})`).join('; ') +
            ' — NOTHING written.',
        );
      }
      // every change target must also pass the governance guard in the same resolved root
      for (const rel of r.changes.keys()) resolveSafeTarget(path.join(repoRoot, rel));
      if (a.preview ?? false) {
        return ok({
          ok: true,
          preview: true,
          changed: false,
          symbol: r.symbol,
          references: r.totalReferences,
          files: [...r.changes.keys()],
        });
      }
      let stringReplacedCount = 0;
      const stringReplacedByKind: Record<string, number> = {};
      if (a.includeStrings) {
        const oldName = r.symbol;
        const regex = new RegExp(`\\b${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
        const excludeDirs = new Set(['node_modules', '.git', 'dist', 'build', '.atomic', '.next', 'coverage']);
        const walkDir = (dir: string): string[] => {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          const results: string[] = [];
          for (const entry of entries) {
            if (excludeDirs.has(entry.name)) continue;
            if (entry.name.startsWith('.') && !['.env', '.eslintrc', '.prettierrc'].includes(entry.name)) continue;
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              results.push(...walkDir(fullPath));
            } else if (entry.isFile()) {
              const ext = path.extname(entry.name).toLowerCase();
              const textExts = new Set([
                '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts',
                '.json', '.md', '.txt', '.html', '.css', '.yml', '.yaml',
                '.env', '.graphql', '.prisma', '.sql', '.sh', '.vue', '.svelte',
              ]);
              if (textExts.has(ext) || ext === '') {
                results.push(fullPath);
              }
            }
          }
          return results;
        };
        const allFiles = walkDir(repoRoot);
        for (const absFile of allFiles) {
          if (r.changes.has(path.relative(repoRoot, absFile))) continue;
          let content: string;
          try {
            content = fs.readFileSync(absFile, 'utf8');
          } catch {
            continue;
          }
          const newContent = content.replace(regex, a.newName);
          if (newContent === content) continue;
          if (content.length > 500 * 1024) continue;
          try {
            resolveSafeTarget(absFile);
          } catch {
            continue;
          }
          const validation = validate(
            path.relative(repoRoot, absFile),
            content,
            newContent,
          );
          if (!validation.ok) continue;
          const rel = path.relative(repoRoot, absFile);
          r.changes.set(rel, newContent);
          stringReplacedCount++;
          const ext = path.extname(rel).toLowerCase() || '(no-ext)';
          stringReplacedByKind[ext] = (stringReplacedByKind[ext] || 0) + 1;
        }
      }
      writeWholeFilePlan(repoRoot, r.changes, 'atomic_rename_symbol_cross_file');
      log(
        `cross-file rename ${r.symbol}: ${r.changes.size} file(s), ${r.totalReferences} refs` +
          (stringReplacedCount > 0 ? `, ${stringReplacedCount} string-replaced` : ''),
      );
      return ok({
        ok: true,
        changed: true,
        symbol: r.symbol,
        references: r.totalReferences,
        files: [...r.changes.keys()],
        ...(stringReplacedCount > 0
          ? { stringReplacedCount, stringReplacedByKind }
          : {}),
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'atomic_rename_member',
  {
    title: 'Name-addressed cross-file rename of a class/interface member',
    description:
      'Rename a class/interface MEMBER by NAME — no line/column. Give the file where the owner ' +
      'type is declared, the owner class/interface name, the current member name, and the new name. ' +
      'Resolves the member internally then renames it + ALL references across the project (including ' +
      'test-double property accesses and DI doubles), all-or-nothing. PREFER this over ' +
      'atomic_rename_symbol_cross_file for renaming a class method/property: it removes the ' +
      'coordinate-guessing surface (no "position is not an identifier" failures). Supports preview.',
    inputSchema: {
      file: z.string().describe('file where the owner class/interface is declared'),
      className: z.string().min(1).describe('owner class or interface name'),
      memberName: z.string().min(1).describe('current member (method/property) name'),
      newName: z.string().min(1),
      preview: z.boolean().optional().describe('dry-run: list files + refs, do not write'),
    },
  },
  async (a) => {
    try {
      const { absPath, repoRoot } = resolveSafeTarget(a.file);
      const r = await renameMemberCrossFile(absPath, repoRoot, a.className, a.memberName, a.newName);
      const bad = r.validations.filter((v) => !v.ok);
      if (bad.length > 0) {
        return fail(
          `rejected: rename would break ${bad.length} file(s): ` +
            bad.map((b) => `${b.file} (${b.introduced ?? 'syntax error'})`).join('; ') +
            ' — NOTHING written.',
        );
      }
      for (const rel of r.changes.keys()) resolveSafeTarget(path.join(repoRoot, rel));
      if (a.preview ?? false) {
        return ok({
          ok: true,
          preview: true,
          changed: false,
          symbol: r.symbol,
          references: r.totalReferences,
          files: [...r.changes.keys()],
        });
      }
      writeWholeFilePlan(repoRoot, r.changes, 'atomic_rename_member');
      log(
        `rename_member ${a.className}.${a.memberName} -> ${a.newName}: ${r.changes.size} file(s), ${r.totalReferences} refs`,
      );
      return ok({
        ok: true,
        changed: true,
        symbol: r.symbol,
        references: r.totalReferences,
        files: [...r.changes.keys()],
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

}
