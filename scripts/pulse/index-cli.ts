import { parseCertificationProfile, getProfileSelection } from './profiles';
import type { PulseBrowserEvidence } from './types';
import type { PulseSyntheticRunMode, runSyntheticActors } from './actors';

const args = process.argv.slice(2);
const tierArgIndex = args.indexOf('--tier');
const parsedTier = tierArgIndex >= 0 ? Number.parseInt(args[tierArgIndex + 1] || '', 10) : null;
const profileArgIndex = args.indexOf('--profile');
const requestedProfile = parseCertificationProfile(
  profileArgIndex >= 0 ? args[profileArgIndex + 1] || null : null,
);
const flags = {
  watch: args.includes('--watch') || args.includes('-w'),
  report: args.includes('--report') || args.includes('-r'),
  json: args.includes('--json') || args.includes('-j'),
  guidance: args.includes('--guidance'),
  prove: args.includes('--prove'),
  vision: args.includes('--vision'),
  autonomous: args.includes('--autonomous'),
  continuous: args.includes('--continuous'),
  dryRun: args.includes('--dry-run'),
  verbose: args.includes('--verbose') || args.includes('-v'),
  selfTrust: args.includes('--self-trust'),
  deep: args.includes('--deep') || args.includes('-d'),
  total: args.includes('--total') || args.includes('-t'),
  fmap: args.includes('--functional-map') || args.includes('--fmap') || args.includes('-f'),
  certify: args.includes('--certify'),
  final: args.includes('--final'),
  tier: Number.isFinite(parsedTier) ? parsedTier : null,
  manifestValidate: args.includes('--manifest-validate'),
  headed: args.includes('--headed'),
  fast: args.includes('--fast'),
  customer: args.includes('--customer'),
  operator: args.includes('--operator'),
  admin: args.includes('--admin'),
  shift: args.includes('--shift'),
  soak: args.includes('--soak'),
  pageFilter: args.includes('--page') ? args[args.indexOf('--page') + 1] : null,
  groupFilter: args.includes('--group') ? args[args.indexOf('--group') + 1] : null,
  slowMo: args.includes('--slow-mo') ? parseInt(args[args.indexOf('--slow-mo') + 1], 10) : 50,
  maxIterations: args.includes('--max-iterations')
    ? parseInt(args[args.indexOf('--max-iterations') + 1], 10)
    : null,
  intervalMs: args.includes('--interval-ms')
    ? parseInt(args[args.indexOf('--interval-ms') + 1], 10)
    : null,
  parallelAgents: args.includes('--parallel-agents')
    ? parseInt(args[args.indexOf('--parallel-agents') + 1], 10)
    : null,
  maxWorkerRetries: args.includes('--max-worker-retries')
    ? parseInt(args[args.indexOf('--max-worker-retries') + 1], 10)
    : null,
  riskProfile: args.includes('--risk-profile') ? args[args.indexOf('--risk-profile') + 1] : null,
  plannerModel: args.includes('--planner-model') ? args[args.indexOf('--planner-model') + 1] : null,
  codexModel: args.includes('--codex-model') ? args[args.indexOf('--codex-model') + 1] : null,
  disableAgentPlanner: args.includes('--disable-agent-planner'),
  profile: requestedProfile,
};
const inferredSyntheticModes = new Set<PulseSyntheticRunMode>(
  [
    flags.customer ? 'customer' : null,
    flags.operator ? 'operator' : null,
    flags.admin ? 'admin' : null,
    flags.shift ? 'shift' : null,
    flags.soak ? 'soak' : null,
  ].filter((value): value is PulseSyntheticRunMode => Boolean(value)),
);

