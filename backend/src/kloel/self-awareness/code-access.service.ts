import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';export interface FileEntry {
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
}

export interface CodeHit {
  file: string;
  line: number;
  column: number;
  content: string;
  match: string;
}

const REPO_ROOT = process.env.KLOEL_REPO_ROOT || path.resolve(process.cwd(), '..');
const MAX_FILE_SIZE_BYTES = 500_000;
const MAX_SEARCH_RESULTS = 50;
const MAX_LINES_READ = 200;/**
 * CodeAccessService — read-only self-awareness of Kloel's own source code.
 *
 * Allows the Kloel chat to read, search, and traverse its own codebase
 * in real time, enabling self-introspection and capability verification.
 *
 * ALL operations are read-only. No write access is ever granted.
 */
@Injectable()
export class CodeAccessService {
  private readonly logger = new Logger(CodeAccessService.name);
  private readonly root: string;

  constructor() {
    this.root = this.resolveRepoRoot(REPO_ROOT);
    this.logger.log(`CodeAccessService initialized. Root: ${this.root}`);
  }  private resolveRepoRoot(hint: string): string {
    // Walk up to find the monorepo root (contains backend/, frontend/, worker/)
    let current = path.resolve(hint);
    for (let i = 0; i < 5; i++) {
      const backend = path.join(current, 'backend');
      const frontend = path.join(current, 'frontend');
      if (fs.existsSync(backend) && fs.existsSync(frontend)) {
        return current;
      }
      const parent = path.dirname(current);
      if (parent === current) {break;}
      current = parent;
    }
    return path.resolve(hint);
  }  /** List files in a directory relative to repo root */
  list(dirPath: string): FileEntry[] {
    const target = path.resolve(this.root, dirPath.replace(/^\.?\//, ''));
    if (!target.startsWith(this.root)) {return [];}
    if (!fs.existsSync(target)) {return [];}

    try {
      const entries = fs.readdirSync(target, { withFileTypes: true });
      return entries
        .filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'dist')
        .map((e) => ({
          name: e.name,
          path: path.relative(this.root, path.join(target, e.name)),
          size: e.isFile() ? fs.statSync(path.join(target, e.name)).size : 0,
          isDirectory: e.isDirectory(),
        }));
    } catch {
      return [];
    }
  }  /** Read a file's contents with optional line range */
  read(
    filePath: string,
    startLine?: number,
    endLine?: number,
  ): { ok: boolean; content?: string; error?: string; totalLines?: number } {
    const target = path.resolve(this.root, filePath);
    if (!target.startsWith(this.root)) {
      return { ok: false, error: 'path_outside_repo' };
    }
    if (!fs.existsSync(target)) {
      return { ok: false, error: 'file_not_found' };
    }
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      return { ok: false, error: 'is_directory' };
    }
    if (stat.size > MAX_FILE_SIZE_BYTES) {
      return { ok: false, error: 'file_too_large' };
    }

    try {
      const content = fs.readFileSync(target, 'utf-8');
      const lines = content.split('\n');

      if (startLine !== undefined) {
        const s = Math.max(1, startLine);
        const e = endLine !== undefined ? Math.min(lines.length, endLine) : Math.min(lines.length, s + MAX_LINES_READ - 1);
        return {
          ok: true,
          content: lines.slice(s - 1, e).join('\n'),
          totalLines: lines.length,
        };
      }

      return { ok: true, content, totalLines: lines.length };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'read_failed' };
    }
  }  /** Search code using ripgrep */
  search(
    query: string,
    opts?: { glob?: string; max?: number },
  ): CodeHit[] {
    const max = Math.min(opts?.max ?? MAX_SEARCH_RESULTS, MAX_SEARCH_RESULTS);
    const globFlag = opts?.glob ? `--glob '${opts.glob}'` : '';
    const cmd = `rg --no-heading --line-number --column --max-count ${max} ${globFlag} '${query.replace(/'/g, "\\'")}' ${this.root}`;

    try {
      const stdout = execSync(cmd, {
        cwd: this.root,
        timeout: 5000,
        maxBuffer: 1024 * 500,
        encoding: 'utf-8',
      });
      return this.parseRgOutput(stdout, max);
    } catch (err: unknown) {
      // rg exits with code 1 when no matches (which is fine)
      if (err instanceof Error && 'status' in err && (err as any).status === 1) {
        return [];
      }
      this.logger.warn(`Search failed: ${err instanceof Error ? err.message : 'unknown'}`);
      return [];
    }
  }  /** Parse ripgrep output into CodeHit[] */
  private parseRgOutput(stdout: string, max: number): CodeHit[] {
    const hits: CodeHit[] = [];
    const lines = stdout.trim().split('\n');
    for (const line of lines) {
      if (hits.length >= max) {break;}
      const match = line.match(/^([^:]+):(\d+):(\d+):(.*)$/);
      if (match) {
        const [, file = '', lineStr = '0', colStr = '0', content = ''] = match;
        hits.push({
          file: file.replace(this.root + '/', '').replace(this.root, ''),
          line: parseInt(lineStr, 10),
          column: parseInt(colStr, 10),
          content: content.trim(),
          match: content.trim(),
        });
      }
    }
    return hits;
  }  /** Find usages of a symbol across the codebase */
  findUsages(symbol: string): CodeHit[] {
    // Use ripgrep with word boundaries for symbol search
    return this.search(`\\b${symbol}\\b`, {
      glob: '*.{ts,tsx,js,jsx}',
      max: MAX_SEARCH_RESULTS,
    });
  }  /** Map a capability ID to its domain service implementation */
  whichServiceImplements(capabilityId: string): CodeHit[] {
    // Search for the capability ID or domainService reference
    const hits = this.search(capabilityId, { glob: '*.ts', max: 10 });
    if (hits.length === 0) {
      // Try searching for the domain service name from the registry
      return this.search(`domainService.*${capabilityId}`, { glob: '*.ts', max: 10 });
    }
    return hits;
  }
}
