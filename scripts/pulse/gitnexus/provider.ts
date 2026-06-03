/**
 * GitNexusCodeGraphProvider — implements CodeGraphProvider via npx gitnexus.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import type {
  CodeGraphProvider,
  CodeGraphStatusInput,
  CodeGraphStatus,
  CodeGraphAnalyzeInput,
  CodeGraphAnalyzeResult,
  GitNexusImpactInput,
  GitNexusImpactReport,
  GitNexusRepoStatus,
  GitNexusIndexState,
  CodeGraphEvidenceInput,
  CodeGraphEvidence,
} from './types';
import { runGitNexus } from './command';

export class GitNexusCodeGraphProvider implements CodeGraphProvider {
  getName(): string {
    return 'gitnexus';
  }

  async isAvailable(): Promise<boolean> {
    const result = await runGitNexus(['--version']);
    return result.exitCode === 0 && result.stdout.includes('gitnexus');
  }

  async getStatus(input: CodeGraphStatusInput): Promise<CodeGraphStatus> {
    const { repoRoot } = input;
    const indexPath = path.join(repoRoot, '.gitnexus');
    const indexExists = fs.existsSync(indexPath);
    const registryPath = path.join(process.env.HOME ?? '~', '.gitnexus', 'registry.json');
    const registryDetected = fs.existsSync(registryPath);

    const warnings: string[] = [];
    const errors: string[] = [];

    let currentCommit: string | null = null;
    try {
      const { execFileSync } = await import('node:child_process');
      currentCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: repoRoot,
        encoding: 'utf8',
      }).trim();
    } catch {
      warnings.push('Could not resolve current commit.');
    }

    let available = false;
    let availability: GitNexusRepoStatus['availability'] = 'unknown';
    let indexState: GitNexusIndexState = 'missing';
    let lastIndexedCommit: string | null = null;
    let lastIndexedAt: string | null = null;

    try {
      const result = await runGitNexus(['status'], repoRoot, 120_000);
      available = result.exitCode === 0;
      availability = available ? 'available' : 'failed';

      if (!available) {
        errors.push(result.stderr.slice(0, 200));
      }

      if (indexExists) {
        const statusFile = path.join(indexPath, 'status.json');
        const metaFile = path.join(indexPath, 'meta.json');
        const indexStateFile = fs.existsSync(statusFile) ? statusFile : metaFile;
        if (fs.existsSync(indexStateFile)) {
          try {
            const raw = JSON.parse(fs.readFileSync(indexStateFile, 'utf8'));
            lastIndexedCommit = raw.commit ?? raw.lastCommit ?? null;
            lastIndexedAt = raw.indexedAt ?? raw.lastIndexedAt ?? null;
          } catch {
            /* ignore parse errors */
          }
        }

        if (lastIndexedCommit && currentCommit) {
          indexState = lastIndexedCommit === currentCommit ? 'fresh' : 'stale';
        } else {
          indexState = 'unknown';
        }
      } else {
        indexState = 'missing';
        warnings.push(
          '.gitnexus/ index directory not found. Run pulse:gitnexus:index to create it.',
        );
      }
    } catch (err) {
      availability = 'failed';
      errors.push(String(err).slice(0, 200));
    }

    return {
      provider: 'gitnexus',
      available,
      availability,
      repoRoot,
      currentCommit,
      indexPath,
      indexExists,
      indexState,
      registryDetected,
      lastIndexedCommit,
      lastIndexedAt,
      warnings,
      errors,
    };
  }

  async analyzeRepo(input: CodeGraphAnalyzeInput): Promise<CodeGraphAnalyzeResult> {
    const args: string[] = ['analyze', input.repoRoot, '--skip-agents-md'];
    if (input.force) args.push('--force');
    // Skills generate .claude/skills/generated/ — opt-in, not default
    const result = await runGitNexus(args, input.repoRoot, 600_000);
    return { indexed: result.exitCode === 0, commandResult: result };
  }

  async getImpact(input: GitNexusImpactInput): Promise<GitNexusImpactReport> {
    const status = await this.getStatus({ repoRoot: input.repoRoot });
    const impactedSymbols: string[] = [];
    const impactedFiles: string[] = [];
    const impactedCapabilities: string[] = [];
    const impactedFlows: string[] = [];
    const evidence: string[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];

    if (!status.available || !status.indexExists) {
      warnings.push('GitNexus index not available; impact analysis based on file paths only.');
    }

    // Detect changes via gitnexus (if available) and fallback to PULSE structural heuristics
    if (status.indexExists) {
      try {
        const dcResult = await runGitNexus(
          ['detect-changes', '--scope', 'all'],
          input.repoRoot,
          120_000,
        );
        if (dcResult.exitCode === 0 && dcResult.stdout) {
          evidence.push(dcResult.stdout.slice(0, 4000));
          // Parse symbols from output
          const lines = dcResult.stdout.split('\n');
          for (const line of lines) {
            if (line.includes('→')) impactedSymbols.push(line.trim());
          }
        }
      } catch {
        errors.push('detect-changes command failed.');
      }
    }

    // Fallback: use changed files for capability/flow mapping
    for (const file of input.changedFiles) {
      impactedFiles.push(file);
      const cap = filePathToCapability(file);
      if (cap) impactedCapabilities.push(cap);
      const flow = filePathToFlow(file);
      if (flow) impactedFlows.push(flow);
    }

    let riskLevel: GitNexusImpactReport['riskLevel'] = 'unknown';
    if (input.changedFiles.some((f) => isCriticalPath(f))) {
      riskLevel = 'critical';
    } else if (impactedCapabilities.length > 3) {
      riskLevel = 'high';
    } else if (impactedCapabilities.length > 0) {
      riskLevel = 'medium';
    } else {
      riskLevel = 'low';
    }

    return {
      provider: 'gitnexus',
      status: { ...status, warnings, errors },
      changedFiles: input.changedFiles,
      impactedSymbols,
      impactedFiles,
      impactedCapabilities: [...new Set(impactedCapabilities)],
      impactedFlows: [...new Set(impactedFlows)],
      riskLevel,
      evidence,
      warnings,
      errors,
    };
  }

  async collectEvidence(input: CodeGraphEvidenceInput): Promise<CodeGraphEvidence> {
    const status = await this.getStatus({ repoRoot: input.repoRoot });
    const commit = status.currentCommit;
    const rawCommands = [
      status.indexExists
        ? await runGitNexus(['status'], input.repoRoot)
        : {
            command: 'gitnexus',
            args: ['status'],
            exitCode: -1,
            stdout: '',
            stderr: '',
            durationMs: 0,
            timedOut: false,
          },
    ];

    return {
      provider: 'gitnexus',
      generatedAt: new Date().toISOString(),
      repoRoot: input.repoRoot,
      commit,
      status,
      rawCommands,
    };
  }
}

