import { Prisma } from '@prisma/client';
import { prisma } from './db';
import { buildQueueJobId } from './job-id';
import { WorkerLogger } from './logger';
import { autopilotDecisionCounter } from './metrics';
import { PlanLimitsProvider } from './providers/plan-limits';
import { dispatchOutboundThroughFlow } from './providers/outbound-dispatcher';
import { forEachSequential } from './utils/async-sequence';
import { getErrorMessage } from './utils/error-message';
import { SALES_TEMPLATES, renderTemplate } from './constants/sales-templates';
import {
  type AutopilotDecision,
  type AutopilotSettings,
  asJsonObject,
  classifyByKeywords,
  computeBestHour,
  ensureOptInAllowed,
  isAutonomyActive,
  jsonDateMillis,
  parseAutopilotSettings,
} from './autopilot-scanner.helpers';

const log = new WorkerLogger('autopilot-scanner');

const JSON_RE = /```json/g;
const PATTERN_RE = /```/g;
const PRE__VALOR_CUSTA_PIX_BO_RE = /(preç|valor|custa|pix|boleto|pag|assin|compr|checkout|fechar)/i;

async function classifyWithAi(text: string, apiKey: string): Promise<AutopilotDecision | null> {
  try {
    const { AIProvider } = await import('./providers/ai-provider');
    const ai = new AIProvider(apiKey);
    const prompt = `
      Classifique a intenção para atendimento de vendas em JSON:
      Campos: intent (BUYING|SCHEDULING|SUPPORT|OBJECTION|CHURN_RISK|UPSELL|IDLE), action (SEND_OFFER|SEND_PRICE|SEND_CALENDAR|TRANSFER_AGENT|FOLLOW_UP|HANDLE_OBJECTION|ANTI_CHURN|UPSELL|NONE), reason.
      Mensagem: "${text}"
      `;
    const res = await ai.generateResponse('Responda apenas JSON.', prompt);
    const parsed = JSON.parse(res.replace(JSON_RE, '').replace(PATTERN_RE, ''));
    return {
      intent: parsed.intent || 'IDLE',
      action: parsed.action || 'NONE',
      reason: parsed.reason || 'ai_decision',
    };
  } catch {
    return null;
  }
}

async function decideAction(
  messageContent: string,
  settings: AutopilotSettings,
): Promise<AutopilotDecision> {
  const text = messageContent || '';

  const keywordDecision = classifyByKeywords(text);
  if (keywordDecision) {
    return keywordDecision;
  }

  const apiKey = settings?.openai?.apiKey || process.env.OPENAI_API_KEY;
  if (apiKey) {
    const aiDecision = await classifyWithAi(text, apiKey);
    if (aiDecision) {
      return aiDecision;
    }
  }

  return { intent: 'IDLE', action: 'FOLLOW_UP', reason: 'default_follow_up' };
}

async function generateTemplate(
  action: string,
  message: string,
  settings: AutopilotSettings,
): Promise<string> {
  const calendarLink: string | undefined =
    settings?.providerSettings?.calendarLink || settings?.calendarLink || undefined;

  if (action === 'SEND_OFFER' || action === 'OFFER') {
    const apiKey = settings?.openai?.apiKey || process.env.OPENAI_API_KEY;
    if (apiKey) {
      try {
        const { AIProvider } = await import('./providers/ai-provider');
        const ai = new AIProvider(apiKey);
        return await ai.generateResponse(
          'Você é um closer conciso. Gere uma oferta curta com CTA.',
          `Mensagem do lead: "${message || 'sem contexto'}". Gere uma oferta direta.`,
        );
      } catch {
        // fallback to static OFFER template below
      }
    }
    return renderTemplate('OFFER', { ...(calendarLink ? { calendarLink } : {}) });
  }

  const key = action as keyof typeof SALES_TEMPLATES;
  if (key in SALES_TEMPLATES) {
    return renderTemplate(key, { ...(calendarLink ? { calendarLink } : {}) });
  }
  return renderTemplate('FOLLOW_UP', { ...(calendarLink ? { calendarLink } : {}) });
}

