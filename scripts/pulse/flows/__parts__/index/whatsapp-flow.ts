import type {
  PulseManifestFlowSpec,
  PulseFlowResult,
  PulseBrowserFailureCode,
} from '../../../types';
import type { FlowRuntimeContext } from './types-and-config';
import {
  isTruthyEnv,
  getReplayPhone,
  getConfiguredTestPhone,
  normalizePhone,
  compactSummary,
  isProvisioningGap,
  replayEnabled,
} from './mode-helpers';
import {
  ensureAuth,
  fetchJsonWithAuth,
  buildMissingEvidenceResult,
  buildFailureResult,
  buildPassedResult,
} from './http-helpers';

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function inferWhatsappFailureCode(summary: string): PulseBrowserFailureCode {
  const lowered = summary.toLowerCase();
  if (lowered.includes('unauthorized') || lowered.includes('auth')) {
    return 'backend_auth_unreachable';
  }
  return 'backend_auth_unreachable';
}

export async function runWhatsappMessageFlow(
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

    const inboundMarker = `PULSE:IN:${Date.now().toString(36)}`;
    const outboundMarker = `PULSE:OUT:${Date.now().toString(36)}`;

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
    let readbackCount = 0;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const conversationsRes = await fetchJsonWithAuth(
        'GET',
        `/inbox/${auth.workspaceId}/conversations`,
        auth.token,
      );

      if (!conversationsRes.ok) {
        await wait(1000);
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
        await wait(1000);
        continue;
      }

      matchedConversationId = String(matchedConversation.id);
      const messagesRes = await fetchJsonWithAuth(
        'GET',
        `/inbox/conversations/${matchedConversationId}/messages`,
        auth.token,
      );

      if (!messagesRes.ok) {
        await wait(1000);
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

      for (let attempt = 0; attempt < 8; attempt += 1) {
        const messagesRes = await fetchJsonWithAuth(
          'GET',
          `/inbox/conversations/${matchedConversationId}/messages`,
          auth.token,
        );
        if (!messagesRes.ok) {
          await wait(1500);
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

        await wait(1500);
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
