import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';

const REPO_ROOT = path.resolve(process.cwd(), '..');

interface CacheEntry<T> {
  data: T | null;
  ts: number;
}

interface PulseHealthJson {
  score: number;
  totalNodes: number;
  breaks: Array<{
    type: string;
    severity: string;
    file: string;
    line: number;
    description: string;
    detail: string;
    source?: string;
    surface?: string;
  }>;
  stats: Record<string, unknown>;
  timestamp: string;
}

interface BehaviorGraphJson {
  generatedAt: string;
  summary: Record<string, unknown>;
  nodes: Array<{
    id: string;
    kind: string;
    name: string;
    filePath: string;
    line: number;
    executionMode: 'ai_safe' | 'human_required' | 'observation_only';
    risk: string;
    isAsync: boolean;
    hasErrorHandler: boolean;
    hasLogging: boolean;
    calledBy: string[];
    calls: string[];
  }>;
}

interface RuntimeErrorEntry {
  culprit: string;
  symbol: string;
  count: number;
  lastSeen: string;
  file?: string;
}

interface RuntimeErrorsJson {
  generatedAt?: string;
  errors: RuntimeErrorEntry[];
}

export interface PulseHealthResult {
  success: boolean;
  available: boolean;
  hint?: string;
  score?: number;
  totalNodes?: number;
  moduleName?: string;
  breaks?: PulseHealthJson['breaks'];
  breakCount?: number;
  stats?: Record<string, unknown>;
  timestamp?: string;
  [key: string]: unknown;
}

export interface BehaviorGraphNodeResult {
  success: boolean;
  available: boolean;
  hint?: string;
  found?: boolean;
  query?: string;
  node?: {
    id: string;
    name: string;
    kind: string;
    filePath: string;
    line: number;
    executionMode: string;
    ai_safe: boolean;
    risk: string;
    isAsync: boolean;
    hasErrorHandler: boolean;
    hasLogging: boolean;
    calledBy: string[];
    calls: string[];
  };
  [key: string]: unknown;
}

export interface RuntimeErrorsResult {
  success: boolean;
  available: boolean;
  hint?: string;
  errors?: RuntimeErrorEntry[];
  total?: number;
  [key: string]: unknown;
}

/**
 * PulseRuntimeService \u2014 reads PULSE and runtime-awareness artifacts from disk
 * with a 60-second per-artifact TTL cache. Every method returns
 * \u0060{ success: true, available: false, hint: "..." }\u0060 when the backing file
 * is missing \u2014 it never throws.
 */
@Injectable()
export class PulseRuntimeService {
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private readonly TTL_MS = 60_000;

