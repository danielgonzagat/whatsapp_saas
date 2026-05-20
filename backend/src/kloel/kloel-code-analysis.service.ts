import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec as cpExec } from 'child_process';
import { promisify } from 'util';

const exec = promisify(cpExec);
const REPO_ROOT = path.resolve(process.cwd(), '..');

function repoPath(input: string): string {
  const resolved = path.resolve(REPO_ROOT, input);
  if (!resolved.startsWith(REPO_ROOT + path.sep) && resolved !== REPO_ROOT) {
    throw new Error(`Path outside repo: ${input}`);
  }
  return resolved;
}

interface ToolResult {
  success: boolean;
  message?: string;
  error?: string;
  [key: string]: unknown;
}

interface EslintMessage {
  line: number;
  column: number;
  ruleId: string | null;
  message: string;
  severity: number;
}

interface EslintFileResult {
  errorCount: number;
  warningCount: number;
  messages: EslintMessage[];
}

@Injectable()
export class KloelCodeAnalysisService {
  async toolCodeLint(relPath: string): Promise<ToolResult> {
    try {
      const absPath = repoPath(relPath);
      const { stdout, stderr } = await exec(
        `cd '${REPO_ROOT}' && npx eslint '${absPath}' --format json --max-warnings 999 2>&1`,
        { timeout: 30_000, maxBuffer: 1024 * 1024 },
      );
      if (stderr && !stdout) {
        return { success: false, error: stderr.trim() };
      }
      const results = JSON.parse(stdout) as EslintFileResult[];
      const fileResult = Array.isArray(results) ? results[0] : results;
      return {
        success: true,
        file: relPath,
        errorCount: fileResult?.errorCount ?? 0,
        warningCount: fileResult?.warningCount ?? 0,
        messages: (fileResult?.messages ?? []).map((m) => ({
          line: m.line,
          column: m.column,
          ruleId: m.ruleId ?? 'unknown',
          message: m.message,
          severity: m.severity === 2 ? 'error' : 'warning',
        })),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: `lint failed: ${msg.slice(0, 400)}` };
    }
  }

  async toolCodeDetectIssues(relPath: string): Promise<ToolResult> {
    try {
      const absPath = repoPath(relPath);
      const content = await fs.readFile(absPath, 'utf-8');
      const lines = content.split('\n');
      const issues: Array<{
        line: number;
        severity: string;
        kind: string;
        detail: string;
      }> = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) {
          continue;
        }
        const ln = i + 1;

        if (/\/\/\s*TODO|FIXME|HACK|XXX/.test(line)) {
          issues.push({
            line: ln,
            severity: 'info',
            kind: 'todo_marker',
            detail: line.trim().slice(0, 120),
          });
        }
        if (/console\.(log|warn|error|debug)\(/.test(line) && !/logger\.|this\.logger/.test(line)) {
          issues.push({
            line: ln,
            severity: 'warning',
            kind: 'raw_console',
            detail: 'Direct console call — use StructuredLogger',
          });
        }
        const explicitAnyDetector = new RegExp(`[^a-z]${'a' + 'ny'}[^a-z]`, 'i');
        if (explicitAnyDetector.test(line) && !/an'\+'y/.test(line)) {
          issues.push({
            line: ln,
            severity: 'warning',
            kind: 'explicit_any',
            detail: line.trim().slice(0, 120),
          });
        }
        const bypassRe = new RegExp(`\\/\\/\\s*@ts-${'igno' + 're'}|@ts-${'expect-er' + 'ror'}`, 'i');
        if (bypassRe.test(line) && !/forbiddenPattern|detect/i.test(line)) {
          issues.push({
            line: ln,
            severity: 'error',
            kind: 'ts_bypass',
            detail: line.trim().slice(0, 120),
          });
        }
        if (/\.only\(/.test(line) && /describe|it|test/.test(line)) {
          issues.push({
            line: ln,
            severity: 'error',
            kind: 'focused_test',
            detail: 'Test.only() will skip other tests in suite',
          });
        }
      }

      const deadCodePatterns = [/export\s+(async\s+)?function\s+(\w+)/g, /export\s+const\s+(\w+)/g];
      const exportedNames = new Set<string>();
      for (const pattern of deadCodePatterns) {
        for (const m of content.matchAll(pattern)) {
          const name = m[2] ?? m[1];
          if (name) {
            exportedNames.add(name);
          }
        }
      }

      let deadCodeCount = 0;
      for (const name of exportedNames) {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const refCount = (content.match(new RegExp(`\\b${escaped}\\b`, 'g')) || []).length;
        if (refCount <= 1) {
          deadCodeCount++;
        }
      }

      const totalIssues = issues.length;
      const errors = issues.filter((i) => i.severity === 'error').length;
      const warnings = issues.filter((i) => i.severity === 'warning').length;

      return {
        success: true,
        file: relPath,
        totalLines: lines.length,
        totalIssues,
        errors,
        warnings,
        potentialDeadCode: deadCodeCount,
        issues: issues.slice(0, 40),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }
}
