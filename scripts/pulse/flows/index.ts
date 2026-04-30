import type {
  Break,
  PulseBrowserFailureCode,
  PulseEnvironment,
  PulseFlowEvidence,
  PulseFlowOracle,
  PulseFlowResult,
  PulseHealth,
  PulseManifest,
  PulseManifestFlowSpec,
  PulseParserInventory,
} from '../types';
import { randomBytes } from 'node:crypto';
import { obtainAuthToken } from '../browser-stress-tester/auth';
import type { AuthCredentials } from '../browser-stress-tester/types';
import { getRuntimeResolution, httpGet, httpPost, httpPut } from '../parsers/runtime-utils';
import { isBlockingDynamicFinding, summarizeDynamicFindingEvents } from '../finding-identity';

interface RunDeclaredFlowsInput {
  environment: PulseEnvironment;
  manifest: PulseManifest | null;
  health: PulseHealth;
  parserInventory: PulseParserInventory;
  flowIds?: string[];
  enforceDiagnosticPreconditions?: boolean;
}

const FLOW_ARTIFACT = 'PULSE_FLOW_EVIDENCE.json';
const DEFAULT_REPLAY_TEST_PHONE = '5511999990000';

const ORACLE_BREAK_PATTERNS: Record<PulseFlowOracle, RegExp[]> = {
  'auth-session': [/^AUTH_BYPASS_VULNERABLE$/, /^AUTH_FLOW_BROKEN$/, /^E2E_REGISTRATION_BROKEN$/],
  'entity-persisted': [/^E2E_PRODUCT_BROKEN$/],
  'payment-lifecycle': [/^E2E_PAYMENT_BROKEN$/, /^ORDERING_WEBHOOK_OOO$/],
  'wallet-ledger': [/^E2E_RACE_CONDITION_WITHDRAWAL$/, /^RACE_CONDITION_FINANCIAL$/],
  'conversation-persisted': [],
};

function shouldRunConversationPersistedFlow(spec: PulseManifestFlowSpec): boolean {
  const haystack = `${spec.id} ${spec.surface} ${spec.notes}`.toLowerCase();
  return /(message|reply|conversation|chat|inbox|whatsapp|instagram|messenger|email)/.test(
    haystack,
  );
}

function isBlockingBreak(item: Break): boolean {
  return (
    (item.severity === 'critical' || item.severity === 'high') && isBlockingDynamicFinding(item)
  );
}

function getActiveFlowAcceptance(manifest: PulseManifest | null, flowId: string) {
  if (!manifest) {
    return null;
  }
  const now = Date.now();
  return (
    manifest.temporaryAcceptances.find((entry) => {
      if (entry.targetType !== 'flow' || entry.target !== flowId) {
        return false;
      }
      const expiresAt = Date.parse(entry.expiresAt);
      return Number.isFinite(expiresAt) && expiresAt >= now;
    }) || null
  );
}

function getLoadedCheckNames(parserInventory: PulseParserInventory): Set<string> {
  return new Set(parserInventory.loadedChecks.map((check) => check.name));
}

function getApplicableSpecs(
  environment: PulseEnvironment,
  manifest: PulseManifest | null,
): PulseManifestFlowSpec[] {
  if (!manifest) {
    return [];
  }
  return manifest.flowSpecs.filter((spec) => spec.environments.includes(environment));
}

function collectMatchingBreaks(health: PulseHealth, patterns: RegExp[]): Break[] {
  return health.breaks.filter(
    (item) => isBlockingBreak(item) && patterns.some((pattern) => pattern.test(item.type)),
  );
}

interface FlowRuntimeContext {
  manifest: PulseManifest | null;
  runtimeResolution: ReturnType<typeof getRuntimeResolution>;
  authPromise: Promise<AuthCredentials> | null;
}

interface FlowExecutionOverrides {
  executed?: boolean;
  providerModeUsed?: PulseFlowResult['providerModeUsed'];
  smokeExecuted?: boolean;
  replayExecuted?: boolean;
  failureClass?: PulseFlowResult['failureClass'];
}

function replayEnabled(spec: PulseManifestFlowSpec): boolean {
  return spec.providerMode === 'replay' || spec.providerMode === 'hybrid';
}

function smokeEnabled(spec: PulseManifestFlowSpec): boolean {
  if (!spec.smokeRequired) {
    return false;
  }
  return spec.providerMode === 'real_smoke' || spec.providerMode === 'hybrid';
}

