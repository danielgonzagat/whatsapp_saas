import { ChatCompletionTool } from 'openai/resources/chat';

/**
 * KLOEL CHAT TOOLS partition — marketing / channel SEND tools (Wave7 L5).
 *
 * Tool-schema (OpenAI `ChatCompletionTool`) mirror of the Tier-12 marketing
 * capabilities defined in
 * `capability-registry-v2/partitions/tier-12-marketing.ts`. Tool names match
 * the capability `id`s 1:1 so the `KloelDomainServiceResolver` can route each
 * call to its canonical `domainService`:
 *
 *  - whatsapp.send_message  → ChannelMessageDispatch.dispatchTool (channel=whatsapp)
 *  - whatsapp.send_campaign → CampaignService.launchTool
 *  - whatsapp.get_chat_status → WhatsAppService.getConnectionStatus
 *  - instagram.send_dm      → ChannelMessageDispatch.dispatchTool (channel=instagram)
 *  - facebook.create_ad_draft → ChannelMessageDispatch.createAdDraftTool (honest setup-required)
 *  - tiktok.create_ad_draft   → ChannelMessageDispatch.createAdDraftTool (honest setup-required)
 *  - email.send             → ChannelMessageDispatch.dispatchTool (channel=email)
 *  - email.send_campaign    → CampaignService.launchTool
 *
 * Sends are MUTATION_SENSITIVE; confirmation is enforced by the capability
 * definition (`requiresConfirmation: true`). Channels without a real outbound
 * integration resolve to an honest blocked/setup-required result — never fake
 * success. This is a standalone export; it is intentionally NOT folded into the
 * shared `KLOEL_CHAT_TOOLS` aggregator here.
 *
 * @see backend/src/kloel/capability-registry-v2/partitions/tier-12-marketing.ts
 * @see backend/src/marketing/channel-message-dispatch.service.ts
 */
export const KLOEL_CHAT_TOOLS_MARKETING: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'whatsapp.send_message',
      description:
        'Envia uma mensagem de WhatsApp para um contato pelo dispatcher canônico de canais. Retorna resultado bloqueado honesto se o canal não estiver configurado.',
      parameters: {
        type: 'object',
        properties: {
          channel: {
            type: 'string',
            description: 'Canal de envio (default: whatsapp)',
          },
          to: {
            type: 'string',
            description: 'Telefone/identificador do destinatário',
          },
          message: { type: 'string', description: 'Texto da mensagem' },
          mediaUrl: { type: 'string', description: 'URL de mídia opcional' },
        },
        required: ['to', 'message'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'whatsapp.send_campaign',
      description:
        'Dispara uma campanha de WhatsApp já criada para o público configurado. Ação sensível, exige confirmação.',
      parameters: {
        type: 'object',
        properties: {
          campaignId: { type: 'string', description: 'ID da campanha a disparar' },
          useSmartTime: {
            type: 'boolean',
            description: 'Disparar no melhor horário calculado',
          },
        },
        required: ['campaignId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'whatsapp.get_chat_status',
      description: 'Consulta o status de conexão/sessão do WhatsApp do workspace (read-only).',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'instagram.send_dm',
      description:
        'Envia uma mensagem direct via Instagram pelo dispatcher canônico de canais. Retorna resultado bloqueado honesto se a conexão Meta/Instagram não estiver configurada.',
      parameters: {
        type: 'object',
        properties: {
          channel: {
            type: 'string',
            description: 'Canal de envio (default: instagram)',
          },
          to: {
            type: 'string',
            description: 'ID do destinatário no Instagram',
          },
          message: { type: 'string', description: 'Texto da mensagem' },
        },
        required: ['to', 'message'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'facebook.create_ad_draft',
      description:
        'Cria um rascunho de anúncio no Facebook. Integração de Ads ainda não configurada: retorna setup-required honesto, nunca sucesso falso.',
      parameters: {
        type: 'object',
        properties: {
          platform: { type: 'string', description: 'Plataforma de anúncio' },
          message: { type: 'string', description: 'Texto do anúncio' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'tiktok.create_ad_draft',
      description:
        'Cria um rascunho de anúncio no TikTok. Integração de Ads ainda não configurada: retorna setup-required honesto, nunca sucesso falso.',
      parameters: {
        type: 'object',
        properties: {
          platform: { type: 'string', description: 'Plataforma de anúncio' },
          message: { type: 'string', description: 'Texto do anúncio' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'email.send',
      description:
        'Envia um email para um destinatário pelo dispatcher canônico de canais. Retorna resultado bloqueado honesto se o canal de email não estiver configurado.',
      parameters: {
        type: 'object',
        properties: {
          channel: {
            type: 'string',
            description: 'Canal de envio (default: email)',
          },
          to: { type: 'string', description: 'Email do destinatário' },
          subject: { type: 'string', description: 'Assunto do email' },
          message: { type: 'string', description: 'Corpo do email' },
          html: { type: 'string', description: 'Corpo HTML opcional' },
        },
        required: ['to', 'message'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'email.send_campaign',
      description:
        'Dispara uma campanha de email já criada para o público configurado. Ação sensível, exige confirmação.',
      parameters: {
        type: 'object',
        properties: {
          campaignId: { type: 'string', description: 'ID da campanha a disparar' },
          useSmartTime: {
            type: 'boolean',
            description: 'Disparar no melhor horário calculado',
          },
        },
        required: ['campaignId'],
      },
    },
  },
];
