import type { PrismaService } from '../prisma/prisma.service';
import type { AgentRuntimeSessionStore } from './agent-runtime';
import type { ToolResult } from './kloel-chat-tools.agent-runtime.helpers';
import { runSearchAgentMemory } from './kloel-chat-tools.agent-jobs.helpers';

const LEAD_PREFIX_PATTERN =
  /^(busca|procura|pesquisa|lead|contato|cliente|comprador|compradora)(\s+(lead|contato|cliente|comprador|compradora))?\s+/i;
const LEAD_WORD_PATTERN =
  /\b(busca|procura|pesquisa|lead|contato|cliente|comprador|compradora)\b/gi;

function normalizeContactQuery(raw: unknown): string {
  const query = typeof raw === 'string' ? raw : '';
  const cleanQuery = query.replace(LEAD_PREFIX_PATTERN, '').trim();
  return cleanQuery || query.replace(LEAD_WORD_PATTERN, '').trim();
}

export async function runListFlows(
  prisma: PrismaService,
  workspaceId: string,
): Promise<ToolResult> {
  const flows = await prisma.flow.findMany({
    where: { workspaceId },
    select: {
      id: true,
      name: true,
      isActive: true,
      createdAt: true,
      _count: { select: { executions: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  return {
    success: true,
    flows: flows.map((f) => ({
      id: f.id,
      name: f.name,
      active: f.isActive,
      executions: f._count.executions,
    })),
    message: `Você tem ${flows.length} fluxo(s) cadastrado(s).`,
  };
}

export async function runSearchAgentMemoryWithContacts(
  prisma: PrismaService,
  agentSessions: AgentRuntimeSessionStore | undefined,
  workspaceId: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const searchName = normalizeContactQuery(args.query);
  try {
    const contacts = await prisma.contact.findMany({
      where: {
        workspaceId,
        OR: [
          { name: { contains: searchName, mode: 'insensitive' } },
          { phone: { contains: searchName } },
        ],
      },
      select: {
        id: true,
        name: true,
        phone: true,
        leadScore: true,
        sentiment: true,
        updatedAt: true,
      },
      take: 10,
    });
    if (contacts.length > 0) {
      return {
        success: true,
        contacts: contacts.map((c) => ({
          name: c.name,
          phone: c.phone,
          score: c.leadScore || 0,
          sentiment: c.sentiment,
          lastUpdate: c.updatedAt,
        })),
        message: `Encontrei ${contacts.length} contato(s): ${contacts.map((c) => c.name).join(', ')}`,
      };
    }
    return runSearchAgentMemory(agentSessions, workspaceId, { query: searchName, limit: 5 });
  } catch {
    return { success: true, message: 'Nenhuma memoria encontrada.' };
  }
}

export async function runBrowseMarketplace(
  prisma: PrismaService,
  workspaceId: string,
): Promise<ToolResult> {
  try {
    const products = await prisma.product.findMany({
      where: { affiliateEnabled: true, workspaceId: { not: workspaceId } },
      select: { id: true, name: true, price: true, workspaceId: true },
      take: 20,
    });
    if (products.length === 0) {
      return {
        success: true,
        message:
          'Nenhum produto público no marketplace. Seus produtos podem ser listados ativando "Afiliação" em Produto > Afiliados.',
      };
    }
    return {
      success: true,
      products,
      message: `${products.length} produtos disponíveis no marketplace.`,
    };
  } catch (e: unknown) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Erro ao buscar marketplace.',
    };
  }
}
