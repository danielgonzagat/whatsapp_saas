import { type CapabilityDefinition } from '../capability-registry-v2.types';

/**
 * KLOEL CAPABILITY REGISTRY partition — Tier 12 (marketing / channel sends).
 *
 * Extracted from capability-registry-v2.const.ts.
 * Consumers should import CAPABILITY_DEFINITIONS from the barrel
 * '../capability-registry-v2.const' rather than this partition directly.
 *
 * Wave7 L5 — outbound cross-channel SEND capabilities. Every send routes
 * through the ONE canonical dispatch façade
 * (`ChannelMessageDispatchService.dispatchTool`, resolver token
 * `ChannelMessageDispatch`) or the campaign service
 * (`CampaignsService.launchTool`, resolver token `CampaignService`). Sends are
 * MUTATION_SENSITIVE → `requiresConfirmation: true`. Channels lacking real
 * outbound integration (facebook/tiktok ad drafts) resolve to an honest
 * setup-required/blocked result — never a fake success.
 *
 * @see backend/src/marketing/channel-message-dispatch.service.ts
 * @see backend/src/kloel/domain-service-resolver.service.ts
 */
export const TIER_12_MARKETING_CAPABILITIES: CapabilityDefinition[] = [
  {
    id: 'whatsapp.send_message',
    title: 'Enviar mensagem WhatsApp',
    description:
      'Envia uma mensagem de WhatsApp para um contato, roteando pelo dispatcher canônico de canais',
    category: 'MUTATION_SENSITIVE',
    tier: 12,
    requiresConfirmation: true,
    requiredPermissions: ['whatsapp:write'],
    inputSchema: [
      {
        key: 'channel',
        type: 'string',
        label: 'Canal',
        required: false,
        description: 'Canal de envio (default whatsapp)',
      },
      { key: 'to', type: 'string', label: 'Telefone', required: true },
      { key: 'message', type: 'string', label: 'Mensagem', required: true },
    ],
    domainService: 'ChannelMessageDispatch.dispatchTool',
    emits: ['channel.message_sent'],
    surface: ['dashboard-chat'],
  },
  {
    id: 'whatsapp.send_campaign',
    title: 'Disparar campanha WhatsApp',
    description: 'Dispara uma campanha de WhatsApp já criada para o público configurado',
    category: 'MUTATION_SENSITIVE',
    tier: 12,
    requiresConfirmation: true,
    requiredPermissions: ['campaign:write', 'whatsapp:write'],
    inputSchema: [
      { key: 'campaignId', type: 'string', label: 'ID da campanha', required: true },
      {
        key: 'useSmartTime',
        type: 'boolean',
        label: 'Usar melhor horário',
        required: false,
      },
    ],
    domainService: 'CampaignService.launchTool',
    emits: ['channel.message_sent'],
    surface: ['dashboard-chat'],
  },
  {
    id: 'whatsapp.get_chat_status',
    title: 'Status da conexão WhatsApp',
    description: 'Consulta o status de conexão/sessão do WhatsApp do workspace',
    category: 'QUERY',
    tier: 12,
    requiresConfirmation: false,
    requiredPermissions: [],
    inputSchema: [],
    domainService: 'WhatsAppService.getConnectionStatus',
    emits: [],
    surface: ['dashboard-chat'],
  },
  {
    id: 'instagram.send_dm',
    title: 'Enviar DM Instagram',
    description:
      'Envia mensagem direct via Instagram para um contato, roteando pelo dispatcher canônico de canais',
    category: 'MUTATION_SENSITIVE',
    tier: 12,
    requiresConfirmation: true,
    requiredPermissions: ['instagram:write'],
    inputSchema: [
      {
        key: 'channel',
        type: 'string',
        label: 'Canal',
        required: false,
        description: 'Canal de envio (default instagram)',
      },
      { key: 'to', type: 'string', label: 'Destinatário', required: true },
      { key: 'message', type: 'string', label: 'Mensagem', required: true },
    ],
    domainService: 'ChannelMessageDispatch.dispatchTool',
    emits: ['channel.message_sent'],
    surface: ['dashboard-chat'],
  },
  {
    id: 'facebook.create_ad_draft',
    title: 'Criar rascunho de anúncio Facebook',
    description:
      'Cria um rascunho de anúncio no Facebook (setup-required honesto: integração de Ads ainda não configurada)',
    category: 'MUTATION_SENSITIVE',
    tier: 12,
    requiresConfirmation: true,
    requiredPermissions: ['ads:write'],
    inputSchema: [
      { key: 'platform', type: 'string', label: 'Plataforma', required: false },
      { key: 'message', type: 'string', label: 'Texto do anúncio', required: false },
    ],
    domainService: 'ChannelMessageDispatch.createAdDraftTool',
    emits: [],
    surface: ['dashboard-chat'],
    maturity: 'blocked',
  },
  {
    id: 'tiktok.create_ad_draft',
    title: 'Criar rascunho de anúncio TikTok',
    description:
      'Cria um rascunho de anúncio no TikTok (setup-required honesto: integração de Ads ainda não configurada)',
    category: 'MUTATION_SENSITIVE',
    tier: 12,
    requiresConfirmation: true,
    requiredPermissions: ['ads:write'],
    inputSchema: [
      { key: 'platform', type: 'string', label: 'Plataforma', required: false },
      { key: 'message', type: 'string', label: 'Texto do anúncio', required: false },
    ],
    domainService: 'ChannelMessageDispatch.createAdDraftTool',
    emits: [],
    surface: ['dashboard-chat'],
    maturity: 'blocked',
  },
  {
    id: 'email.send',
    title: 'Enviar email',
    description:
      'Envia um email para um destinatário, roteando pelo dispatcher canônico de canais',
    category: 'MUTATION_SENSITIVE',
    tier: 12,
    requiresConfirmation: true,
    requiredPermissions: ['email:write'],
    inputSchema: [
      {
        key: 'channel',
        type: 'string',
        label: 'Canal',
        required: false,
        description: 'Canal de envio (default email)',
      },
      { key: 'to', type: 'string', label: 'Destinatário', required: true },
      { key: 'subject', type: 'string', label: 'Assunto', required: false },
      { key: 'message', type: 'string', label: 'Corpo', required: true },
    ],
    domainService: 'ChannelMessageDispatch.dispatchTool',
    emits: ['channel.message_sent'],
    surface: ['dashboard-chat'],
  },
  {
    id: 'email.send_campaign',
    title: 'Disparar campanha de email',
    description: 'Dispara uma campanha de email já criada para o público configurado',
    category: 'MUTATION_SENSITIVE',
    tier: 12,
    requiresConfirmation: true,
    requiredPermissions: ['campaign:write', 'email:write'],
    inputSchema: [
      { key: 'campaignId', type: 'string', label: 'ID da campanha', required: true },
      {
        key: 'useSmartTime',
        type: 'boolean',
        label: 'Usar melhor horário',
        required: false,
      },
    ],
    domainService: 'CampaignService.launchTool',
    emits: ['channel.message_sent'],
    surface: ['dashboard-chat'],
  },
];
