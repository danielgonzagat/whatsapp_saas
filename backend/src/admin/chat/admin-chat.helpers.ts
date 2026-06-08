import type { AdminChatRole, AdminRole } from '@prisma/client';

// ---- regex patterns -----------------------------------------------------

const BUSCAR_PROCURAR_ENCON_RE =
  /(?:buscar|procurar|encontrar)\s+(?:workspace|conta|produtor|cliente)\s+(.+)/i;
const WORKSPACE_CONTA_PRODU_RE = /(?:workspace|conta|produtor|cliente)\s+(.+)/i;
const OVERVIEW_RESUMO_DASHBOA_RE = /(overview|resumo|dashboard|home|gmv|receita)/i;
const MARKETING_CANAL_CONVERSA_RE = /marketing|canal|conversa|lead/i;
const VENDAS_ASSINATURAS_PIPEL_RE = /vendas|assinaturas|pipeline|transa/i;
const COMPLIANCE_CHARGEBACK_KY_RE = /compliance|chargeback|kyc|fraude|reembolso/i;
const RELAT_O__RIO_EXPORT_FUNN_RE = /relat[oó]rio|export|funnel|cohort/i;
const CONFIG_FEATURE_FLAG_DOM_RE = /config|feature flag|dom[ií]nio|webhook|seguran/i;
const SUPORTE_TICKET_SLA_MACRO_RE = /suporte|ticket|sla|macro/i;
const ALERTA_NOTIFICA_RE = /alerta|notifica/i;
const PRODUTO_RE = /produto/i;
const CONTA_WORKSPACE_PRODUTOR_RE = /conta|workspace|produtor/i;
const CLIENTE_RE = /cliente/i;

const TOOL_S____W_____S_RE = /^\/tool\s+([\w-]+)\s*(\{.*\})?$/s;

const OVERVIEW_DISPATCH_TABLE: ReadonlyArray<{ pattern: RegExp; tool: string }> = [
  { pattern: MARKETING_CANAL_CONVERSA_RE, tool: 'marketingOverview' },
  { pattern: VENDAS_ASSINATURAS_PIPEL_RE, tool: 'salesOverview' },
  { pattern: COMPLIANCE_CHARGEBACK_KY_RE, tool: 'complianceOverview' },
  { pattern: RELAT_O__RIO_EXPORT_FUNN_RE, tool: 'reportsOverview' },
  { pattern: CONFIG_FEATURE_FLAG_DOM_RE, tool: 'configOverview' },
  { pattern: SUPORTE_TICKET_SLA_MACRO_RE, tool: 'supportOverview' },
  { pattern: ALERTA_NOTIFICA_RE, tool: 'notificationsOverview' },
  { pattern: PRODUTO_RE, tool: 'productsOverview' },
  { pattern: CONTA_WORKSPACE_PRODUTOR_RE, tool: 'accountsOverview' },
  { pattern: CLIENTE_RE, tool: 'clientsOverview' },
];

// ---- tool invocation parsing --------------------------------------------

/**
 * Parse an explicit /tool invocation from message content.
 * Returns null if the content does not match the /tool pattern or
 * if the JSON args are malformed.
 */