export async function autopilotScanner() {
  try {
    const workspaces = await prisma.workspace.findMany({
      select: { id: true, providerSettings: true, jitterMin: true, jitterMax: true },
    });

    await forEachSequential(workspaces, async (workspace) => {
      const settings = parseAutopilotSettings(workspace.providerSettings);
      if (!isAutonomyActive(settings)) {
        return;
      }

      const convs = await prisma.conversation.findMany({
        where: { workspaceId: workspace.id, status: 'OPEN' },
        orderBy: { updatedAt: 'desc' },
        take: 50,
        include: {
          contact: { include: { tags: { select: { name: true } } } },
          messages: { take: 1, orderBy: { createdAt: 'desc' } },
        },
      });

      await forEachSequential(convs, async (conv) => {
        const lastMsg = conv.messages[0];
        if (!lastMsg) {
          return;
        }

        const cf = asJsonObject(conv.contact?.customFields);
        const lastActionAt = jsonDateMillis(cf.autopilotLastActionAt);
        const nextRetryAt = jsonDateMillis(cf.autopilotNextRetryAt);
        if (nextRetryAt && nextRetryAt > Date.now()) {
          return;
        }
        if (lastActionAt && Date.now() - lastActionAt < 2 * 60 * 60 * 1000) {
          return;
        }

        const now = Date.now();
        const ageHours = (now - new Date(lastMsg.createdAt).getTime()) / 3600000;
        const isInbound = lastMsg.direction === 'INBOUND';
        const text = (lastMsg.content || '').toLowerCase();
        const buyingSignal = PRE__VALOR_CUSTA_PIX_BO_RE.test(text);
        const shouldFollowUp =
          (ageHours >= 12 && lastMsg.direction === 'OUTBOUND') || (ageHours >= 24 && isInbound);
        const antiChurn = ageHours >= 72;

        if (!isInbound && !shouldFollowUp && !antiChurn) {
          return;
        }

        const hour = new Date().getHours();
        const isNight = hour >= 22 || hour < 7;
        const decision = antiChurn
          ? { intent: 'CHURN_RISK', action: 'ANTI_CHURN', reason: 'silent_72h' }
          : buyingSignal && isInbound && ageHours >= 6
            ? { intent: 'BUYING_SIGNAL', action: 'GHOST_CLOSER', reason: 'silent_buying_signal' }
            : shouldFollowUp
              ? { intent: 'REENGAGE', action: 'FOLLOW_UP_STRONG', reason: 'silent_24h' }
              : await decideAction(lastMsg.content || '', settings);
        const action = decision.action || 'FOLLOW_UP';

        try {
          const messageToSend = await generateTemplate(
            isNight && (decision.intent === 'BUYING' || action === 'SEND_OFFER')
              ? 'NIGHT_SOFT'
              : action,
            lastMsg.content || '',
            settings,
          );
          if (!messageToSend) {
            return;
          }

          const subscription = await PlanLimitsProvider.checkSubscriptionStatus(conv.workspaceId);
          if (!subscription.active) {
            throw new Error(subscription.reason || 'subscription_inactive');
          }
          const msgLimit = await PlanLimitsProvider.checkMessageLimit(conv.workspaceId);
          if (!msgLimit.allowed) {
            throw new Error(msgLimit.reason || 'message_limit');
          }

          await ensureOptInAllowed(conv.workspaceId, conv.contact);

          const bestHour = await computeBestHour(conv.workspaceId);
          const currentHour = new Date().getHours();
          const withinPrime = Math.abs(currentHour - bestHour) <= 2;
          const isHotAction = action === 'SEND_OFFER' || action === 'SEND_PRICE';
          if (!withinPrime && !isHotAction) {
            return;
          }

          let status: 'executed' | 'error' = 'executed';
          let errorMsg: string | undefined;
          try {
            await dispatchOutboundThroughFlow({
              workspaceId: conv.workspaceId,
              to: conv.contact.phone,
              message: messageToSend,
              jobId: buildQueueJobId(
                'legacy-scanner',
                conv.workspaceId,
                conv.contactId,
                Date.now(),
              ),
            });
          } catch (err: unknown) {
            status = 'error';
            errorMsg = getErrorMessage(err);
            throw err;
          } finally {
            const newCf = {
              ...(cf || {}),
              autopilotLastAction: action,
              autopilotLastActionAt: new Date().toISOString(),
              autopilotNextRetryAt: null,
            };
            const auditDetails: Prisma.InputJsonObject = {
              intent: decision.intent || 'UNKNOWN',
              action,
              reason: decision.reason || 'auto',
              message: messageToSend,
              status,
              ...(errorMsg ? { error: errorMsg } : {}),
            };
            await prisma.contact.updateMany({
              where: { id: conv.contactId, workspaceId: conv.workspaceId },
              data: { customFields: newCf as Prisma.InputJsonObject },
            });

            await prisma.auditLog.create({
              data: {
                action: 'AUTOPILOT_ACTION',
                resource: 'contact',
                resourceId: conv.contactId,
                details: auditDetails,
                workspaceId: conv.workspaceId,
              },
            });

            autopilotDecisionCounter.inc({
              workspaceId: conv.workspaceId,
              intent: decision.intent || 'UNKNOWN',
              action,
              result: status,
            });
          }
        } catch (err: unknown) {
          log.warn('autopilot_scan_error', { error: getErrorMessage(err), convId: conv.id });
        }
      });
    });
  } catch (err: unknown) {
    log.error('autopilot_scan_loop_error', { error: getErrorMessage(err) });
  }
}
