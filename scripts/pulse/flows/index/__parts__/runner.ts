import type { PulseFlowEvidence, PulseFlowResult } from '../../../types.convergence';
import type { PulseManifestFlowSpec } from '../../../types.manifest';
import {
  deriveUnitValue,
  deriveZeroValue,
} from '../../../dynamic-reality-kernel/__parts__/catalog-arithmetic';
import { getRuntimeResolution } from '../../../parsers/runtime-utils';
import { summarizeDynamicFindingEvents } from '../../../finding-identity';
import {
  BASE_36_RADIX,
  BASE_WAIT_MS,
  buildFailureResult,
  buildMissingEvidenceResult,
  buildPassedResult,
  collectMatchingBreaks,
  compactSummary,
  ensureAuth,
  fetchJsonWithAuth,
  FLOW_ACCEPTED,
  FLOW_ARTIFACT,
  FLOW_FAILED,
  FLOW_PASSED,
  FlowRuntimeContext,
  getActiveFlowAcceptance,
  getApplicableSpecs,
  getArtifactPaths,
  getConfiguredTestPhone,
  getLoadedCheckNames,
  getReplayPhone,
  GFC_CHECKER_GAP,
  GFC_MISSING_EVIDENCE,
  GFC_PRODUCT_FAILURE,
  inferWhatsappFailureCode,
  isProvisioningGap,
  isTruthyEnv,
  LONG_WAIT_MS,
  MAX_READBACK_ATTEMPTS,
  normalizePhone,
  ORACLE_BREAK_PATTERNS,
  replayEnabled,
  RunDeclaredFlowsInput,
  shouldRunConversationPersistedFlow,
  smokeEnabled,
} from './helpers';
import { runWalletWithdrawalFlow, wait } from './wallet';

