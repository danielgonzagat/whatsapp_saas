import { tokenStorage, apiFetch } from './core';

export interface AIToolInfo {
  name: string;
  description: string;
  category: string;
  enabled: boolean;
  lastUsed?: string;
  usageCount?: number;
}

const MESSAGING_TOOLS: AIToolInfo[] = [
  {
    name: 'send_message',
    description: 'Envia mensagem WhatsApp',
    category: 'messaging',
    enabled: true,
  },
  {
    name: 'send_audio',
    description: 'Envia áudio gerado por IA',
    category: 'media',
    enabled: true,
  },
  { name: 'send_document', description: 'Envia documento/PDF', category: 'media', enabled: true },
  { name: 'send_voice_note', description: 'Envia nota de voz', category: 'media', enabled: true },
];

const SCHEDULING_AND_CRM_TOOLS: AIToolInfo[] = [
  {
    name: 'schedule_followup',
    description: 'Agenda follow-up automático',
    category: 'scheduling',
    enabled: true,
  },
  {
    name: 'schedule_meeting',
    description: 'Agenda reunião com lead',
    category: 'scheduling',
    enabled: true,
  },
  {
    name: 'qualify_lead',
    description: 'Qualifica lead automaticamente',
    category: 'crm',
    enabled: true,
  },
  {
    name: 'update_contact',
    description: 'Atualiza dados do contato',
    category: 'crm',
    enabled: true,
  },
];

const SALES_AND_PAYMENT_TOOLS: AIToolInfo[] = [
  { name: 'send_offer', description: 'Envia oferta de produto', category: 'sales', enabled: true },
  {
    name: 'handle_objection',
    description: 'Trata objeção de venda',
    category: 'sales',
    enabled: true,
  },
  {
    name: 'send_invoice',
    description: 'Envia fatura/cobrança',
    category: 'payments',
    enabled: true,
  },
  {
    name: 'create_payment_link',
    description: 'Cria link de pagamento',
    category: 'payments',
    enabled: true,
  },
];

const KNOWLEDGE_AND_AUTOMATION_TOOLS: AIToolInfo[] = [
  {
    name: 'send_catalog',
    description: 'Envia catálogo de produtos',
    category: 'catalog',
    enabled: true,
  },
  {
    name: 'search_knowledge',
    description: 'Busca na base de conhecimento',
    category: 'knowledge',
    enabled: true,
  },
  {
    name: 'start_flow',
    description: 'Inicia fluxo de automação',
    category: 'automation',
    enabled: true,
  },
];

function getStaticToolsList(): AIToolInfo[] {
  return [
    ...MESSAGING_TOOLS,
    ...SCHEDULING_AND_CRM_TOOLS,
    ...SALES_AND_PAYMENT_TOOLS,
    ...KNOWLEDGE_AND_AUTOMATION_TOOLS,
  ];
}

export async function listAITools(_token?: string, workspaceId?: string): Promise<AIToolInfo[]> {
  const wsId = workspaceId || tokenStorage.getWorkspaceId();
  const res = await apiFetch<AIToolInfo[]>(`/kloel/agent/${wsId}/tools`);
  if (res.error) {
    return getStaticToolsList().map((t) => ({ ...t, enabled: false }));
  }
  return res.data ?? [];
}
