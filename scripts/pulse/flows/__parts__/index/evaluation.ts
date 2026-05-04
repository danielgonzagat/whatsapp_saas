import type { PulseFlowEvidence, PulseFlowResult, PulseManifestFlowSpec } from '../../../types';
import { summarizeDynamicFindingEvents } from '../../../finding-identity';
import { getRuntimeResolution } from '../../../parsers/runtime-utils';
import type { RunDeclaredFlowsInput, FlowRuntimeContext } from './types-and-config';
import {
  FLOW_ARTIFACT,
  ORACLE_BREAK_PATTERNS,
  shouldRunConversationPersistedFlow,
  getActiveFlowAcceptance,
  getLoadedCheckNames,
  getApplicableSpecs,
  collectMatchingBreaks,
} from './types-and-config';
import { replayEnabled, smokeEnabled, getArtifactPaths } from './mode-helpers';
import { runWalletWithdrawalFlow } from './wallet-flow';
import { runWhatsappMessageFlow } from './whatsapp-flow';

function buildCheckerGapResult(
  spec: PulseManifestFlowSpec,
  missingChecks: string[],
): PulseFlowResult {
  return {
    flowId: spec.id,
    status: 'failed',
    executed: false,
    accepted: false,
    providerModeUsed: spec.providerMode,
    smokeExecuted: false,
    replayExecuted: replayEnabled(spec),
    failureClass: 'checker_gap',
    summary: `Required flow preconditions are not loaded: ${missingChecks.join(', ')}.`,
    artifactPaths: getArtifactPaths(spec.id),
    metrics: {
      missingChecks: missingChecks.join(', '),
    },
  };
}

function annotateIgnoredMissingChecks(
  result: PulseFlowResult,
  missingChecks: string[],
): PulseFlowResult {
  if (missingChecks.length === 0) {
    return result;
  }
  return {
    ...result,
    metrics: {
      ...(result.metrics || {}),
      ignoredMissingChecks: missingChecks.join(', '),
    },
  };
}

async function evaluateFlowSpec(
  spec: PulseManifestFlowSpec,
  input: RunDeclaredFlowsInput,
  loadedChecks: Set<string>,
  runtimeContext: FlowRuntimeContext,
): Promise<PulseFlowResult> {
  const acceptance = getActiveFlowAcceptance(input.manifest, spec.id);
  if (acceptance) {
    return {
      flowId: spec.id,
      status: 'accepted',
      executed: false,
      accepted: true,
      providerModeUsed: spec.providerMode,
      smokeExecuted: false,
      replayExecuted: replayEnabled(spec),
      summary: `Temporarily accepted until ${acceptance.expiresAt}: ${acceptance.reason}`,
      artifactPaths: getArtifactPaths(spec.id),
      metrics: {
        expiresAt: acceptance.expiresAt,
      },
    };
  }

  const missingChecks = spec.preconditions.filter((name) => !loadedChecks.has(name));
  const enforceDiagnosticPreconditions = input.enforceDiagnosticPreconditions !== false;
  if (missingChecks.length > 0 && enforceDiagnosticPreconditions) {
    return buildCheckerGapResult(spec, missingChecks);
  }

  if (spec.oracle === 'wallet-ledger') {
    return annotateIgnoredMissingChecks(
      await runWalletWithdrawalFlow(spec, runtimeContext),
      missingChecks,
    );
  }

  if (spec.oracle === 'conversation-persisted' && shouldRunConversationPersistedFlow(spec)) {
    return annotateIgnoredMissingChecks(
      await runWhatsappMessageFlow(spec, runtimeContext),
      missingChecks,
    );
  }

  const patterns = ORACLE_BREAK_PATTERNS[spec.oracle] || [];
  const matchingBreaks = collectMatchingBreaks(input.health, patterns);

  if (matchingBreaks.length > 0) {
    return annotateIgnoredMissingChecks(
      {
        flowId: spec.id,
        status: 'failed',
        executed: true,
        accepted: false,
        providerModeUsed: spec.providerMode,
        smokeExecuted: smokeEnabled(spec),
        replayExecuted: replayEnabled(spec),
        failureClass: 'product_failure',
        summary: `Blocking finding events for ${spec.id}: ${summarizeDynamicFindingEvents(matchingBreaks).join(', ')}.`,
        artifactPaths: getArtifactPaths(spec.id),
        metrics: {
          breakCount: matchingBreaks.length,
        },
      },
      missingChecks,
    );
  }

  return annotateIgnoredMissingChecks(
    {
      flowId: spec.id,
      status: 'passed',
      executed: true,
      accepted: false,
      providerModeUsed: spec.providerMode,
      smokeExecuted: smokeEnabled(spec),
      replayExecuted: replayEnabled(spec),
      summary: `${spec.id} passed its declared oracle (${spec.oracle}) in ${input.environment} mode.`,
      artifactPaths: getArtifactPaths(spec.id),
      metrics: {
        oracle: spec.oracle,
        runner: spec.runner,
        smokeRequired: spec.smokeRequired,
        providerMode: spec.providerMode,
      },
    },
    missingChecks,
  );
}

function buildSummary(results: PulseFlowResult[]): string {
  if (results.length === 0) {
    return 'No flow specs are required in the current environment.';
  }

  const passed = results.filter((item) => item.status === 'passed').length;
  const failed = results.filter((item) => item.status === 'failed').length;
  const accepted = results.filter((item) => item.status === 'accepted').length;
  const missing = results.filter((item) => item.status === 'missing_evidence').length;

  return `Flow evidence summary: ${passed} passed, ${failed} failed, ${accepted} accepted, ${missing} missing evidence.`;
}

/** Run declared flows. */
export async function runDeclaredFlows(input: RunDeclaredFlowsInput): Promise<PulseFlowEvidence> {
  const allowedFlowIds = new Set(input.flowIds || []);
  const specs = getApplicableSpecs(input.environment, input.manifest).filter(
    (spec) => allowedFlowIds.size === 0 || allowedFlowIds.has(spec.id),
  );
  const loadedChecks = getLoadedCheckNames(input.parserInventory);
  const results: PulseFlowResult[] = [];
  const runtimeContext: FlowRuntimeContext = {
    manifest: input.manifest,
    runtimeResolution: getRuntimeResolution(),
    authPromise: null,
  };

  for (const spec of specs) {
    const result = await evaluateFlowSpec(spec, input, loadedChecks, runtimeContext);
    results.push(result);
  }

  return {
    declared: specs.map((spec) => spec.id),
    executed: results.filter((item) => item.executed).map((item) => item.flowId),
    missing: results
      .filter((item) => item.status === 'missing_evidence')
      .map((item) => item.flowId),
    passed: results.filter((item) => item.status === 'passed').map((item) => item.flowId),
    failed: results.filter((item) => item.status === 'failed').map((item) => item.flowId),
    accepted: results.filter((item) => item.accepted).map((item) => item.flowId),
    artifactPaths:
      specs.length > 0
        ? [...new Set([FLOW_ARTIFACT, ...results.flatMap((item) => item.artifactPaths)])]
        : [],
    summary: buildSummary(results),
    results,
  };
}
