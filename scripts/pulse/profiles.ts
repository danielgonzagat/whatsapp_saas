import type {
  PulseCertificationProfile,
  PulseCertificationTarget,
  PulseEnvironment,
} from './types';

/** Pulse profile selection shape. */
export interface PulseProfileSelection {
  /** Profile property. */
  profile: PulseCertificationProfile;
  /** Environment property. */
  environment: PulseEnvironment;
  /** Certification target property. */
  certificationTarget: PulseCertificationTarget;
  /** Requested modes property. */
  requestedModes: Array<'customer' | 'operator' | 'admin' | 'shift' | 'soak'>;
  /** Runtime probe ids property. */
  runtimeProbeIds: string[];
  /** Flow ids property. */
  flowIds: string[];
  /** Invariant ids property. */
  invariantIds: string[];
  /** Scenario ids property. */
  scenarioIds: string[];
  /** Parser timeout ms property. */
  parserTimeoutMs: number;
  /** Phase timeout ms property. */
  phaseTimeoutMs: number;
  /** Include parser. */
  includeParser(name: string): boolean;
}

const CORE_CRITICAL_RUNTIME_PROBES = [
  'backend-health',
  'auth-session',
  'frontend-reachability',
  'db-connectivity',
] as const;

const CORE_CRITICAL_FLOW_IDS = [
  'auth-login',
  'product-create',
  'checkout-payment',
  'wallet-withdrawal',
  'whatsapp-message-send',
] as const;

const CORE_CRITICAL_INVARIANT_IDS = ['wallet-balance-consistency'] as const;

const CORE_CRITICAL_SCENARIO_IDS = [
  'customer-auth-shell',
  'customer-product-and-checkout',
  'customer-whatsapp-and-inbox',
  'operator-campaigns-and-flows',
  'operator-autopilot-run',
  'admin-settings-kyc-banking',
  'admin-whatsapp-session-control',
] as const;

const CORE_CRITICAL_SKIPPED_PARSERS = [
  'accessibility-tester',
  'api-contract-tester',
  'auth-flow-tester',
  'browser-network-checker',
  'build-checker',
  'chaos-dependency-failure',
  'chaos-third-party',
  'crud-tester',
  'e2e-payment',
  'e2e-product-creation',
  'e2e-registration',
  'e2e-whatsapp',
  'e2e-withdrawal',
  'hydration-tester',
  'lint-checker',
  'npm-audit',
  'performance-response-time',
  'responsive-tester',
  'schema-drift',
  'security-auth-bypass',
  'security-cross-workspace',
  'security-injection',
  'security-rate-limit',
  'security-xss',
  'ssr-render-tester',
  'test-coverage',
  'test-runner',
  'webhook-simulator',
] as const;

const CORE_CRITICAL_SKIPPED_SET = new Set<string>(CORE_CRITICAL_SKIPPED_PARSERS);

/** Parse certification profile. */
export function parseCertificationProfile(
  value: string | null | undefined,
): PulseCertificationProfile | null {
  if (!value) {
    return null;
  }
  if (value === 'core-critical' || value === 'full-product') {
    return value;
  }
  return null;
}

/** Get profile selection. */
export function getProfileSelection(profile: PulseCertificationProfile): PulseProfileSelection {
  if (profile === 'core-critical') {
    return {
      profile,
      environment: 'total',
      certificationTarget: {
        tier: 3,
        final: false,
        profile,
      },
      requestedModes: ['customer', 'operator', 'admin'],
      runtimeProbeIds: [...CORE_CRITICAL_RUNTIME_PROBES],
      flowIds: [...CORE_CRITICAL_FLOW_IDS],
      invariantIds: [...CORE_CRITICAL_INVARIANT_IDS],
      scenarioIds: [...CORE_CRITICAL_SCENARIO_IDS],
      parserTimeoutMs: 15_000,
      phaseTimeoutMs: 90_000,
      includeParser(name: string): boolean {
        return !CORE_CRITICAL_SKIPPED_SET.has(name);
      },
    };
  }

  return {
    profile,
    environment: 'total',
    certificationTarget: {
      tier: 4,
      final: true,
      profile,
    },
    requestedModes: ['customer', 'operator', 'admin', 'soak'],
    runtimeProbeIds: [...CORE_CRITICAL_RUNTIME_PROBES],
    flowIds: [...CORE_CRITICAL_FLOW_IDS],
    invariantIds: [...CORE_CRITICAL_INVARIANT_IDS],
    scenarioIds: [...CORE_CRITICAL_SCENARIO_IDS],
    parserTimeoutMs: 30_000,
    phaseTimeoutMs: 180_000,
    includeParser(): boolean {
      return true;
    },
  };
}

/** Get target label. */
export function getTargetLabel(target: PulseCertificationTarget): string {
  if (target.profile) {
    return target.profile;
  }
  if (target.final) {
    return 'FINAL';
  }
  if (typeof target.tier === 'number') {
    return `TIER ${target.tier}`;
  }
  return 'GLOBAL';
}
