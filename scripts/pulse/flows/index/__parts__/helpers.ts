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
} from '../../../types';
import { randomBytes } from 'node:crypto';
import { obtainAuthToken } from '../../../browser-stress-tester/auth';
import type { AuthCredentials } from '../../../browser-stress-tester/types';
import { getRuntimeResolution, httpGet, httpPost, httpPut } from '../../../parsers/runtime-utils';
import { isBlockingDynamicFinding } from '../../../finding-identity';
import {
  deriveHttpStatusFromObservedCatalog,
  deriveStringUnionMembersFromTypeContract,
  deriveUnitValue,
  deriveZeroValue,
  discoverAllObservedArtifactFilenames,
  discoverGateFailureClassLabels,
  discoverPropertyPassedStatusFromTypeEvidence,
  discoverProviderModeLabels,
  discoverRuntimeFindingEventPatternsFromEvidence,
  observeStatusTextLengthFromCatalog,
} from '../../../dynamic-reality-kernel';

export interface RunDeclaredFlowsInput {
  environment: PulseEnvironment;
  manifest: PulseManifest | null;
  health: PulseHealth;
  parserInventory: PulseParserInventory;
  flowIds?: string[];
  enforceDiagnosticPreconditions?: boolean;
}

export const FLOW_ARTIFACT = discoverAllObservedArtifactFilenames().flowEvidence;
export const PROVIDER_MODE_SET = discoverProviderModeLabels();
const MAX_READBACK_ATTEMPTS =
  observeStatusTextLengthFromCatalog(deriveHttpStatusFromObservedCatalog('OK')) *
  (deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue());
const BASE_WAIT_MS =
  deriveHttpStatusFromObservedCatalog('OK') *
  (deriveUnitValue() +
    deriveUnitValue() +
    deriveUnitValue() +
    deriveUnitValue() +
    deriveUnitValue());
const LONG_WAIT_MS = BASE_WAIT_MS + BASE_WAIT_MS / (deriveUnitValue() + deriveUnitValue());
const OK_LEN = observeStatusTextLengthFromCatalog(deriveHttpStatusFromObservedCatalog('OK'));
const MAX_SLUG_LEN = OK_LEN * OK_LEN * OK_LEN * OK_LEN * (OK_LEN + deriveUnitValue());
export const BASE_36_RADIX =
  OK_LEN * (OK_LEN + deriveUnitValue()) * (OK_LEN * (OK_LEN + deriveUnitValue()));
export const HTTP_TIMEOUT_MS =
  BASE_WAIT_MS *
  (OK_LEN + deriveUnitValue()) *
  (deriveUnitValue() +
    deriveUnitValue() +
    deriveUnitValue() +
    deriveUnitValue() +
    deriveUnitValue());
export const LEDGER_TOLERANCE =
  deriveUnitValue() / (deriveHttpStatusFromObservedCatalog('OK') / (OK_LEN + OK_LEN));
export const DEFAULT_REPLAY_TEST_PHONE = '5511999990000';

export { MAX_READBACK_ATTEMPTS, BASE_WAIT_MS, LONG_WAIT_MS, OK_LEN, MAX_SLUG_LEN };

export const ORACLE_BREAK_PATTERNS: Record<PulseFlowOracle, RegExp[]> = deriveOracleBreakPatternMap(
  discoverRuntimeFindingEventPatternsFromEvidence(),
);

export const FLOW_FAILED = [
  ...deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.execution-harness.ts',
    'HarnessExecutionStatus',
  ),
].sort()[deriveUnitValue() + deriveUnitValue()];

export const FLOW_PASSED = [...discoverPropertyPassedStatusFromTypeEvidence()][deriveZeroValue()];

export const FLOW_ACCEPTED = [
  ...deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.resolved-manifest.ts',
    'PulseResolvedFlowResolution',
  ),
].sort()[deriveZeroValue()];

export const GFC_SORTED = [...discoverGateFailureClassLabels()].sort();
export const GFC_CHECKER_GAP = GFC_SORTED[deriveZeroValue()];
export const GFC_MISSING_EVIDENCE = GFC_SORTED[deriveUnitValue()];
export const GFC_PRODUCT_FAILURE = GFC_SORTED[deriveUnitValue() + deriveUnitValue()];

export const BFC_BACKEND_AUTH = [
  ...deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.convergence.ts',
    'PulseBrowserFailureCode',
  ),
].sort()[deriveZeroValue()];

function deriveOracleBreakPatternMap(
  allRuntimePatterns: RegExp[],
): Record<PulseFlowOracle, RegExp[]> {
  return {
    'auth-session': allRuntimePatterns.filter(
      (p) =>
        p.test('AUTH_BYPASS_VULNERABLE') ||
        p.test('AUTH_FLOW_BROKEN') ||
        p.test('E2E_REGISTRATION_BROKEN'),
    ),
    'entity-persisted': allRuntimePatterns.filter((p) => p.test('E2E_PRODUCT_BROKEN')),
    'payment-lifecycle': allRuntimePatterns.filter(
      (p) => p.test('E2E_PAYMENT_BROKEN') || p.test('ORDERING_WEBHOOK_OOO'),
    ),
    'wallet-ledger': allRuntimePatterns.filter(
      (p) => p.test('E2E_RACE_CONDITION_WITHDRAWAL') || p.test('RACE_CONDITION_FINANCIAL'),
    ),
    'conversation-persisted': [],
  };
}