// ── Path → Capability/Flow mapping ────────────────────────────────────

const ROUTE_GROUP_SEGMENT = /^\(.+\)$/;
const DYNAMIC_ROUTE_SEGMENT = /^\[.+\]$/;

function normalizePathSegments(filePath: string): string[] {
  return filePath
    .replaceAll('\\', '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function titleCaseToken(token: string): string {
  return token
    .replace(/\.[^.]+$/, '')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function firstSemanticSegment(segments: string[]): string | null {
  const backendSrc = segments.findIndex(
    (segment, index) => segment === 'src' && segments[index - 1] === 'backend',
  );
  if (backendSrc >= 0) return segments[backendSrc + 1] ?? null;

  const frontendApp = segments.findIndex(
    (segment, index) => segment === 'app' && segments[index - 2] === 'frontend',
  );
  if (frontendApp >= 0) {
    return (
      segments
        .slice(frontendApp + 1)
        .find(
          (segment) =>
            !ROUTE_GROUP_SEGMENT.test(segment) &&
            !DYNAMIC_ROUTE_SEGMENT.test(segment) &&
            !segment.includes('.'),
        ) ?? null
    );
  }

  const frontendSrc = segments.findIndex(
    (segment, index) => segment === 'src' && segments[index - 1] === 'frontend',
  );
  if (frontendSrc >= 0) return segments[frontendSrc + 1] ?? null;

  const workerIndex = segments.indexOf('worker');
  if (workerIndex >= 0) return segments[workerIndex] ?? null;

  const prismaIndex = segments.indexOf('prisma');
  if (prismaIndex >= 0 || segments.some((segment) => segment === 'schema.prisma')) return 'schema';

  return segments.find((segment) => !segment.includes('.')) ?? null;
}

function fileRole(filePath: string): string {
  const baseName = path.basename(filePath).toLowerCase();
  const parts = baseName.split('.').filter(Boolean);
  const extension = parts.length > 0 ? parts[parts.length - 1] : undefined;
  const stemParts = extension ? parts.slice(0, -1) : parts;
  const structuralRole = stemParts.length > 0 ? stemParts[stemParts.length - 1] : undefined;
  if (structuralRole) return structuralRole;
  const pathSegments = normalizePathSegments(filePath);
  const parentSegment = pathSegments.length > 1 ? pathSegments[pathSegments.length - 2] : undefined;
  if (parentSegment) return parentSegment.replace(/s$/, '');
  return 'change';
}

export function filePathToCapability(filePath: string): string | null {
  const segment = firstSemanticSegment(normalizePathSegments(filePath));
  return segment ? titleCaseToken(segment) : null;
}

export function filePathToFlow(filePath: string): string | null {
  const capability = filePathToCapability(filePath);
  if (!capability) return null;
  return `${capability.toLowerCase().replace(/\s+/g, '-')}-${fileRole(filePath)}`;
}

export function isCriticalPath(filePath: string): boolean {
  const normalized = filePath.replaceAll('\\', '/');
  return (
    normalized.endsWith('/schema.prisma') ||
    normalized === 'backend/prisma/schema.prisma' ||
    normalized.includes('/migrations/')
  );
}
