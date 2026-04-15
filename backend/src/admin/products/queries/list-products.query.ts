import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';

export interface AdminProductRow {
  id: string;
  workspaceId: string;
  workspaceName: string | null;
  name: string;
  description: string | null;
  priceInCents: number;
  currency: string;
  category: string | null;
  format: string;
  status: string;
  active: boolean;
  featured: boolean;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListProductsInput {
  search?: string;
  status?: string;
  workspaceId?: string;
  skip?: number;
  take?: number;
}

export interface ListProductsResult {
  items: AdminProductRow[];
  total: number;
}

const DEFAULT_TAKE = 50;
const MAX_TAKE = 100;

export async function listAdminProducts(
  prisma: PrismaService,
  input: ListProductsInput,
): Promise<ListProductsResult> {
  const skip = Math.max(0, input.skip ?? 0);
  const take = Math.min(MAX_TAKE, Math.max(1, input.take ?? DEFAULT_TAKE));

  const where: Prisma.ProductWhereInput = {};
  if (input.workspaceId) where.workspaceId = input.workspaceId;
  if (input.status) where.status = input.status;
  if (input.search) {
    where.OR = [
      { name: { contains: input.search, mode: 'insensitive' } },
      { description: { contains: input.search, mode: 'insensitive' } },
      { category: { contains: input.search, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        workspaceId: true,
        name: true,
        description: true,
        price: true,
        currency: true,
        category: true,
        format: true,
        status: true,
        active: true,
        featured: true,
        imageUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.product.count({ where }),
  ]);

  if (items.length === 0) return { items: [], total };

  const workspaceIds = Array.from(new Set(items.map((i) => i.workspaceId)));
  const workspaces = await prisma.workspace.findMany({
    where: { id: { in: workspaceIds } },
    select: { id: true, name: true },
  });
  const nameMap = new Map(workspaces.map((w) => [w.id, w.name]));

  return {
    items: items.map((p) => ({
      id: p.id,
      workspaceId: p.workspaceId,
      workspaceName: nameMap.get(p.workspaceId) ?? null,
      name: p.name,
      description: p.description,
      priceInCents: Math.round(p.price * 100),
      currency: p.currency,
      category: p.category,
      format: p.format,
      status: p.status,
      active: p.active,
      featured: p.featured,
      imageUrl: p.imageUrl,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    })),
    total,
  };
}