export function parseToolInvocation(
  content: string,
): { name: string; args: Record<string, unknown> } | null {
  const match = content.trim().match(TOOL_S____W_____S_RE);
  if (!match) {
    return null;
  }
  const name = match[1];
  if (!name) {
    return null;
  }
  let args: Record<string, unknown> = {};
  if (match[2]) {
    try {
      const parsed: unknown = JSON.parse(match[2]);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        args = parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return { name, args };
}

// ---- natural-language inference -----------------------------------------

function inferSearchInvocation(
  trimmed: string,
): { name: string; args: Record<string, unknown> } | null {
  const explicitSearch = trimmed.match(BUSCAR_PROCURAR_ENCON_RE);
  if (explicitSearch?.[1]) {
    return { name: 'searchWorkspaces', args: { query: explicitSearch[1].trim() } };
  }
  const contextualSearch = trimmed.match(WORKSPACE_CONTA_PRODU_RE);
  if (contextualSearch?.[1] && contextualSearch[1].trim().length >= 2) {
    return { name: 'searchWorkspaces', args: { query: contextualSearch[1].trim() } };
  }
  return null;
}

function inferOverviewInvocation(
  trimmed: string,
): { name: string; args: Record<string, unknown> } | null {
  if (!OVERVIEW_RESUMO_DASHBOA_RE.test(trimmed)) {
    return null;
  }
  for (const entry of OVERVIEW_DISPATCH_TABLE) {
    if (entry.pattern.test(trimmed)) {
      return { name: entry.tool, args: {} };
    }
  }
  return { name: 'dashboardOverview', args: {} };
}

/**
 * Infer a tool invocation from natural-language content.
 * Falls back from search → overview; returns null when nothing matches.
 */
export function inferToolInvocation(
  content: string,
): { name: string; args: Record<string, unknown> } | null {
  const trimmed = content.trim();
  return inferSearchInvocation(trimmed) ?? inferOverviewInvocation(trimmed);
}

// ---- result formatting --------------------------------------------------

/** Summarize a tool execution result into a human-readable message. */
export function summarizeToolResult(toolName: string, result: Record<string, unknown>): string {
  if (toolName === 'searchWorkspaces') {
    const items = Array.isArray(result.items) ? result.items : [];
    if (items.length === 0) {
      return 'Nenhuma workspace encontrada para o termo informado.';
    }

    return [
      `Encontrei ${items.length} workspace(s):`,
      ...items.slice(0, 5).map((item) => {
        const row = item as Record<string, unknown>;
        const name = typeof row.name === 'string' ? row.name : 'Sem nome';
        const id = typeof row.id === 'string' ? row.id : 'sem-id';
        return `- ${name} (${id})`;
      }),
    ].join('\n');
  }

  const preview = JSON.stringify(result, null, 2);
  return preview.length > 1800 ? `${preview.slice(0, 1800)}…` : preview;
}

// ---- view mapping -------------------------------------------------------

/** Send message input shape. */
export interface SendMessageInput {
  /** Admin user id property. */
  adminUserId: string;
  /** Admin role property. */
  adminRole: AdminRole;
  /** Session id property. */
  sessionId: string | null;
  /** Content property. */
  content: string;
}

/** Chat session view shape. */
export interface ChatSessionView {
  /** Id property. */
  id: string;
  /** Title property. */
  title: string | null;
  /** Created at property. */
  createdAt: string;
  /** Last used at property. */
  lastUsedAt: string;
  /** Expires at property. */
  expiresAt: string;
  /** Messages property. */
  messages: ChatMessageView[];
}

/** Chat message view shape. */
export interface ChatMessageView {
  /** Id property. */
  id: string;
  /** Role property. */
  role: AdminChatRole;
  /** Content property. */
  content: string;
  /** Tool name property. */
  toolName: string | null;
  /** Tool args property. */
  toolArgs: Record<string, unknown> | null;
  /** Tool result property. */
  toolResult: Record<string, unknown> | null;
  /** Created at property. */
  createdAt: string;
}

/**
 * Map a Prisma session aggregate to a view-safe DTO.
 * Converts Date → ISO string, defaults nullable fields.
 */
export function toSessionView(session: {
  id: string;
  title: string | null;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  messages: Array<{
    id: string;
    role: AdminChatRole;
    content: string;
    toolName: string | null;
    toolArgs: unknown;
    toolResult: unknown;
    createdAt: Date;
  }>;
}): ChatSessionView {
  return {
    id: session.id,
    title: session.title,
    createdAt: session.createdAt.toISOString(),
    lastUsedAt: session.lastUsedAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    messages: session.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      toolName: m.toolName,
      toolArgs: (m.toolArgs as Record<string, unknown> | null) ?? null,
      toolResult: (m.toolResult as Record<string, unknown> | null) ?? null,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}
