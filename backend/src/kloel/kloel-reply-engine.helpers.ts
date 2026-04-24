import { PrismaService } from '../prisma/prisma.service';
import { KloelContextFormatter } from './kloel-context-formatter';
import { KloelWorkspaceContextService } from './kloel-workspace-context.service';
import type { ExpertiseLevel } from './kloel-reply-engine.service';

export const KLOEL_STREAM_ABORT_REASON_TIMEOUT = 'request_timeout';
export const KLOEL_STREAM_ABORT_REASON_CLIENT_DISCONNECTED = 'client_disconnected';

export const WHITESPACE_RE = /\s+/;
export const RELAT_O__RIO_DOCUMENTO_RE =
  /(relat[oó]rio|documento|guia completo|an[aá]lise completa|plano completo|estrat[eé]gia completa|2000|2\.000|sum[aá]rio executivo|diagn[oó]stico)/i;
export const CRIE_CADASTRAR_CADASTRE_RE =
  /(crie|cadastrar|cadastre|salve|liste|mostre|remova|delete|apague|ative|desative|ligue|desligue|conecte|conectar|envie|mande|sincronize|pesquise|busque|procure|pesquisar|buscar|abrir|feche|fechar|atualize|consultar|consulte|verifique|verificar|quero|preciso|gere|fa[cç]a|fazer|traga|me d[eê]|o que est[aá]|quais s[aã]o|qual [ée]|tem|existem)/i;
export const PRODUTO_CAT_A__LOGO_AUT_RE =
  /(produto|cat[aá]logo|autopilot|marca|voz|brand voice|fluxo|flow|dashboard|painel|whatsapp|contato|contatos|chat|chats|mensagem|mensagens|backlog|hist[oó]rico|presen[cç]a|presence|link de pagamento|pagamento|payment|web|internet|google|site|landing|homepage|copy|email|campanha|campanhas|checkout|carrinho|afiliad|seo|not[ií]cia|noticias|hoje|status)/i;

type UnknownRecord = Record<string, unknown>;

/** Builds the dynamic runtime context string for the reply engine. */
export async function buildDynamicRuntimeContextHelper(params: {
  workspaceId?: string;
  userId?: string;
  userName?: string;
  expertiseLevel: ExpertiseLevel;
  companyContext?: string;
  prisma: PrismaService;
  wsContextService: KloelWorkspaceContextService;
  contextFormatter: KloelContextFormatter;
}): Promise<string> {
  const {
    workspaceId,
    userId,
    userName,
    expertiseLevel,
    companyContext,
    prisma,
    wsContextService,
    contextFormatter,
  } = params;

  const baseContext = workspaceId
    ? await wsContextService.getWorkspaceContext(workspaceId, userId)
    : '';

  if (!workspaceId) {
    return [
      '<user_context>',
      `Nível de expertise detectado: ${expertiseLevel}`,
      companyContext ? `Contexto adicional: ${companyContext}` : null,
      baseContext ? `Contexto conhecido:\n${baseContext}` : null,
      '</user_context>',
    ]
      .filter(Boolean)
      .join('\n');
  }

  const countThreads =
    typeof prisma.chatThread.count === 'function'
      ? prisma.chatThread.count({ where: { workspaceId } })
      : (async () => {
          const t = await prisma.chatThread.findFirst({
            where: { workspaceId },
            select: { id: true },
          });
          return t ? 1 : 0;
        })();

  const [workspace, agent, threadCount] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
        providerSettings: true,
        customDomain: true,
        branding: true,
        stripeCustomerId: true,
        updatedAt: true,
      },
    }),
    userId
      ? prisma.agent.findFirst({
          where: { id: userId, workspaceId },
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            provider: true,
            avatarUrl: true,
            publicName: true,
            bio: true,
            website: true,
            instagram: true,
            role: true,
            displayRole: true,
            isOnline: true,
            emailVerified: true,
            kycStatus: true,
            kycSubmittedAt: true,
            kycApprovedAt: true,
            kycRejectedReason: true,
            permissions: true,
            persona: { select: { name: true, role: true } },
          },
        })
      : Promise.resolve(null),
    countThreads,
  ]);

  const providerSettings =
    workspace?.providerSettings && typeof workspace.providerSettings === 'object'
      ? (workspace.providerSettings as UnknownRecord)
      : {};
  const autopilotSettings =
    providerSettings.autopilot && typeof providerSettings.autopilot === 'object'
      ? (providerSettings.autopilot as UnknownRecord)
      : {};
  const whatsappConnected =
    providerSettings.whatsappConnected === true ||
    (providerSettings.whatsapp as UnknownRecord | null)?.connected === true ||
    (providerSettings.connection as UnknownRecord | null)?.status === 'connected' ||
    providerSettings.status === 'connected';
  const resolvedUserName = contextFormatter.sanitizeUserNameForAssistant(
    userName || agent?.name || 'Usuário',
  );

  return [
    '<user_context>',
    `Nome do usuário: ${resolvedUserName}`,
    `Email do usuário: ${agent?.email || 'não informado'}`,
    `Workspace: Workspace`,
    `Nível de expertise detectado: ${expertiseLevel}`,
    `WhatsApp conectado: ${whatsappConnected ? 'Sim' : 'Não'}`,
    `Autopilot ativo: ${autopilotSettings.enabled === true ? 'Sim' : 'Não'}`,
    `Conversas registradas: ${threadCount}`,
    contextFormatter.buildAgentProfileContext(agent as UnknownRecord | null | undefined),
    `Quando fizer sentido, trate o usuário pelo primeiro nome "${resolvedUserName}" de forma natural ao longo da conversa.`,
    companyContext ? `Contexto adicional enviado pelo frontend:\n${companyContext}` : null,
    baseContext ? `Base de contexto do workspace:\n${baseContext}` : null,
    '</user_context>',
  ]
    .filter(Boolean)
    .join('\n');
}