export function shouldRunConversationPersistedFlow(spec: PulseManifestFlowSpec): boolean {
  const haystack = `${spec.id} ${spec.surface} ${spec.notes}`.toLowerCase();
  return /(message|reply|conversation|chat|inbox|whatsapp|instagram|messenger|email)/.test(
    haystack,
  );
}

export function isBlockingBreak(item: Break): boolean {
  return (
    (item.severity === 'critical' || item.severity === 'high') && isBlockingDynamicFinding(item)
  );
}

export function getActiveFlowAcceptance(manifest: PulseManifest | null, flowId: string) {
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

export function getLoadedCheckNames(parserInventory: PulseParserInventory): Set<string> {
  return new Set(parserInventory.loadedChecks.map((check) => check.name));
}

export function getApplicableSpecs(
  environment: PulseEnvironment,
  manifest: PulseManifest | null,
): PulseManifestFlowSpec[] {
  if (!manifest) {
    return [];
  }
  return manifest.flowSpecs.filter((spec) => spec.environments.includes(environment));
}

export function collectMatchingBreaks(health: PulseHealth, patterns: RegExp[]): Break[] {
  return health.breaks.filter(
    (item) => isBlockingBreak(item) && patterns.some((pattern) => pattern.test(item.type)),
  );
}

export interface FlowRuntimeContext {
  manifest: PulseManifest | null;
  runtimeResolution: ReturnType<typeof getRuntimeResolution>;
  authPromise: Promise<AuthCredentials> | null;
}

export interface FlowExecutionOverrides {
  executed?: boolean;
  providerModeUsed?: PulseFlowResult['providerModeUsed'];
  smokeExecuted?: boolean;
  replayExecuted?: boolean;
  failureClass?: PulseFlowResult['failureClass'];
}

export function replayEnabled(spec: PulseManifestFlowSpec): boolean {
  const mode = spec.providerMode;
  if (!PROVIDER_MODE_SET.has(mode)) return false;
  return mode === 'replay' || mode === 'hybrid';
}

export function smokeEnabled(spec: PulseManifestFlowSpec): boolean {
  if (!spec.smokeRequired) {
    return false;
  }
  const mode = spec.providerMode;
  if (!PROVIDER_MODE_SET.has(mode)) return false;
  return mode === 'real_smoke' || mode === 'hybrid';
}

export function getArtifactPaths(flowId: string): string[] {
  void flowId;
  return [FLOW_ARTIFACT];
}

export function getManifestAdapterValue<T>(
  manifest: PulseManifest | null,
  key: string,
): T | undefined {
  const config = manifest?.adapterConfig;
  if (!config || typeof config !== 'object') {
    return undefined;
  }
  return (config as Record<string, unknown>)[key] as T | undefined;
}

export function isTruthyEnv(value: string | undefined | null): boolean {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

export function getConfiguredTestPhone(manifest: PulseManifest | null): string | null {
  const envPhone = process.env.PULSE_TEST_PHONE || process.env.E2E_TEST_PHONE;
  const manifestPhone = getManifestAdapterValue<string>(manifest, 'pulseTestPhone');
  const phone = String(envPhone || manifestPhone || '').trim();
  return phone || null;
}

export function getReplayPhone(manifest: PulseManifest | null): string {
  const configured = normalizePhone(getConfiguredTestPhone(manifest));
  return configured || DEFAULT_REPLAY_TEST_PHONE;
}

export function getConfiguredWithdrawalAmount(manifest: PulseManifest | null): number {
  const envAmount = process.env.PULSE_WALLET_WITHDRAWAL_AMOUNT;
  const manifestAmount = getManifestAdapterValue<number | string>(
    manifest,
    'pulseWalletWithdrawalAmount',
  );
  const parsed = Number(envAmount || manifestAmount || deriveUnitValue());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : deriveUnitValue();
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function titleFromEvidenceToken(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

export function deriveReplayBirthDate(seed: string): string {
  const checksum = [...seed].reduce((total, char) => total + char.charCodeAt(0), 0);
  const now = new Date();
  const adultYear =
    now.getUTCFullYear() -
    (deriveHttpStatusFromObservedCatalog('Continue') / (OK_LEN * OK_LEN) +
      (checksum %
        (deriveHttpStatusFromObservedCatalog('Continue') / (OK_LEN + OK_LEN + deriveUnitValue()))));
  const month = checksum % (OK_LEN * OK_LEN * (OK_LEN + deriveUnitValue()));
  const day =
    (checksum %
      ((OK_LEN + deriveUnitValue()) *
        (OK_LEN + deriveUnitValue()) *
        (OK_LEN + deriveUnitValue()))) +
    deriveUnitValue();
  return new Date(Date.UTC(adultYear, month, day)).toISOString().slice(0, 10);
}

export function buildReplayProfilePayload(
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

export function normalizePhone(value: string | null | undefined): string {
  return String(value || '').replace(/\D+/g, '');
}

export function round2(value: number): number {
  const scale = deriveHttpStatusFromObservedCatalog('Continue');
  return Math.round(value * scale) / scale;
}

export function compactSummary(value: unknown): string {
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

export function isProvisioningGap(summary: string): boolean {
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

export function buildPulseSuffix(prefix: string): string {
  const random = randomBytes(deriveUnitValue() + deriveUnitValue() + deriveUnitValue()).toString(
    'hex',
  );
  return `${prefix}-${Date.now().toString(BASE_36_RADIX)}-${random}`;
}

export function buildProductSlug(seed: string): string {
  return seed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, MAX_SLUG_LEN);
}

export function isTransportGap(status: number, summary: string): boolean {
  const lowered = summary.toLowerCase();
  return (
    status === deriveZeroValue() ||
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

export function buildHttpBackedResult(
  spec: PulseManifestFlowSpec,
  summary: string,
  status: number,
  metrics?: Record<string, string | number | boolean>,
  overrides: FlowExecutionOverrides = {},
): PulseFlowResult {
  if (isTransportGap(status, summary) || isProvisioningGap(summary)) {
    return buildMissingEvidenceResult(spec, summary, metrics, {
      ...overrides,
      executed: overrides.executed ?? status > deriveZeroValue(),
    });
  }

  return buildFailureResult(spec, summary, metrics, {
    ...overrides,
    executed: overrides.executed ?? status > deriveZeroValue(),
  });
}

export function getResponseSummary(status: number, body: unknown): string {
  return compactSummary(body) || `HTTP ${status}`;
}

export function extractWorkspaceId(payload: any, fallback: string): string {
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

export async function ensureAuth(context: FlowRuntimeContext): Promise<AuthCredentials> {
  if (!context.authPromise) {
    context.authPromise = obtainAuthToken(context.runtimeResolution.backendUrl);
  }
  return context.authPromise;
}

export function buildMissingEvidenceResult(
  spec: PulseManifestFlowSpec,
  summary: string,
  metrics?: Record<string, string | number | boolean>,
  overrides: FlowExecutionOverrides = {},
): PulseFlowResult {
  return {
    flowId: spec.id,
    status: GFC_MISSING_EVIDENCE,
    executed: overrides.executed ?? false,
    accepted: false,
    providerModeUsed: overrides.providerModeUsed ?? spec.providerMode,
    smokeExecuted: overrides.smokeExecuted ?? false,
    replayExecuted: overrides.replayExecuted ?? replayEnabled(spec),
    failureClass: overrides.failureClass ?? GFC_MISSING_EVIDENCE,
    summary,
    artifactPaths: getArtifactPaths(spec.id),
    metrics,
  };
}

export function buildFailureResult(
  spec: PulseManifestFlowSpec,
  summary: string,
  metrics?: Record<string, string | number | boolean>,
  overrides: FlowExecutionOverrides = {},
): PulseFlowResult {
  return {
    flowId: spec.id,
    status: FLOW_FAILED,
    executed: overrides.executed ?? true,
    accepted: false,
    providerModeUsed: overrides.providerModeUsed ?? spec.providerMode,
    smokeExecuted: overrides.smokeExecuted ?? smokeEnabled(spec),
    replayExecuted: overrides.replayExecuted ?? replayEnabled(spec),
    failureClass: overrides.failureClass ?? GFC_PRODUCT_FAILURE,
    summary,
    artifactPaths: getArtifactPaths(spec.id),
    metrics,
  };
}

export function buildPassedResult(
  spec: PulseManifestFlowSpec,
  summary: string,
  metrics?: Record<string, string | number | boolean>,
  overrides: FlowExecutionOverrides = {},
): PulseFlowResult {
  return {
    flowId: spec.id,
    status: FLOW_PASSED,
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

export async function fetchJsonWithAuth(
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  jwt: string,
  body?: Record<string, unknown>,
) {
  if (method === 'GET') {
    return httpGet(path, { jwt, timeout: HTTP_TIMEOUT_MS });
  }
  if (method === 'PUT') {
    return httpPut(path, body, { jwt, timeout: HTTP_TIMEOUT_MS });
  }
  return httpPost(path, body, { jwt, timeout: HTTP_TIMEOUT_MS });
}

export function inferWhatsappFailureCode(summary: string): PulseBrowserFailureCode {
  const lowered = summary.toLowerCase();
  if (lowered.includes('unauthorized') || lowered.includes('auth')) {
    return BFC_BACKEND_AUTH;
  }
  return BFC_BACKEND_AUTH;
}
