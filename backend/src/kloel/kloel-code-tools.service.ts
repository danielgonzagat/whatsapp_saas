import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec as cpExec } from 'child_process';
import { promisify } from 'util';

const exec = promisify(cpExec);

const REPO_ROOT = path.resolve(process.cwd(), '..');
const MAX_FILE_BYTES = 100_000;
const MAX_GREP_RESULTS = 30;
const GIT_LOG_MAX_COUNT = 20;
const DIR_MAX_ENTRIES = 50;

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

interface JestOutput {
  success: boolean;
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  testResults?: Array<{ name: string; status: string }>;
}


@Injectable()
export class KloelCodeToolsService {
  private readonly logger = StructuredLogger.from(KloelCodeToolsService.name);

  async toolReadSourceFile(
    relPath: string,
    startLine?: number,
    endLine?: number,
  ): Promise<ToolResult> {
    try {
      const absPath = repoPath(relPath);
      const stat = await fs.stat(absPath);
      if (!stat.isFile()) {
        return { success: false, error: 'not_a_file' };
      }
      if (stat.size > MAX_FILE_BYTES) {
        return {
          success: false,
          error: `file_too_large: ${stat.size} bytes, max ${MAX_FILE_BYTES}`,
        };
      }
      let content = await fs.readFile(absPath, 'utf-8');
      const lines = content.split('\n');
      const totalLines = lines.length;
      if (startLine && endLine) {
        const s = Math.max(1, startLine);
        const e = Math.min(totalLines, endLine);
        content = lines
          .slice(s - 1, e)
          .map((l, i) => `${s + i}: ${l}`)
          .join('\n');
      }
      return {
        success: true,
        file: relPath,
        totalLines,
        content,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('ENOENT')) {
        return { success: false, error: 'file_not_found' };
      }
      this.logger.error(`read_source_file failed: ${msg}`);
      return { success: false, error: msg };
    }
  }

