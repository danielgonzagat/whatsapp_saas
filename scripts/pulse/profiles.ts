import type {
  PulseCertificationProfile,
  PulseCertificationTarget,
  PulseEnvironment,
  PulseManifest,
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

const DEFAULT_RUNTIME_PROBES = [
  'backend-health',
  'auth-session',
  'frontend-reachability',
  'db-connectivity',
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

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function isFullWorkspaceProfile(profile: PulseCertificationProfile): boolean {
  return profile === 'full-product' || profile === 'pulse-core-final';
}

function deriveRequestedModesFromScenarios(
  manifest: PulseManifest | null,
  scenarioIds: string[],
  profile: PulseCertificationProfile,
): Array<'customer' | 'operator' | 'admin' | 'shift' | 'soak'> {
  if (profile === 'pulse-core-final') {
    return [];
  }

  if (!manifest) {
    return isFullWorkspaceProfile(profile)
      ? ['customer', 'operator', 'admin', 'soak']
      : ['customer', 'operator', 'admin'];
  }

  const scenarios = manifest.scenarioSpecs.filter((scenario) => scenarioIds.includes(scenario.id));
  const modes = new Set<'customer' | 'operator' | 'admin' | 'shift' | 'soak'>();

  for (const scenario of scenarios) {
    if (scenario.actorKind === 'customer') {
      modes.add('customer');
    } else if (scenario.actorKind === 'operator') {
      modes.add('operator');
    } else if (scenario.actorKind === 'admin') {
      modes.add('admin');
    }

    if (scenario.timeWindowModes.includes('shift')) {
      modes.add('shift');
    }
    if (scenario.timeWindowModes.includes('soak') || scenario.actorKind === 'system') {
      modes.add('soak');
    }
  }

  if (modes.size === 0) {
    return isFullWorkspaceProfile(profile)
      ? ['customer', 'operator', 'admin', 'soak']
      : ['customer', 'operator', 'admin'];
  }

  return [...modes];
}

function deriveScenarioIds(
  manifest: PulseManifest | null,
  profile: PulseCertificationProfile,
): string[] {
  if (profile === 'pulse-core-final') {
    return [];
  }

  if (!manifest) {
    return [];
  }

  if (isFullWorkspaceProfile(profile)) {
    return manifest.scenarioSpecs.map((scenario) => scenario.id);
  }

  const critical = manifest.scenarioSpecs.filter((scenario) => scenario.critical);
  return (critical.length > 0 ? critical : manifest.scenarioSpecs).map((scenario) => scenario.id);
}

function deriveFlowIds(
  manifest: PulseManifest | null,
  profile: PulseCertificationProfile,
): string[] {
  if (!manifest) {
    return [];
  }

  if (isFullWorkspaceProfile(profile)) {
    return manifest.flowSpecs.map((spec) => spec.id);
  }

  if (manifest.criticalFlows.length > 0) {
    return [...manifest.criticalFlows];
  }

  const critical = manifest.flowSpecs.filter((spec) => spec.critical);
  return (critical.length > 0 ? critical : manifest.flowSpecs).map((spec) => spec.id);
}

function deriveInvariantIds(
  manifest: PulseManifest | null,
  profile: PulseCertificationProfile,
): string[] {
  if (!manifest) {
    return [];
  }

  if (isFullWorkspaceProfile(profile)) {
    return manifest.invariantSpecs.map((spec) => spec.id);
  }

  const critical = manifest.invariantSpecs.filter((spec) => spec.critical);
  return (critical.length > 0 ? critical : manifest.invariantSpecs).map((spec) => spec.id);
}

function deriveRuntimeProbeIds(
  manifest: PulseManifest | null,
  profile: PulseCertificationProfile,
  scenarioIds: string[],
): string[] {
  if (!manifest) {
    return [...DEFAULT_RUNTIME_PROBES];
  }

  const selectedScenarios = manifest.scenarioSpecs.filter((scenario) =>
    scenarioIds.includes(scenario.id),
  );
  const selectedProbeIds = unique(selectedScenarios.flatMap((scenario) => scenario.runtimeProbes));

  if (selectedProbeIds.length > 0) {
    return selectedProbeIds;
  }

  if (isFullWorkspaceProfile(profile)) {
    const allProbeIds = unique(
      manifest.scenarioSpecs.flatMap((scenario) => scenario.runtimeProbes),
    );
    return allProbeIds.length > 0 ? allProbeIds : [...DEFAULT_RUNTIME_PROBES];
  }

  return [...DEFAULT_RUNTIME_PROBES];
}

/** Parse certification profile. */
export function parseCertificationProfile(
  value: string | null | undefined,
): PulseCertificationProfile | null {
  if (!value) {
    return null;
  }
  if (value === 'production-final') {
    return 'full-product';
  }
  if (value === 'core-critical' || value === 'pulse-core-final' || value === 'full-product') {
    return value;
  }
  return null;
}

/** Get profile selection. */
export function getProfileSelection(
  profile: PulseCertificationProfile,
  manifest: PulseManifest | null = null,
): PulseProfileSelection {
  const scenarioIds = deriveScenarioIds(manifest, profile);
  const flowIds = deriveFlowIds(manifest, profile);
  const invariantIds = deriveInvariantIds(manifest, profile);
  const runtimeProbeIds = deriveRuntimeProbeIds(manifest, profile, scenarioIds);
  const requestedModes = deriveRequestedModesFromScenarios(manifest, scenarioIds, profile);

  if (profile === 'core-critical') {
    return {
      profile,
      environment: 'total',
      certificationTarget: {
        tier: 3,
        final: false,
        profile,
        certificationScope: profile,
      },
      requestedModes,
      runtimeProbeIds,
      flowIds,
      invariantIds,
      scenarioIds,
      parserTimeoutMs: 15_000,
      phaseTimeoutMs: 90_000,
      includeParser(name: string): boolean {
        return !CORE_CRITICAL_SKIPPED_SET.has(name);
      },
    };
  }

  if (profile === 'pulse-core-final') {
    return {
      profile,
      environment: 'total',
      certificationTarget: {
        tier: 4,
        final: true,
        profile,
        certificationScope: profile,
      },
      requestedModes,
      runtimeProbeIds,
      flowIds,
      invariantIds,
      scenarioIds,
      parserTimeoutMs: 90_000,
      phaseTimeoutMs: 600_000,
      includeParser(): boolean {
        return true;
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
      certificationScope: profile,
    },
    requestedModes,
    runtimeProbeIds,
    flowIds,
    invariantIds,
    scenarioIds,
    parserTimeoutMs: 90_000,
    phaseTimeoutMs: 600_000,
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
