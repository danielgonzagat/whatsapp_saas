import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { REPO_ROOT } from '../kloel-code-analysis.service';

// ── Types ──

export interface LspDiagnostic {
  file: string;
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'info';
  ruleId: string;
  message: string;
}

export interface OpenApiRouteInfo {
  route: string;
  method: string;
  controller: string;
  handler: string;
  tags: string[];
}

export interface AsyncApiEventInfo {
  name: string;
  domain: string;
  summary: string;
}

export interface StaticAnalysisIssue {
  file: string;
  ruleId: string;
  severity: 'error' | 'warning' | 'info';
  line: number;
  column: number;
  message: string;
}

// ── SARIF types (subset) ──

interface SarifRegion {
  startLine: number;
  startColumn: number;
}

interface SarifPhysicalLocation {
  artifactLocation: { uri: string; uriBaseId?: string };
  region: SarifRegion;
}

interface SarifResult {
  ruleId: string;
  level: string;
  message: { text: string };
  locations: Array<{ physicalLocation: SarifPhysicalLocation }>;
}

interface SarifRun {
  results: SarifResult[];
}

interface SarifDoc {
  runs: SarifRun[];
}

// ── OpenAPI types (subset) ──

interface OpenApiOperation {
  operationId: string;
  summary: string;
  tags: string[];
  'x-controller-file': string;
  'x-method-name': string;
}

interface OpenApiDoc {
  paths: Record<string, Record<string, OpenApiOperation>>;
}

// ── AsyncAPI types (subset) ──

interface AsyncApiChannel {
  description: string;
  parameters: { domain: string };
  publish: { summary: string };
}

interface AsyncApiDoc {
  channels: Record<string, AsyncApiChannel>;
}

// ── Cache ──

interface CacheEntry<T> {
  data: T;
  ts: number;
}

const CACHE_TTL_MS = 60_000;

@Injectable()
export class CognitiveBridgeService {
  private openApiCache: CacheEntry<OpenApiDoc> | null = null;
  private asyncApiCache: CacheEntry<AsyncApiDoc> | null = null;
  private sarifCache: Map<string, CacheEntry<Map<string, StaticAnalysisIssue[]>>> = new Map();

  // ── Public API ──

  async getLspDiagnostics(file: string): Promise<LspDiagnostic[]> {
    const issues = await this.getSarifIssues(file);
    return issues.map((i) => ({
      file: i.file,
      line: i.line,
      column: i.column,
      severity: i.severity,
      ruleId: i.ruleId,
      message: i.message,
    }));
  }

  async getOpenApiRoute(pathOrController: string): Promise<OpenApiRouteInfo[]> {
    const doc = await this.loadOpenApi();
    const q = pathOrController.toLowerCase();
    const results: OpenApiRouteInfo[] = [];

    for (const [route, methods] of Object.entries(doc.paths)) {
      for (const [method, op] of Object.entries(methods)) {
        const opTyped = op as OpenApiOperation;
        if (!opTyped || !opTyped['x-controller-file']) continue;
        const controllerFile = opTyped['x-controller-file'];
        const controllerBase = path.basename(controllerFile, '.ts').toLowerCase();
        const routeLower = route.toLowerCase();

        if (
          routeLower.includes(q) ||
          controllerBase.includes(q) ||
          controllerFile.toLowerCase().includes(q)
        ) {
          results.push({
            route,
            method: method.toUpperCase(),
            controller: controllerFile,
            handler: opTyped['x-method-name'] ?? '',
            tags: opTyped.tags ?? [],
          });
        }
      }
    }

    return results;
  }

  async getAsyncApiEvents(domain: string): Promise<AsyncApiEventInfo[]> {
    const doc = await this.loadAsyncApi();
    const q = domain.toLowerCase();
    const results: AsyncApiEventInfo[] = [];

    for (const [channelName, channel] of Object.entries(doc.channels)) {
      if (channel.parameters?.domain?.toLowerCase() === q) {
        results.push({
          name: channelName,
          domain: channel.parameters.domain,
          summary: channel.publish?.summary ?? channelName,
        });
      }
    }

    return results;
  }

  async getStaticAnalysisIssues(file: string): Promise<StaticAnalysisIssue[]> {
    return this.getSarifIssues(file);
  }

  // ── Private: SARIF ──