if (flags.final || (typeof flags.tier === 'number' && flags.tier >= 1)) {
  inferredSyntheticModes.add('customer');
}
if (flags.final || (typeof flags.tier === 'number' && flags.tier >= 2)) {
  inferredSyntheticModes.add('operator');
  inferredSyntheticModes.add('admin');
}
if (flags.final || (typeof flags.tier === 'number' && flags.tier >= 4)) {
  inferredSyntheticModes.add('soak');
}
if (flags.profile === 'core-critical') {
  inferredSyntheticModes.add('customer');
  inferredSyntheticModes.add('operator');
  inferredSyntheticModes.add('admin');
}
if (flags.profile === 'full-product') {
  inferredSyntheticModes.add('customer');
  inferredSyntheticModes.add('operator');
  inferredSyntheticModes.add('admin');
  inferredSyntheticModes.add('soak');
}

const requestedSyntheticModes = [...inferredSyntheticModes];
const queryModeRequested = flags.guidance || flags.prove || flags.vision || flags.selfTrust;

const actorModeRequested = requestedSyntheticModes.length > 0;

function deriveEffectiveTarget() {
  if (flags.profile) {
    return getProfileSelection(flags.profile).certificationTarget;
  }

  return {
    tier: flags.tier,
    final: flags.final,
    profile: null,
  };
}

function deriveEffectiveEnvironment() {
  if (flags.profile) {
    return getProfileSelection(flags.profile).environment;
  }
  if (flags.total) {
    return 'total' as const;
  }
  if (flags.deep) {
    return 'deep' as const;
  }
  return 'scan' as const;
}

function compactReason(value: string, max: number = 500): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= max) {
    return compact;
  }
  return `${compact.slice(0, max - 3)}...`;
}

function deriveBrowserEvidenceFromActors(
  actorModeRequested: boolean,
  browserEvidence: PulseBrowserEvidence,
  syntheticEvidence: ReturnType<typeof runSyntheticActors>,
) {
  if (!actorModeRequested || browserEvidence.executed) {
    return browserEvidence;
  }

  const actorResults = [
    ...syntheticEvidence.customer.results,
    ...syntheticEvidence.operator.results,
    ...syntheticEvidence.admin.results,
    ...syntheticEvidence.soak.results,
  ].filter((result) => result.requested && result.runner === 'playwright-spec');

  if (actorResults.length === 0) {
    return browserEvidence;
  }

  const executed = actorResults.filter((result) => result.executed);
  const passed = executed.filter((result) => result.status === 'passed');
  const blocking = executed.filter(
    (result) => result.status === 'failed' || result.status === 'checker_gap',
  );

  return {
    ...browserEvidence,
    attempted: true,
    executed: executed.length > 0,
    artifactPaths: [
      ...new Set([
        ...browserEvidence.artifactPaths,
        ...executed.flatMap((result) => result.artifactPaths),
      ]),
    ],
    summary:
      executed.length === 0
        ? `No requested Playwright synthetic scenarios executed successfully. Requested: ${actorResults.map((result) => result.scenarioId).join(', ')}.`
        : blocking.length > 0
          ? `Synthetic Playwright scenarios executed with failures: ${blocking.map((result) => result.scenarioId).join(', ')}.`
          : `Synthetic Playwright scenarios executed successfully: ${passed.map((result) => result.scenarioId).join(', ')}.`,
    totalTested: actorResults.length,
    passRate: executed.length > 0 ? Math.round((passed.length / executed.length) * 100) : 0,
    blockingInteractions: blocking.length,
  };
}

export { flags, requestedSyntheticModes, queryModeRequested, actorModeRequested };
export {
  deriveEffectiveTarget,
  deriveEffectiveEnvironment,
  compactReason,
  deriveBrowserEvidenceFromActors,
};

export function activateRuntimeParserEnv(): void {
  if (
    flags.deep ||
    flags.total ||
    actorModeRequested ||
    flags.final ||
    Boolean(flags.profile) ||
    (typeof flags.tier === 'number' && flags.tier >= 0)
  ) {
    process.env.PULSE_DEEP = '1';
  }
  if (
    flags.total ||
    actorModeRequested ||
    flags.final ||
    Boolean(flags.profile) ||
    (typeof flags.tier === 'number' && flags.tier >= 1)
  ) {
    process.env.PULSE_TOTAL = '1';
  }
}