  async toolListSourceDir(relDir?: string): Promise<ToolResult> {
    try {
      const dirPath = relDir ? repoPath(relDir) : REPO_ROOT;
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const sorted = entries
        .filter((e) => !e.name.startsWith('.') || e.name === '.env.example')
        .slice(0, DIR_MAX_ENTRIES)
        .map((e) => ({
          name: e.name,
          kind: e.isDirectory() ? 'directory' : e.isSymbolicLink() ? 'symlink' : 'file',
        }));
      sorted.sort((a, b) => {
        if (a.kind !== b.kind) {
          return a.kind === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
      return { success: true, path: relDir || '.', entries: sorted, total: sorted.length };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  async toolSearchCodebase(pattern: string, glob?: string): Promise<ToolResult> {
    try {
      const globArg = glob ? `--glob '${glob.replace(/'/g, "'\\''")}'` : '';
      const cmd = `cd '${REPO_ROOT}' && rg --line-number --max-count ${MAX_GREP_RESULTS} ${globArg} '${pattern.replace(/'/g, "'\\''")}' 2>&1`;
      const { stdout, stderr } = await exec(cmd, { timeout: 15_000, maxBuffer: 1024 * 1024 });
      if (stderr && !stdout) {
        return { success: false, error: stderr.trim() };
      }
      const lines = stdout.trim().split('\n').filter(Boolean);
      return {
        success: true,
        pattern,
        glob: glob || null,
        matchCount: lines.length,
        results: lines.map((line) => {
          const [file, lnum, ...rest] = line.split(':');
          return { file, line: Number(lnum), content: rest.join(':').trim() };
        }),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('exit code 1') && msg.includes('stdout')) {
        return { success: true, pattern, matchCount: 0, results: [] };
      }
      return { success: false, error: msg };
    }
  }

  async toolGitLog(count?: number): Promise<ToolResult> {
    try {
      const n = count && count > 0 ? Math.min(count, GIT_LOG_MAX_COUNT) : 10;
      const { stdout } = await exec(`cd '${REPO_ROOT}' && git log --oneline -${n}`, {
        timeout: 10_000,
      });
      const entries = stdout.trim().split('\n').filter(Boolean);
      return { success: true, count: entries.length, entries };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  async toolGitDiff(branch?: string): Promise<ToolResult> {
    try {
      const target = branch || 'HEAD~1';
      const { stdout } = await exec(`cd '${REPO_ROOT}' && git diff ${target} --stat`, {
        timeout: 10_000,
      });
      return { success: true, target, summary: stdout.trim() || 'no changes' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  async toolGitStatus(): Promise<ToolResult> {
    try {
      const { stdout } = await exec(`cd '${REPO_ROOT}' && git status --short`, { timeout: 10_000 });
      const files = stdout.trim().split('\n').filter(Boolean);
      return { success: true, fileCount: files.length, files };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  async toolCodeOutline(relPath: string): Promise<ToolResult> {
    try {
      const absPath = repoPath(relPath);
      const content = await fs.readFile(absPath, 'utf-8');
      const lines = content.split('\n');
      const symbols: Array<{ name: string; kind: string; line: number }> = [];

      const patterns: Array<{
        regex: RegExp;
        kind: string;
        extract: (m: RegExpMatchArray) => string;
      }> = [
        {
          regex: /^\s*export\s+(async\s+)?function\s+(\w+)/,
          kind: 'function',
          extract: (m) => m[2] ?? 'unknown',
        },
        {
          regex: /^\s*(async\s+)?function\s+(\w+)/,
          kind: 'function',
          extract: (m) => m[2] ?? 'unknown',
        },
        { regex: /^\s*export\s+class\s+(\w+)/, kind: 'class', extract: (m) => m[1] ?? 'unknown' },
        { regex: /^\s*class\s+(\w+)/, kind: 'class', extract: (m) => m[1] ?? 'unknown' },
        {
          regex: /^\s*export\s+interface\s+(\w+)/,
          kind: 'interface',
          extract: (m) => m[1] ?? 'unknown',
        },
        { regex: /^\s*export\s+type\s+(\w+)/, kind: 'type', extract: (m) => m[1] ?? 'unknown' },
        { regex: /^\s*export\s+const\s+(\w+)/, kind: 'const', extract: (m) => m[1] ?? 'unknown' },
        {
          regex: /^\s*(?:public|private|protected)?\s*(?:async\s+)?(\w+)\s*\(/,
          kind: 'method',
          extract: (m) => m[1] ?? 'unknown',
        },
        { regex: /@Injectable\(\)/, kind: 'decorator', extract: () => 'Injectable' },
        { regex: /@Controller\(/, kind: 'decorator', extract: () => 'Controller' },
        { regex: /@Module\(/, kind: 'decorator', extract: () => 'Module' },
      ];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) {
          continue;
        }
        for (const p of patterns) {
          const m = line.match(p.regex);
          if (m) {
            symbols.push({ name: p.extract(m), kind: p.kind, line: i + 1 });
            break;
          }
        }
      }

      return {
        success: true,
        file: relPath,
        totalLines: lines.length,
        symbolCount: symbols.length,
        symbols,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  async toolRunBackendTests(pattern?: string): Promise<ToolResult> {
    try {
      const testPattern = pattern || '';
      const cmd = testPattern
        ? `cd '${REPO_ROOT}/backend' && npx jest --no-coverage -t '${testPattern.replace(/'/g, "'\\''")}' --forceExit --json 2>&1`
        : `cd '${REPO_ROOT}/backend' && npx jest --no-coverage --forceExit --json 2>&1`;

      const { stdout } = await exec(cmd, { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 });
      const result = JSON.parse(stdout) as JestOutput;
      return {
        success: result.success || result.numFailedTests === 0,
        numTotalTests: result.numTotalTests,
        numPassedTests: result.numPassedTests,
        numFailedTests: result.numFailedTests,
        testResults: (result.testResults ?? []).map((r) => ({
          file: r.name.replace(REPO_ROOT + '/', ''),
          status: r.status,
        })),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: `test execution failed: ${msg.slice(0, 500)}` };
    }
  }

  async toolBuildStatus(scope?: string): Promise<ToolResult> {
    try {
      const results: Record<string, string> = {};
      const scopes = scope ? [scope] : ['backend', 'frontend', 'worker'];

      for (const s of scopes) {
        if (!['backend', 'frontend', 'worker'].includes(s)) {
          continue;
        }
        try {
          const { stdout, stderr } = await exec(`cd '${REPO_ROOT}/${s}' && npx tsc --noEmit 2>&1`, {
            timeout: 60_000,
          });
          results[s] = stderr || stdout || 'clean';
        } catch (e: unknown) {
          const errStr = e instanceof Error ? e.message : String(e);
          results[s] = errStr.slice(0, 300);
        }
      }
      return { success: true, results };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  async toolReadPrismaSchema(): Promise<ToolResult> {
    try {
      const schemaPath = path.join(REPO_ROOT, 'backend', 'prisma', 'schema.prisma');
      const content = await fs.readFile(schemaPath, 'utf-8');
      const modelMatches = [...content.matchAll(/^model\s+(\w+)\s*\{/gm)];
      const models = modelMatches.map((m) => ({
        name: m[1],
        line: content.slice(0, m.index).split('\n').length,
      }));

      const enumMatches = [...content.matchAll(/^enum\s+(\w+)\s*\{/gm)];
      const enums = enumMatches.map((m) => ({
        name: m[1],
        line: content.slice(0, m.index).split('\n').length,
      }));

      return {
        success: true,
        modelCount: models.length,
        enumCount: enums.length,
        models,
        enums,
        totalLines: content.split('\n').length,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }
}