  private async getSarifIssues(file: string): Promise<StaticAnalysisIssue[]> {
    const manifest = await this.loadSarifManifest();
    const allIssues: StaticAnalysisIssue[] = [];
    const workspaceFromPath = this.inferWorkspace(file);

    for (const ws of manifest) {
      if (workspaceFromPath && ws.workspace !== workspaceFromPath) continue;
      if (ws.findings === 0) continue;

      const index = await this.loadSarifIndex(ws);
      const matches = index.get(file) ?? this.suffixMatch(index, file);

      if (matches) {
        for (const issue of matches) {
          allIssues.push(issue);
        }
      }
    }

    return allIssues;
  }

  private inferWorkspace(file: string): string | null {
    const lower = file.toLowerCase().replace(/\\/g, '/');
    if (lower.startsWith('backend/')) return 'backend';
    if (lower.startsWith('frontend-admin/')) return 'frontend-admin';
    if (lower.startsWith('frontend/')) return 'frontend';
    if (lower.startsWith('worker/')) return 'worker';
    return null;
  }

  private suffixMatch(
    index: Map<string, StaticAnalysisIssue[]>,
    file: string,
  ): StaticAnalysisIssue[] | null {
    const normalized = file.replace(/\\/g, '/');
    for (const [key, issues] of index) {
      if (key.endsWith('/' + normalized) || normalized.endsWith('/' + key)) {
        return issues;
      }
    }
    return null;
  }

  private async loadSarifManifest(): Promise<
    Array<{ workspace: string; file: string; findings: number }>
  > {
    const manifestPath = path.join(REPO_ROOT, 'tools', 'sarif', 'manifest.json');
    const raw = await fs.readFile(manifestPath, 'utf-8');
    const parsed = JSON.parse(raw) as {
      workspaces: Array<{ workspace: string; file: string; findings: number }>;
    };
    return parsed.workspaces;
  }

  private async loadSarifIndex(
    ws: { workspace: string; file: string },
  ): Promise<Map<string, StaticAnalysisIssue[]>> {
    const cached = this.sarifCache.get(ws.workspace);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return cached.data;
    }

    const sarifPath = path.join(REPO_ROOT, ws.file);
    const raw = await fs.readFile(sarifPath, 'utf-8');
    const doc = JSON.parse(raw) as SarifDoc;

    const index = new Map<string, StaticAnalysisIssue[]>();
    for (const run of doc.runs) {
      for (const result of run.results) {
        for (const loc of result.locations) {
          const uri = loc.physicalLocation.artifactLocation.uri;
          const normalizedUri = this.normalizeSarifUri(uri);

          const issue: StaticAnalysisIssue = {
            file: normalizedUri,
            ruleId: result.ruleId,
            severity: this.mapSarifLevel(result.level),
            line: loc.physicalLocation.region.startLine,
            column: loc.physicalLocation.region.startColumn,
            message: result.message.text,
          };

          const existing = index.get(normalizedUri);
          if (existing) {
            existing.push(issue);
          } else {
            index.set(normalizedUri, [issue]);
          }
        }
      }
    }

    this.sarifCache.set(ws.workspace, { data: index, ts: Date.now() });
    return index;
  }

  private normalizeSarifUri(uri: string): string {
    return uri.replace(/\\/g, '/');
  }

  private mapSarifLevel(level: string): 'error' | 'warning' | 'info' {
    switch (level) {
      case 'error':
        return 'error';
      case 'warning':
        return 'warning';
      default:
        return 'info';
    }
  }

  // ── Private: OpenAPI ──

  private async loadOpenApi(): Promise<OpenApiDoc> {
    if (this.openApiCache && Date.now() - this.openApiCache.ts < CACHE_TTL_MS) {
      return this.openApiCache.data;
    }

    const specPath = path.join(REPO_ROOT, 'tools', 'openapi', 'openapi-spec.json');
    const raw = await fs.readFile(specPath, 'utf-8');
    const doc = JSON.parse(raw) as OpenApiDoc;

    this.openApiCache = { data: doc, ts: Date.now() };
    return doc;
  }

  // ── Private: AsyncAPI ──

  private async loadAsyncApi(): Promise<AsyncApiDoc> {
    if (this.asyncApiCache && Date.now() - this.asyncApiCache.ts < CACHE_TTL_MS) {
      return this.asyncApiCache.data;
    }

    const specPath = path.join(REPO_ROOT, 'tools', 'asyncapi', 'asyncapi-spec.json');
    const raw = await fs.readFile(specPath, 'utf-8');
    const doc = JSON.parse(raw) as AsyncApiDoc;

    this.asyncApiCache = { data: doc, ts: Date.now() };
    return doc;
  }
}
