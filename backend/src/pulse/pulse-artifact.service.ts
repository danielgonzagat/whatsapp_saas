import * as fs from 'node:fs';
import * as path from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_ARTIFACT_MAX_AGE_MS, type PulseArtifactPayload } from './pulse.service.contract';

/**
 * Runtime authority mode subset for backend consumption.
 * Maps to CLI AuthorityMode but uses simplified labels for production snapshot.
 */
type RuntimeAuthorityMode = 'advisory-only' | 'autonomous';

/**
 * PulseArtifactService
 *
 * Reads and caches PULSE JSON artifact files from the filesystem.
 * Extracted from PulseService to keep file sizes manageable.
 */
@Injectable()
export class PulseArtifactService {
  private readonly logger = new Logger(PulseArtifactService.name);

  constructor(private readonly config: ConfigService) {}

  /** Get latest PULSE directive artifact. */
  getLatestDirective() {
    return this.readArtifactJson('PULSE_CLI_DIRECTIVE.json');
  }

  /** Get latest PULSE certificate artifact. */
  getLatestCertificate() {
    return this.readArtifactJson('PULSE_CERTIFICATE.json');
  }

  /** Get latest PULSE product vision artifact. */
  getLatestProductVision() {
    return this.readArtifactJson('PULSE_PRODUCT_VISION.json');
  }

  /** Get latest PULSE parity gaps artifact. */
  getLatestParityGaps() {
    return this.readArtifactJson('PULSE_PARITY_GAPS.json');
  }

  /** Get latest PULSE scope state artifact. */
  getLatestScopeState() {
    return this.readArtifactJson('PULSE_SCOPE_STATE.json');
  }

  /** Get latest PULSE codacy evidence artifact. */
  getLatestCodacyEvidence() {
    return this.readArtifactJson('PULSE_CODACY_EVIDENCE.json');
  }

  /** Get latest PULSE capability state artifact. */
  getLatestCapabilityState() {
    return this.readArtifactJson('PULSE_CAPABILITY_STATE.json');
  }

  /** Get latest PULSE flow projection artifact. */
  getLatestFlowProjection() {
    return this.readArtifactJson('PULSE_FLOW_PROJECTION.json');
  }

  /** Get latest PULSE convergence plan artifact. */
  getLatestConvergencePlan() {
    return this.readArtifactJson('PULSE_CONVERGENCE_PLAN.json');
  }

  /** Get latest PULSE external signal artifact. */
  getLatestExternalSignalState() {
    return this.readArtifactJson('PULSE_EXTERNAL_SIGNAL_STATE.json');
  }

  /** Get latest PULSE autonomy-state artifact. */
  getLatestAutonomyState() {
    return this.readArtifactJson('PULSE_AUTONOMY_STATE.json');
  }

  /** Get latest PULSE agent-orchestration-state artifact. */
  getLatestAgentOrchestrationState() {
    return this.readArtifactJson('PULSE_AGENT_ORCHESTRATION_STATE.json');
  }

