import type {
  Break,
  PulseEnvironment,
  PulseFlowOracle,
  PulseFlowResult,
  PulseHealth,
  PulseManifest,
  PulseManifestFlowSpec,
  PulseParserInventory,
} from '../../../types';
import type { AuthCredentials } from '../../../browser-stress-tester/types';
import { isBlockingDynamicFinding } from '../../../finding-identity';
import { getRuntimeResolution } from '../../../parsers/runtime-utils';

export interface RunDeclaredFlowsInput {
  environment: PulseEnvironment;
  manifest: PulseManifest | null;
  health: PulseHealth;
  parserInventory: PulseParserInventory;
  flowIds?: string[];
  enforceDiagnosticPreconditions?: boolean;
}

export const FLOW_ARTIFACT = 'PULSE_FLOW_EVIDENCE.json';
export const DEFAULT_REPLAY_TEST_PHONE = '5511999990000';

export const ORACLE_BREAK_PATTERNS: Record<PulseFlowOracle, RegExp[]> = {
  'auth-session': [/^AUTH_BYPASS_VULNERABLE$/, /^AUTH_FLOW_BROKEN$/, /^E2E_REGISTRATION_BROKEN$/],
  'entity-persisted': [/^E2E_PRODUCT_BROKEN$/],
  'payment-lifecycle': [/^E2E_PAYMENT_BROKEN$/, /^ORDERING_WEBHOOK_OOO$/],
  'wallet-ledger': [/^E2E_RACE_CONDITION_WITHDRAWAL$/, /^RACE_CONDITION_FINANCIAL$/],
  'conversation-persisted': [],
};

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
