export const ACCOUNT_CAPABILITY_REGISTRY_VERSION =
  'account-capability-registry/2026-03-20.v1';
export const CONVERSATION_ACTION_REGISTRY_VERSION =
  'conversation-action-registry/2026-03-20.v1';

export interface AccountCapabilityDefinition {
  code: string;
  domain:
    | 'whatsapp'
    | 'crm'
    | 'catalog'
    | 'campaign'
    | 'flow'
    | 'billing'
    | 'settings'
    | 'ops'
    | 'team';
  reversible: boolean;
  requiresApproval: boolean;
  requiresInput: boolean;
  primaryWorkKinds: string[];
  description: string;
}

export interface ConversationActionDefinition {
  code: string;
  category:
    | 'reply'
    | 'qualification'
    | 'trust'
    | 'offer'
    | 'followup'
    | 'payment'
    | 'handoff'
    | 'timing';
  description: string;
  terminal: boolean;
  requiresHuman: boolean;
}

export const ACCOUNT_CAPABILITY_REGISTRY: AccountCapabilityDefinition[] = [
  {
    code: 'WHATSAPP_REPLY',
    domain: 'whatsapp',
    reversible: true,
    requiresApproval: false,
    requiresInput: false,
    primaryWorkKinds: ['conversation_reply'],
    description: 'Responder, retomar e conduzir conversas do WhatsApp.',
  },
  {
    code: 'CATALOG_PRODUCT_CREATE',
    domain: 'catalog',
    reversible: false,
    requiresApproval: true,
    requiresInput: true,
    primaryWorkKinds: ['catalog_gap_detected', 'product_creation_approval'],
    description: 'Criar novo produto no catálogo da conta.',
  },
  {
    code: 'CATALOG_PRODUCT_ENRICH',
    domain: 'catalog',
    reversible: true,
    requiresApproval: false,
    requiresInput: false,
    primaryWorkKinds: ['product_enrichment_required', 'faq_gap', 'offer_gap'],
    description: 'Enriquecer descrição, FAQ, links e metadados de produto.',
  },
  {
    code: 'BILLING_CONFIGURATION',
    domain: 'billing',
    reversible: false,
    requiresApproval: true,
    requiresInput: true,
    primaryWorkKinds: ['billing_update_required'],
    description:
      'Ajustar billing, plano e estados estruturais de cobrança da conta.',
  },
  {
    code: 'DOMAIN_CONFIGURATION',
    domain: 'settings',
    reversible: false,
    requiresApproval: true,
    requiresInput: true,
    primaryWorkKinds: ['domain_gap'],
    description: 'Configurar domínio e identidade operacional da conta.',
  },
  {
    code: 'WEBHOOK_CONFIGURATION',
    domain: 'settings',
    reversible: false,
    requiresApproval: true,
    requiresInput: true,
    primaryWorkKinds: ['webhook_gap'],
    description: 'Configurar webhooks estruturais da conta.',
  },
  {
    code: 'API_KEY_CONFIGURATION',
    domain: 'settings',
    reversible: false,
    requiresApproval: true,
    requiresInput: true,
    primaryWorkKinds: ['api_key_gap'],
    description: 'Criar ou rotacionar chaves de API da conta.',
  },
  {
    code: 'TEAM_CONFIGURATION',
    domain: 'team',
    reversible: false,
    requiresApproval: true,
    requiresInput: true,
    primaryWorkKinds: ['team_configuration_gap'],
    description: 'Definir time, agentes e ownership operacional da conta.',
  },
  {
    code: 'FLOW_CONFIGURATION',
    domain: 'flow',
    reversible: true,
    requiresApproval: false,
    requiresInput: true,
    primaryWorkKinds: ['flow_creation_candidate'],
    description: 'Criar ou ativar flows comerciais da conta.',
  },
  {
    code: 'CAMPAIGN_CONFIGURATION',
    domain: 'campaign',
    reversible: true,
    requiresApproval: false,
    requiresInput: true,
    primaryWorkKinds: ['campaign_launch_candidate'],
    description: 'Criar e operar campanhas comerciais da conta.',
  },
  {
    code: 'OPS_REPAIR',
    domain: 'ops',
    reversible: true,
    requiresApproval: false,
    requiresInput: false,
    primaryWorkKinds: ['session_repair', 'queue_repair', 'dead_letter_replay'],
    description: 'Reparar filas, sessão WhatsApp e trabalho órfão.',
  },
];

export const CONVERSATION_ACTION_REGISTRY: ConversationActionDefinition[] = [
  {
    code: 'RESPOND',
    category: 'reply',
    description: 'Responder diretamente ao lead com base no contexto atual.',
    terminal: false,
    requiresHuman: false,
  },
  {
    code: 'ASK_CLARIFYING',
    category: 'qualification',
    description: 'Fazer pergunta de qualificação para reduzir incerteza.',
    terminal: false,
    requiresHuman: false,
  },
  {
    code: 'SOCIAL_PROOF',
    category: 'trust',
    description: 'Usar prova social segura para reduzir fricção de confiança.',
    terminal: false,
    requiresHuman: false,
  },
  {
    code: 'OFFER',
    category: 'offer',
    description: 'Apresentar oferta e próximo passo comercial.',
    terminal: false,
    requiresHuman: false,
  },
  {
    code: 'PAYMENT_RECOVERY',
    category: 'payment',
    description: 'Recuperar pagamento pendente e simplificar checkout.',
    terminal: false,
    requiresHuman: false,
  },
  {
    code: 'FOLLOWUP_SOFT',
    category: 'followup',
    description: 'Retomar a conversa de forma leve e contextual.',
    terminal: false,
    requiresHuman: false,
  },
  {
    code: 'FOLLOWUP_URGENT',
    category: 'followup',
    description: 'Retomar a conversa com urgência segura e contextual.',
    terminal: false,
    requiresHuman: false,
  },
  {
    code: 'ESCALATE_HUMAN',
    category: 'handoff',
    description: 'Transferir a conversa para humano quando risco/regra exigir.',
    terminal: true,
    requiresHuman: true,
  },
  {
    code: 'WAIT',
    category: 'timing',
    description: 'Adiar atuação quando timing ou regra impedir ação segura.',
    terminal: true,
    requiresHuman: false,
  },
];
