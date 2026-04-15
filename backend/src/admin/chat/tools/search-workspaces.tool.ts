import { AdminAction, AdminModule } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { ChatTool } from '../chat-tool.registry';

/**
 * Read-only chat tool. Returns the top 10 workspaces matching a
 * substring in name or id. Used by the admin chat LLM to let the
 * operator ask "who is ACME?" and ground the conversation in a
 * specific workspace.
 */
export function searchWorkspacesTool(prisma: PrismaService): ChatTool {
  return {
    name: 'searchWorkspaces',
    kind: 'read',
    description:
      'Busca as 10 primeiras workspaces que casam com um termo no nome ou id. Retorna id, nome e createdAt.',
    permissionModule: AdminModule.CONTAS,
    permissionAction: AdminAction.VIEW,
    inputSchema: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string', minLength: 1, maxLength: 120 },
      },
    },
    async execute(args: Record<string, unknown>): Promise<Record<string, unknown>> {
      const query = typeof args.query === 'string' ? args.query.trim() : '';
      if (query.length === 0) {
        return { items: [], total: 0 };
      }
      const rows = await prisma.workspace.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { id: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: { id: true, name: true, createdAt: true },
        take: 10,
        orderBy: { createdAt: 'desc' },
      });
      return {
        items: rows.map((r) => ({
          id: r.id,
          name: r.name,
          createdAt: r.createdAt.toISOString(),
        })),
        total: rows.length,
      };
    },
  };
}
