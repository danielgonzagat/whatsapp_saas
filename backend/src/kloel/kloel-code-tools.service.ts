import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec as cpExec } from 'child_process';
import { promisify } from 'util';
import { REPO_ROOT, repoPath } from './kloel-code-analysis.service';
import { CognitiveBridgeService } from './self-awareness/cognitive-bridge.service';
import {
  MAX_FILE_BYTES,
  buildDirEntries,
  buildJestCommand,
  buildSearchCommand,
  buildSliceContent,
  clampGitLogCount,
  extractErrorMessage,
  extractExecOutput,
  extractOutlineSymbols,
  fileTooLargeMessage,
  isCodeGraphTimeoutError,
  isFileNotFoundError,
  isRgNoMatchError,
  mapJestTestResults,
  parsePrismaSchema,
  parseRgResults,
  resolveBuildScopes,
  sanitizeCodeGraphQuery,
} from './kloel-code-tools.service.helpers';

const exec = promisify(cpExec);

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

  constructor(private readonly cognitiveBridge: CognitiveBridgeService) {}

  // ── COGNITIVE BRIDGE (Wave 7 PI-CC) ──

  async toolLspDiagnostics(file: string): Promise<ToolResult> {
    try {
      const diagnostics = await this.cognitiveBridge.getLspDiagnostics(file);
      return { success: true, file, total: diagnostics.length, diagnostics };
    } catch (err: unknown) {
      return { success: false, error: extractErrorMessage(err) };
    }
  }

  async toolOpenApiRoute(pathOrController: string): Promise<ToolResult> {
    try {
      const routes = await this.cognitiveBridge.getOpenApiRoute(pathOrController);
      return { success: true, query: pathOrController, total: routes.length, routes };
    } catch (err: unknown) {
      return { success: false, error: extractErrorMessage(err) };
    }
  }

  async toolAsyncApiEvents(domain: string): Promise<ToolResult> {
    try {
      const events = await this.cognitiveBridge.getAsyncApiEvents(domain);
      return { success: true, domain, total: events.length, events };
    } catch (err: unknown) {
      return { success: false, error: extractErrorMessage(err) };
    }
  }

  async toolStaticAnalysis(file: string): Promise<ToolResult> {
    try {
      const issues = await this.cognitiveBridge.getStaticAnalysisIssues(file);
      return { success: true, file, total: issues.length, issues };
    } catch (err: unknown) {
      return { success: false, error: extractErrorMessage(err) };
    }
  }

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
          error: fileTooLargeMessage(stat.size),
        };
      }
      const raw = await fs.readFile(absPath, 'utf-8');
      const { content, totalLines } = buildSliceContent(raw, startLine, endLine);
      return {
        success: true,
        file: relPath,
        totalLines,
        content,
      };
    } catch (err: unknown) {
      const msg = extractErrorMessage(err);
      if (isFileNotFoundError(msg)) {
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
      const sorted = buildDirEntries(entries);
      return { success: true, path: relDir || '.', entries: sorted, total: sorted.length };
    } catch (err: unknown) {
      return { success: false, error: extractErrorMessage(err) };
    }
  }

  async toolSearchCodebase(pattern: string, glob?: string): Promise<ToolResult> {
    try {
      const cmd = buildSearchCommand(pattern, glob, REPO_ROOT);
      const { stdout, stderr } = await exec(cmd, { timeout: 15_000, maxBuffer: 1024 * 1024 });
      if (stderr && !stdout) {
        return { success: false, error: stderr.trim() };
      }
      const results = parseRgResults(stdout);
      return {
        success: true,
        pattern,
        glob: glob || null,
        matchCount: results.length,
        results,
      };
    } catch (err: unknown) {
      const msg = extractErrorMessage(err);
      const { stdout, stderr } = extractExecOutput(err);
      // rg exits with code 1 when no matches found — not an error
      if (isRgNoMatchError(msg) && (stdout || stderr)) {
        const results = parseRgResults(stdout || '');
        if (results.length > 0) {
          return {
            success: true,
            pattern,
            matchCount: results.length,
            results,
          };
        }
        return { success: true, pattern, matchCount: 0, results: [] };
      }
      return { success: false, error: msg };
    }
  }

  async toolGitLog(count?: number): Promise<ToolResult> {
    try {
      const n = clampGitLogCount(count);
      const { stdout } = await exec(`cd '${REPO_ROOT}' && git log --oneline -${n}`, {
        timeout: 10_000,
      });
      const entries = stdout.trim().split('\n').filter(Boolean);
      return { success: true, count: entries.length, entries };
    } catch (err: unknown) {
      return { success: false, error: extractErrorMessage(err) };
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
      return { success: false, error: extractErrorMessage(err) };
    }
  }

  async toolGitStatus(): Promise<ToolResult> {
    try {
      const { stdout } = await exec(`cd '${REPO_ROOT}' && git status --short`, { timeout: 10_000 });
      const files = stdout.trim().split('\n').filter(Boolean);
      return { success: true, fileCount: files.length, files };
    } catch (err: unknown) {
      return { success: false, error: extractErrorMessage(err) };
    }
  }

  async toolCodeOutline(relPath: string): Promise<ToolResult> {
    try {
      let absPath = repoPath(relPath);
      // Fallback: if file doesn't exist at resolved path, search for it via rg
      try {
        await fs.access(absPath);
      } catch {
        const fname = path.basename(relPath);
        const { stdout } = await exec(
          `rg --files '${REPO_ROOT}' 2>/dev/null | grep "/${fname}$" | head -1`,
          { timeout: 8000, maxBuffer: 1024 * 1024 },
        );
        const found = stdout.trim();
        if (found) {
          absPath = found;
        }
      }
      const content = await fs.readFile(absPath, 'utf-8');
      const { symbols, totalLines } = extractOutlineSymbols(content);
      return {
        success: true,
        file: relPath,
        totalLines,
        symbolCount: symbols.length,
        symbols,
      };
    } catch (err: unknown) {
      return { success: false, error: extractErrorMessage(err) };
    }
  }

  async toolRunBackendTests(pattern?: string): Promise<ToolResult> {
    try {
      const cmd = buildJestCommand(REPO_ROOT, pattern);
      const { stdout } = await exec(cmd, { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 });
      const result = JSON.parse(stdout) as JestOutput;
      return {
        success: result.success || result.numFailedTests === 0,
        numTotalTests: result.numTotalTests,
        numPassedTests: result.numPassedTests,
        numFailedTests: result.numFailedTests,
        testResults: mapJestTestResults(result.testResults, REPO_ROOT),
      };
    } catch (err: unknown) {
      const msg = extractErrorMessage(err);
      return { success: false, error: `test execution failed: ${msg.slice(0, 500)}` };
    }
  }

  async toolBuildStatus(scope?: string): Promise<ToolResult> {
    try {
      const results: Record<string, string> = {};
      const scopes = resolveBuildScopes(scope);

      for (const s of scopes) {
        try {
          const { stdout, stderr } = await exec(`cd '${REPO_ROOT}/${s}' && npx tsc --noEmit 2>&1`, {
            timeout: 60_000,
          });
          results[s] = stderr || stdout || 'clean';
        } catch (e: unknown) {
          results[s] = extractErrorMessage(e).slice(0, 300);
        }
      }
      return { success: true, results };
    } catch (err: unknown) {
      return { success: false, error: extractErrorMessage(err) };
    }
  }

  // ── CODEGRAPH (Meta 1 — knowledge-graph code intelligence via MCP) ──  // ── CODEGRAPH (Meta 1 — knowledge-graph code intelligence real bridge) ──

  private async runCodeGraph(args: string, timeoutMs = 15_000): Promise<string> {
    try {
      const cmd = `cd '${REPO_ROOT}' && /opt/homebrew/bin/codegraph ${args} 2>&1`;
      const { stdout, stderr } = await exec(cmd, { timeout: timeoutMs, maxBuffer: 500_000 });
      return (stdout + stderr).trim().slice(0, 8000);
    } catch (e: unknown) {
      const errStr = extractErrorMessage(e);
      return isCodeGraphTimeoutError(errStr)
        ? 'CodeGraph timeout. Tente uma query mais especifica.'
        : `CodeGraph error: ${errStr.slice(0, 500)}`;
    }
  }

  async toolCodeGraphStatus(): Promise<ToolResult> {
    const output = await this.runCodeGraph('status');
    return { success: true, text: output };
  }

  async toolCodeGraphSearch(query: string): Promise<ToolResult> {
    const q = sanitizeCodeGraphQuery(query) || 'overview';
    const output = await this.runCodeGraph(`query "${q}"`);
    return { success: true, text: output };
  }

  async toolCodeGraphContext(task: string): Promise<ToolResult> {
    const t = sanitizeCodeGraphQuery(task) || 'overview';
    const output = await this.runCodeGraph(`context "${t}"`, 30_000);
    return { success: true, text: output };
  }

  async toolCodeGraphCallers(symbol: string): Promise<ToolResult> {
    const s = sanitizeCodeGraphQuery(symbol);
    if (!s) {
      return { success: true, text: 'Informe o simbolo para buscar callers.' };
    }
    // Use query to search for symbol; MCP callers not available via CLI
    const output = await this.runCodeGraph(`query "callers of ${s}"`);
    return { success: true, text: `Callers de "${s}" (via query):\n${output}` };
  }

  async toolCodeGraphCallees(symbol: string): Promise<ToolResult> {
    const s = sanitizeCodeGraphQuery(symbol);
    if (!s) {
      return { success: true, text: 'Informe o simbolo para buscar callees.' };
    }
    const output = await this.runCodeGraph(`query "callees of ${s}"`);
    return { success: true, text: `Callees de "${s}" (via query):\n${output}` };
  }

  async toolCodeGraphImpact(symbol: string): Promise<ToolResult> {
    const s = sanitizeCodeGraphQuery(symbol);
    if (!s) {
      return { success: true, text: 'Informe o simbolo para analisar impacto.' };
    }
    const output = await this.runCodeGraph(`query "impact of changing ${s}"`);
    return { success: true, text: `Impacto de "${s}" (via query):\n${output}` };
  }

  async toolCodeGraphNode(symbol: string): Promise<ToolResult> {
    const s = sanitizeCodeGraphQuery(symbol);
    if (!s) {
      return { success: true, text: 'Informe o simbolo para detalhes.' };
    }
    const output = await this.runCodeGraph(`query "${s}"`);
    return { success: true, text: `Detalhes de "${s}" (via query):\n${output}` };
  }

  async toolCodeGraphFiles(): Promise<ToolResult> {
    const output = await this.runCodeGraph('files');
    return { success: true, text: output };
  }

  async toolReadPrismaSchema(): Promise<ToolResult> {
    try {
      const schemaPath = path.join(REPO_ROOT, 'backend', 'prisma', 'schema.prisma');
      const content = await fs.readFile(schemaPath, 'utf-8');
      const parsed = parsePrismaSchema(content);
      return {
        success: true,
        modelCount: parsed.models.length,
        enumCount: parsed.enums.length,
        models: parsed.models,
        enums: parsed.enums,
        totalLines: parsed.totalLines,
      };
    } catch (err: unknown) {
      return { success: false, error: extractErrorMessage(err) };
    }
  }
}