  /** Get latest production-oriented PULSE snapshot. */
  getProductionSnapshot() {
    const directive = this.getLatestDirective();
    const certificate = this.getLatestCertificate();
    const productVision = this.getLatestProductVision();
    const parityGaps = this.getLatestParityGaps();
    const scopeState = this.getLatestScopeState();
    const codacyEvidence = this.getLatestCodacyEvidence();
    const capabilityState = this.getLatestCapabilityState();
    const flowProjection = this.getLatestFlowProjection();
    const externalSignalState = this.getLatestExternalSignalState();
    const autonomyState = this.getLatestAutonomyState();
    const agentOrchestrationState = this.getLatestAgentOrchestrationState();
    const convergencePlan = this.getLatestConvergencePlan();
    const artifactIndex = this.readArtifactJson('PULSE_ARTIFACT_INDEX.json');

    const artifacts = [
      directive,
      certificate,
      productVision,
      parityGaps,
      scopeState,
      codacyEvidence,
      capabilityState,
      flowProjection,
      externalSignalState,
      autonomyState,
      agentOrchestrationState,
      convergencePlan,
      artifactIndex,
    ];
    const missingArtifacts = artifacts
      .filter((artifact) => artifact.freshness === 'missing')
      .map((artifact) => artifact.artifact);
    const staleArtifacts = artifacts
      .filter((artifact) => artifact.freshness === 'stale')
      .map((artifact) => artifact.artifact);
    const status: 'ready' | 'degraded' | 'empty' = artifacts.every(
      (artifact) => artifact.freshness === 'missing',
    )
      ? 'empty'
      : missingArtifacts.length > 0 || staleArtifacts.length > 0
        ? 'degraded'
        : 'ready';
    const certData = certificate.data as { humanReplacementStatus?: string } | null;
    const authorityMode: RuntimeAuthorityMode =
      certData?.humanReplacementStatus === 'READY' ? 'autonomous' : 'advisory-only';

    return {
      status,
      authorityMode,
      generatedAt: new Date().toISOString(),
      canonicalDir: this.getArtifactCanonicalDir(),
      summary:
        status === 'ready'
          ? 'PULSE runtime snapshot is fresh and ready for production consumption.'
          : status === 'empty'
            ? 'No canonical PULSE artifacts were found for runtime consumption yet.'
            : `PULSE runtime snapshot is degraded: missing=${missingArtifacts.length}, stale=${staleArtifacts.length}.`,
      missingArtifacts,
      staleArtifacts,
      directive,
      certificate,
      productVision,
      parityGaps,
      scopeState,
      codacyEvidence,
      capabilityState,
      flowProjection,
      externalSignalState,
      autonomyState,
      agentOrchestrationState,
      convergencePlan,
      artifactIndex,
    };
  }

  getArtifactCanonicalDir() {
    return path.join(this.getArtifactRootDir(), '.pulse', 'current');
  }

  private getArtifactRootDir() {
    const configured =
      this.config.get<string>('PULSE_ARTIFACT_ROOT') || this.config.get<string>('APP_ROOT_DIR');
    if (configured) return configured;
    return this.detectArtifactRootDir(process.cwd());
  }

  private detectArtifactRootDir(startDir: string) {
    let current = path.resolve(startDir);
    while (true) {
      const hasPulseRunner = fs.existsSync(path.join(current, 'scripts', 'pulse', 'run.js'));
      const hasRootPackage = fs.existsSync(path.join(current, 'package.json'));
      const hasBackendDir = fs.existsSync(path.join(current, 'backend'));
      if (hasPulseRunner && hasRootPackage && hasBackendDir) return current;
      const parent = path.dirname(current);
      if (parent === current) return path.resolve(startDir);
      current = parent;
    }
  }

  private getArtifactMaxAgeMs() {
    const configured = Number.parseInt(
      String(this.config.get<string>('PULSE_ARTIFACT_MAX_AGE_MS') || ''),
      10,
    );
    if (Number.isFinite(configured) && configured >= 60_000) return configured;
    return DEFAULT_ARTIFACT_MAX_AGE_MS;
  }

  readArtifactJson<T = Record<string, unknown>>(artifactName: string): PulseArtifactPayload<T> {
    const targetPath = path.join(this.getArtifactCanonicalDir(), artifactName);
    if (!fs.existsSync(targetPath)) {
      return {
        artifact: artifactName,
        path: targetPath,
        freshness: 'missing',
        generatedAt: null,
        staleMs: null,
        data: null,
        error: 'artifact_not_found',
      };
    }
    try {
      const raw = fs.readFileSync(targetPath, 'utf8');
      const data = JSON.parse(raw) as T & { generatedAt?: string; timestamp?: string };
      const generatedAt = String(data.generatedAt || data.timestamp || '').trim() || null;
      const generatedAtMs = generatedAt ? Date.parse(generatedAt) : Number.NaN;
      const staleMs = Number.isFinite(generatedAtMs)
        ? Math.max(Date.now() - generatedAtMs, 0)
        : null;
      const freshness =
        generatedAt && staleMs !== null && staleMs <= this.getArtifactMaxAgeMs()
          ? 'fresh'
          : 'stale';
      return { artifact: artifactName, path: targetPath, freshness, generatedAt, staleMs, data };
    } catch (error) {
      return {
        artifact: artifactName,
        path: targetPath,
        freshness: 'missing',
        generatedAt: null,
        staleMs: null,
        data: null,
        error: error instanceof Error ? error.message : 'artifact_read_failed',
      };
    }
  }
}