async function runWhatsappMessageFlow(
  spec: PulseManifestFlowSpec,
  context: FlowRuntimeContext,
): Promise<PulseFlowResult> {
  try {
    const auth = await ensureAuth(context);
    const smokeMode = isTruthyEnv(process.env.PULSE_ALLOW_REAL_WHATSAPP_SEND);
    const testPhone = smokeMode
      ? normalizePhone(getConfiguredTestPhone(context.manifest))
      : getReplayPhone(context.manifest);

    if (smokeMode && !testPhone) {
      return buildMissingEvidenceResult(
        spec,
        'whatsapp-message-send requires an explicit PULSE_TEST_PHONE or adapterConfig.pulseTestPhone to execute the real send smoke safely.',
        undefined,
        { smokeExecuted: false, replayExecuted: replayEnabled(spec) },
      );
    }

    const inboundMarker = `PULSE:IN:${Date.now().toString(BASE_36_RADIX)}`;
    const outboundMarker = `PULSE:OUT:${Date.now().toString(BASE_36_RADIX)}`;

    await fetchJsonWithAuth('POST', `/whatsapp/${auth.workspaceId}/opt-in/bulk`, auth.token, {
      phones: [testPhone],
    });

    const incomingRes = await fetchJsonWithAuth(
      'POST',
      `/whatsapp/${auth.workspaceId}/incoming`,
      auth.token,
      { from: testPhone, message: inboundMarker },
    );

    if (!incomingRes.ok || incomingRes.body?.error) {
      const summary = compactSummary(incomingRes.body) || `HTTP ${incomingRes.status}`;
      return isProvisioningGap(summary)
        ? buildMissingEvidenceResult(
            spec,
            `whatsapp-message-send replay could not seed the conversation: ${summary}.`,
            { httpStatus: incomingRes.status, failureCode: inferWhatsappFailureCode(summary) },
            { smokeExecuted: false, replayExecuted: true },
          )
        : buildFailureResult(
            spec,
            `whatsapp-message-send replay failed while seeding the conversation: ${summary}.`,
            { httpStatus: incomingRes.status },
            { smokeExecuted: false, replayExecuted: true },
          );
    }

    let matchedConversationId = '';
    let inboundMessageId = '';
    let outboundMessageId = '';
    let readbackCount = deriveZeroValue();

    for (
      let attempt = deriveZeroValue();
      attempt < MAX_READBACK_ATTEMPTS;
      attempt += deriveUnitValue()
    ) {
      const conversationsRes = await fetchJsonWithAuth(
        'GET',
        `/inbox/${auth.workspaceId}/conversations`,
        auth.token,
      );

      if (!conversationsRes.ok) {
        await wait(BASE_WAIT_MS);
        continue;
      }

      const conversations = Array.isArray(conversationsRes.body)
        ? (conversationsRes.body as Array<Record<string, unknown>>)
        : [];
      const matchedConversation = conversations.find((item) => {
        const contact = item.contact as Record<string, unknown> | undefined;
        return normalizePhone(String(contact?.phone || '')) === testPhone;
      });

      if (!matchedConversation?.id) {
        await wait(BASE_WAIT_MS);
        continue;
      }

      matchedConversationId = String(matchedConversation.id);
      const messagesRes = await fetchJsonWithAuth(
        'GET',
        `/inbox/conversations/${matchedConversationId}/messages`,
        auth.token,
      );

      if (!messagesRes.ok) {
        await wait(BASE_WAIT_MS);
        continue;
      }

      const messages = Array.isArray(messagesRes.body)
        ? (messagesRes.body as Array<Record<string, unknown>>)
        : [];
      readbackCount = messages.length;
      const matchedInbound = messages.find((item) =>
        String(item.content || '').includes(inboundMarker),
      );
      if (matchedInbound) {
        inboundMessageId = String(matchedInbound.id || '');
        break;
      }

      await wait(1000);
    }

    if (!matchedConversationId || !inboundMessageId) {
      return buildFailureResult(
        spec,
        'whatsapp-message-send replay could not observe the seeded inbound message in the inbox readback window.',
        {
          testPhone,
          inboundMarker,
          conversationFound: Boolean(matchedConversationId),
          readbackCount,
        },
        { smokeExecuted: false, replayExecuted: true },
      );
    }

    if (smokeMode) {
      const sendRes = await fetchJsonWithAuth(
        'POST',
        `/whatsapp/${auth.workspaceId}/send`,
        auth.token,
        { to: testPhone, message: outboundMarker, externalId: outboundMarker },
      );

      if (!sendRes.ok || sendRes.body?.error) {
        const summary = compactSummary(sendRes.body) || `HTTP ${sendRes.status}`;
        return isProvisioningGap(summary)
          ? buildMissingEvidenceResult(
              spec,
              `whatsapp-message-send could not execute in the current runtime: ${summary}.`,
              {
                httpStatus: sendRes.status,
                failureCode: inferWhatsappFailureCode(summary),
              },
              { smokeExecuted: false, replayExecuted: true },
            )
          : buildFailureResult(
              spec,
              `whatsapp-message-send request failed: ${summary}.`,
              {
                httpStatus: sendRes.status,
              },
              { smokeExecuted: true, replayExecuted: true },
            );
      }

      for (
        let attempt = deriveZeroValue();
        attempt < MAX_READBACK_ATTEMPTS;
        attempt += deriveUnitValue()
      ) {
        const messagesRes = await fetchJsonWithAuth(
          'GET',
          `/inbox/conversations/${matchedConversationId}/messages`,
          auth.token,
        );
        if (!messagesRes.ok) {
          await wait(LONG_WAIT_MS);
          continue;
        }

        const messages = Array.isArray(messagesRes.body)
          ? (messagesRes.body as Array<Record<string, unknown>>)
          : [];
        readbackCount = messages.length;
        const matchedOutbound = messages.find((item) => {
          const content = String(item.content || '');
          const externalId = String(item.externalId || '');
          return content.includes(outboundMarker) || externalId === outboundMarker;
        });

        if (matchedOutbound) {
          outboundMessageId = String(matchedOutbound.id || '');
          break;
        }

        await wait(LONG_WAIT_MS);
      }

      if (!outboundMessageId) {
        return buildFailureResult(
          spec,
          'whatsapp-message-send returned success but the inbox persistence oracle did not observe the outbound message in the conversation readback window.',
          {
            testPhone,
            inboundMarker,
            outboundMarker,
            conversationId: matchedConversationId,
            readbackCount,
          },
          { smokeExecuted: true, replayExecuted: true },
        );
      }

      return buildPassedResult(
        spec,
        `whatsapp-message-send passed with conversation ${matchedConversationId} and outbound message ${outboundMessageId}.`,
        {
          testPhone,
          inboundMarker,
          outboundMarker,
          conversationId: matchedConversationId,
          inboundMessageId,
          messageId: outboundMessageId,
          readbackCount,
        },
        { smokeExecuted: true, replayExecuted: true },
      );
    }

    return buildPassedResult(
      spec,
      `whatsapp-message-send replay passed via seeded inbox conversation ${matchedConversationId}. Final outbound smoke remains opt-in.`,
      {
        testPhone,
        inboundMarker,
        conversationId: matchedConversationId,
        inboundMessageId,
        readbackCount,
        smokePending: spec.smokeRequired,
      },
      { smokeExecuted: false, replayExecuted: true },
    );
  } catch (error) {
    return buildMissingEvidenceResult(
      spec,
      `whatsapp-message-send could not authenticate or reach runtime prerequisites: ${(error as Error).message}.`,
      undefined,
      { smokeExecuted: false, replayExecuted: replayEnabled(spec) },
    );
  }
}

function buildCheckerGapResult(
  spec: PulseManifestFlowSpec,
  missingChecks: string[],
): PulseFlowResult {
  return {
    flowId: spec.id,
    status: FLOW_FAILED,
    executed: false,
    accepted: false,
    providerModeUsed: spec.providerMode,
    smokeExecuted: false,
    replayExecuted: replayEnabled(spec),
    failureClass: GFC_CHECKER_GAP,
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
      status: FLOW_ACCEPTED,
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
        status: FLOW_FAILED,
        executed: true,
        accepted: false,
        providerModeUsed: spec.providerMode,
        smokeExecuted: smokeEnabled(spec),
        replayExecuted: replayEnabled(spec),
        failureClass: GFC_PRODUCT_FAILURE,
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
      status: FLOW_PASSED,
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

  const passed = results.filter((item) => item.status === FLOW_PASSED).length;
  const failed = results.filter((item) => item.status === FLOW_FAILED).length;
  const accepted = results.filter((item) => item.status === FLOW_ACCEPTED).length;
  const missing = results.filter((item) => item.status === GFC_MISSING_EVIDENCE).length;

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
      .filter((item) => item.status === GFC_MISSING_EVIDENCE)
      .map((item) => item.flowId),
    passed: results.filter((item) => item.status === FLOW_PASSED).map((item) => item.flowId),
    failed: results.filter((item) => item.status === FLOW_FAILED).map((item) => item.flowId),
    accepted: results.filter((item) => item.accepted).map((item) => item.flowId),
    artifactPaths:
      specs.length > 0
        ? [...new Set([FLOW_ARTIFACT, ...results.flatMap((item) => item.artifactPaths)])]
        : [],
    summary: buildSummary(results),
    results,
  };
}