  private async readCached<T>(key: string, filePath: string): Promise<T | null> {
    const cached = this.cache.get(key);
    if (cached !== undefined && Date.now() - cached.ts < this.TTL_MS) {
      return cached.data as T | null;
    }
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(raw) as T;
      this.cache.set(key, { data, ts: Date.now() });
      return data;
    } catch {
      this.cache.set(key, { data: null, ts: Date.now() });
      return null;
    }
  }

  async pulseHealth(moduleName?: string): Promise<PulseHealthResult> {
    const filePath = path.join(REPO_ROOT, 'PULSE_HEALTH.json');
    const health = await this.readCached<PulseHealthJson>('pulse_health', filePath);

    if (!health) {
      return {
        success: true,
        available: false,
        hint: 'PULSE_HEALTH.json not found at repo root. Run a PULSE scan to generate it.',
      };
    }

    if (moduleName) {
      const lower = moduleName.toLowerCase();
      const filtered =
        health.breaks?.filter(
          (b) =>
            b.file.toLowerCase().includes(lower) ||
            (b.surface ?? '').toLowerCase().includes(lower),
        ) ?? [];

      return {
        success: true,
        available: true,
        score: health.score,
        totalNodes: health.totalNodes,
        moduleName,
        breaks: filtered,
        breakCount: filtered.length,
        stats: health.stats,
        timestamp: health.timestamp,
      };
    }

    return {
      success: true,
      available: true,
      score: health.score,
      totalNodes: health.totalNodes,
      breaks: health.breaks,
      stats: health.stats,
      timestamp: health.timestamp,
    };
  }

  async behaviorGraphNode(symbol: string, file?: string): Promise<BehaviorGraphNodeResult> {
    const candidates = [
      path.join(REPO_ROOT, 'PULSE_BEHAVIOR_GRAPH.json'),
      path.join(REPO_ROOT, 'scripts', 'pulse', 'artifacts', 'PULSE_BEHAVIOR_GRAPH.json'),
    ];

    let graph: BehaviorGraphJson | null = null;
    for (const fp of candidates) {
      graph = await this.readCached<BehaviorGraphJson>('behavior_graph', fp);
      if (graph) break;
    }

    if (!graph || !graph.nodes) {
      return {
        success: true,
        available: false,
        hint: 'PULSE_BEHAVIOR_GRAPH.json not found. Run a PULSE behavior analysis to generate it.',
      };
    }

    const query = symbol.toLowerCase();
    const fileLower = file?.toLowerCase();

    const node = graph.nodes.find(
      (n) =>
        n.name.toLowerCase() === query ||
        n.id.toLowerCase() === query ||
        n.filePath.toLowerCase().includes(query) ||
        (fileLower !== undefined && n.filePath.toLowerCase().includes(fileLower)),
    );

    if (!node) {
      return {
        success: true,
        available: true,
        found: false,
        query: symbol,
        hint: `No behavior node matches "${symbol}" in the graph (${graph.nodes.length} total nodes).`,
      };
    }

    return {
      success: true,
      available: true,
      found: true,
      query: symbol,
      node: {
        id: node.id,
        name: node.name,
        kind: node.kind,
        filePath: node.filePath,
        line: node.line,
        executionMode: node.executionMode,
        ai_safe: node.executionMode === 'ai_safe',
        risk: node.risk,
        isAsync: node.isAsync,
        hasErrorHandler: node.hasErrorHandler,
        hasLogging: node.hasLogging,
        calledBy: node.calledBy,
        calls: node.calls,
      },
    };
  }

  async runtimeErrors(): Promise<RuntimeErrorsResult> {
    const graphifyPath = path.join(REPO_ROOT, 'tools', 'graphify-plus', 'runtime-errors.json');
    let json = await this.readCached<RuntimeErrorsJson>('runtime_errors_json', graphifyPath);
    if (json?.errors?.length) {
      return this.top10(json.errors);
    }

    const mdPath = path.join(REPO_ROOT, 'SESSION_STATE.md');
    try {
      const md = await fs.readFile(mdPath, 'utf-8');
      const parsed = this.parseSessionStateErrors(md);
      if (parsed.length > 0) {
        this.cache.set('runtime_errors_md', { data: { errors: parsed }, ts: Date.now() });
        return this.top10(parsed);
      }
    } catch {
      // file missing \u2014 expected
    }

    const artifactsDir = path.join(REPO_ROOT, 'scripts', 'pulse', 'artifacts');
    try {
      const entries = await fs.readdir(artifactsDir);
      const candidates = entries
        .filter((e) => e.startsWith('runtime-errors-') && e.endsWith('.json'))
        .sort()
        .reverse();

      for (const fname of candidates) {
        const fp = path.join(artifactsDir, fname);
        json = await this.readCached<RuntimeErrorsJson>(`re_${fname}`, fp);
        if (json?.errors?.length) {
          return this.top10(json.errors);
        }
      }
    } catch {
      // dir missing \u2014 expected
    }

    return {
      success: true,
      available: false,
      hint: 'No runtime error artifacts found (checked graphify-plus/runtime-errors.json, SESSION_STATE.md, scripts/pulse/artifacts/runtime-errors-*.json).',
    };
  }

  private top10(errors: RuntimeErrorEntry[]): RuntimeErrorsResult {
    const top = errors.slice(0, 10);
    return {
      success: true,
      available: true,
      errors: top,
      total: top.length,
    };
  }

  private parseSessionStateErrors(md: string): RuntimeErrorEntry[] {
    const errors: RuntimeErrorEntry[] = [];

    const sectionStart = md.search(/^#{2,3}\s+(?:Runtime\s+)?Errors?\s*$/im);
    if (sectionStart === -1) return errors;

    const section = md.slice(sectionStart);
    const nextSection = section.slice(1).search(/^#{2,3}\s/m);
    const body = nextSection === -1 ? section : section.slice(0, nextSection + 1);

    const rowRe = /^\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(\d+)\s*\|\s*(.+?)\s*\|/gm;
    let match: RegExpExecArray | null;
    while ((match = rowRe.exec(body)) !== null) {
      const [, file, symbol, countStr, lastSeen] = match;
      if (/^[-:]+$/.test(file?.trim() ?? '')) continue;
      if (file?.toLowerCase().includes('file')) continue;
      const trimmedFile = file?.trim();
      errors.push({
        culprit: trimmedFile ?? 'unknown',
        symbol: symbol?.trim() ?? 'unknown',
        count: parseInt(countStr ?? '0', 10),
        lastSeen: lastSeen?.trim() ?? 'unknown',
        ...(trimmedFile ? { file: trimmedFile } : {}),
      });
    }

    return errors;
  }
}
