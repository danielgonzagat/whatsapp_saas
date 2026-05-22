import { randomUUID } from 'node:crypto';
import type { InboundMessage } from '../../src/whatsapp/inbound-processor.service';

export interface SyntheticInboundParams {
  workspaceId: string;
  phone?: string;
  text?: string;
  providerMessageId?: string;
  ingestMode?: 'live' | 'catchup';
  createdAt?: Date;
  provider?: 'meta-cloud' | 'whatsapp-api';
}

export function buildWhatsappInboundText(
  params: SyntheticInboundParams,
): InboundMessage {
  const phone = params.phone ?? '5511998887777';
  const providerMessageId =
    params.providerMessageId ?? `wamid.${randomUUID()}`;

  return {
    workspaceId: params.workspaceId,
    provider: params.provider ?? 'meta-cloud',
    ingestMode: params.ingestMode ?? 'live',
    createdAt: params.createdAt ?? new Date(),
    providerMessageId,
    from: `${phone}@s.whatsapp.net`,
    to: '5511999999999@c.us',
    type: 'text',
    text: params.text ?? 'Oi, quero saber mais!',
    senderName: 'Lead Test',
    raw: {
      pushName: 'Lead Test',
      notifyName: 'Lead Test',
      _data: {
        pushName: 'Lead Test',
        notifyName: 'Lead Test',
      },
      message: {
        pushName: 'Lead Test',
        message_id: providerMessageId,
      },
    },
  };
}

export function buildPriceObjectionInbound(
  params: SyntheticInboundParams,
): InboundMessage {
  return buildWhatsappInboundText({
    ...params,
    text: params.text ?? 'Achei caro, tem desconto? Quero comprar!',
  });
}

export function buildHotLeadInbound(
  params: SyntheticInboundParams,
): InboundMessage {
  return buildWhatsappInboundText({
    ...params,
    text: params.text ?? 'Manda o link que eu fecho agora no pix!',
  });
}

export function buildInboundReply(
  params: SyntheticInboundParams,
): InboundMessage {
  const phone = params.phone ?? '5511998887777';
  const providerMessageId =
    params.providerMessageId ?? `wamid.reply.${randomUUID()}`;

  return {
    workspaceId: params.workspaceId,
    provider: params.provider ?? 'meta-cloud',
    ingestMode: params.ingestMode ?? 'live',
    createdAt: new Date(),
    providerMessageId,
    from: `${phone}@s.whatsapp.net`,
    to: '5511999999999@c.us',
    type: 'text',
    text: 'Obrigado! Vou fechar sim.',
    senderName: 'Lead Test',
    raw: {
      pushName: 'Lead Test',
      message: { message_id: providerMessageId },
    },
  };
}

export function buildChannelSetupSeed(workspaceId: string) {
  return {
    workspaceId,
    channel: 'whatsapp',
    completedAt: new Date(),
    currentStep: 3,
    lastReconfiguredAt: new Date(),
  };
}

export function buildArsenalAsset(workspaceId: string) {
  return {
    workspaceId,
    channel: 'whatsapp',
    assetId: 'asset-text-01',
    type: 'text',
    label: 'Mensagem padrão',
    storageRef: 's3://channel-arsenal/ws/asset-text-01',
    metadata: { publicUrl: 'https://cdn.example.com/asset-text-01' },
  };
}

export function buildPipelineActiveState(workspaceId: string) {
  return {
    id: 'pipeline-ws',
    workspaceId,
    state: 'active' as const,
    transitionedAt: new Date(),
    fallbackRate1h: 0,
  };
}

export function buildDecisionOutcomeKey(params: {
  workspaceId: string;
  channel: string;
  concept: string;
}) {
  return `outcome:${params.workspaceId}:${params.channel}:${params.concept}`;
}

export function buildChannelConfig(workspaceId: string) {
  return {
    workspaceId,
    channel: 'whatsapp',
    tone: 'consultivo',
    aggressiveness: 'normal',
    followupEnabled: true,
    dailyMessageLimit: 20,
  };
}