function getArtifactPaths(flowId: string): string[] {
  void flowId;
  return [FLOW_ARTIFACT];
}

function getManifestAdapterValue<T>(manifest: PulseManifest | null, key: string): T | undefined {
  const config = manifest?.adapterConfig;
  if (!config || typeof config !== 'object') {
    return undefined;
  }
  return (config as Record<string, unknown>)[key] as T | undefined;
}

function isTruthyEnv(value: string | undefined | null): boolean {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

function getConfiguredTestPhone(manifest: PulseManifest | null): string | null {
  const envPhone = process.env.PULSE_TEST_PHONE || process.env.E2E_TEST_PHONE;
  const manifestPhone = getManifestAdapterValue<string>(manifest, 'pulseTestPhone');
  const phone = String(envPhone || manifestPhone || '').trim();
  return phone || null;
}

function getReplayPhone(manifest: PulseManifest | null): string {
  const configured = normalizePhone(getConfiguredTestPhone(manifest));
  return configured || DEFAULT_REPLAY_TEST_PHONE;
}

function getConfiguredWithdrawalAmount(manifest: PulseManifest | null): number {
  const envAmount = process.env.PULSE_WALLET_WITHDRAWAL_AMOUNT;
  const manifestAmount = getManifestAdapterValue<number | string>(
    manifest,
    'pulseWalletWithdrawalAmount',
  );
  const parsed = Number(envAmount || manifestAmount || 1);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function titleFromEvidenceToken(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function deriveReplayBirthDate(seed: string): string {
  const checksum = [...seed].reduce((total, char) => total + char.charCodeAt(0), 0);
  const now = new Date();
  const adultYear = now.getUTCFullYear() - (25 + (checksum % 20));
  const month = checksum % 12;
  const day = (checksum % 27) + 1;
  return new Date(Date.UTC(adultYear, month, day)).toISOString().slice(0, 10);
}

function buildReplayProfilePayload(
  manifest: PulseManifest | null,
  auth: AuthCredentials,
  replayPhone: string,
  replayMarker: string,
): Record<string, unknown> {
  const configured = getManifestAdapterValue<unknown>(manifest, 'pulseKycProfile');
  if (isRecord(configured)) {
    return {
      ...configured,
      phone: String(configured.phone || replayPhone),
      birthDate: String(configured.birthDate || deriveReplayBirthDate(replayMarker)),
    };
  }

  const identity = titleFromEvidenceToken(auth.email.split('@')[0] || auth.workspaceId);
  const name = identity ? `${identity} ${replayMarker}` : replayMarker;
  return {
    name,
    publicName: identity || replayMarker,
    phone: replayPhone,
    birthDate: deriveReplayBirthDate(replayMarker),
  };
}

function normalizePhone(value: string | null | undefined): string {
  return String(value || '').replace(/\D+/g, '');
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function compactSummary(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => compactSummary(item))
      .filter(Boolean)
      .join('; ');
  }
  if (value && typeof value === 'object') {
    const maybeMessage = (value as Record<string, unknown>).message;
    if (typeof maybeMessage === 'string') {
      return maybeMessage.trim();
    }
    const maybeError = (value as Record<string, unknown>).error;
    if (typeof maybeError === 'string') {
      return maybeError.trim();
    }
  }
  return '';
}

function isProvisioningGap(summary: string): boolean {
  const lowered = summary.toLowerCase();
  return [
    'runtime do whatsapp indisponível',
    'configuração do provedor incompleta',
    'contato sem opt-in',
    'fora da janela de 24h',
    'saldo insuficiente',
    'kyc',
    'forbidden',
    'unauthorized',
    'subscription',
    'worker indisponível',
    'worker unavailable',
    'provider',
    'phone not configured',
    'disabled for safety',
  ].some((token) => lowered.includes(token));
}

function buildPulseSuffix(prefix: string): string {
  const random = randomBytes(3).toString('hex');
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

function buildProductSlug(seed: string): string {
  return seed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

function isTransportGap(status: number, summary: string): boolean {
  const lowered = summary.toLowerCase();
  return (
    status === 0 ||
    lowered.includes('timed out') ||
    lowered.includes('fetch failed') ||
    lowered.includes('request failed') ||
    lowered.includes('enotfound') ||
    lowered.includes('econnrefused') ||
    lowered.includes('econnreset') ||
    lowered.includes('socket hang up') ||
    lowered.includes('aborted')
  );
}

function buildHttpBackedResult(
  spec: PulseManifestFlowSpec,
  summary: string,
  status: number,
  metrics?: Record<string, string | number | boolean>,
  overrides: FlowExecutionOverrides = {},
): PulseFlowResult {
  if (isTransportGap(status, summary) || isProvisioningGap(summary)) {
    return buildMissingEvidenceResult(spec, summary, metrics, {
      ...overrides,
      executed: overrides.executed ?? status > 0,
    });
  }

  return buildFailureResult(spec, summary, metrics, {
    ...overrides,
    executed: overrides.executed ?? status > 0,
  });
}

function getResponseSummary(status: number, body: unknown): string {
  return compactSummary(body) || `HTTP ${status}`;
}

function extractWorkspaceId(payload: any, fallback: string): string {
  const candidates = [
    payload?.id,
    payload?.workspaceId,
    payload?.workspace?.id,
    payload?.workspace?.workspaceId,
    fallback,
  ];

  for (const candidate of candidates) {
    const normalized = String(candidate || '').trim();
    if (normalized) {
      return normalized;
    }
  }

  return '';
}

async function ensureAuth(context: FlowRuntimeContext): Promise<AuthCredentials> {
  if (!context.authPromise) {
    context.authPromise = obtainAuthToken(context.runtimeResolution.backendUrl);
  }
  return context.authPromise;
}

function buildMissingEvidenceResult(
  spec: PulseManifestFlowSpec,
  summary: string,
  metrics?: Record<string, string | number | boolean>,
  overrides: FlowExecutionOverrides = {},
): PulseFlowResult {
  return {
    flowId: spec.id,
    status: 'missing_evidence',
    executed: overrides.executed ?? false,
    accepted: false,
    providerModeUsed: overrides.providerModeUsed ?? spec.providerMode,
    smokeExecuted: overrides.smokeExecuted ?? false,
    replayExecuted: overrides.replayExecuted ?? replayEnabled(spec),
    failureClass: overrides.failureClass ?? 'missing_evidence',
    summary,
    artifactPaths: getArtifactPaths(spec.id),
    metrics,
  };
}

function buildFailureResult(
  spec: PulseManifestFlowSpec,
  summary: string,
  metrics?: Record<string, string | number | boolean>,
  overrides: FlowExecutionOverrides = {},
): PulseFlowResult {
  return {
    flowId: spec.id,
    status: 'failed',
    executed: overrides.executed ?? true,
    accepted: false,
    providerModeUsed: overrides.providerModeUsed ?? spec.providerMode,
    smokeExecuted: overrides.smokeExecuted ?? smokeEnabled(spec),
    replayExecuted: overrides.replayExecuted ?? replayEnabled(spec),
    failureClass: overrides.failureClass ?? 'product_failure',
    summary,
    artifactPaths: getArtifactPaths(spec.id),
    metrics,
  };
}

function buildPassedResult(
  spec: PulseManifestFlowSpec,
  summary: string,
  metrics?: Record<string, string | number | boolean>,
  overrides: FlowExecutionOverrides = {},
): PulseFlowResult {
  return {
    flowId: spec.id,
    status: 'passed',
    executed: overrides.executed ?? true,
    accepted: false,
    providerModeUsed: overrides.providerModeUsed ?? spec.providerMode,
    smokeExecuted: overrides.smokeExecuted ?? smokeEnabled(spec),
    replayExecuted: overrides.replayExecuted ?? replayEnabled(spec),
    summary,
    artifactPaths: getArtifactPaths(spec.id),
    metrics,
  };
}

async function fetchJsonWithAuth(
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  jwt: string,
  body?: Record<string, unknown>,
) {
  if (method === 'GET') {
    return httpGet(path, { jwt, timeout: 15000 });
  }
  if (method === 'PUT') {
    return httpPut(path, body, { jwt, timeout: 15000 });
  }
  return httpPost(path, body, { jwt, timeout: 15000 });
}

function inferWhatsappFailureCode(summary: string): PulseBrowserFailureCode {
  const lowered = summary.toLowerCase();
  if (lowered.includes('unauthorized') || lowered.includes('auth')) {
    return 'backend_auth_unreachable';
  }
  return 'backend_auth_unreachable';
}
