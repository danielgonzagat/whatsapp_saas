import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface ProductForMemorySync {
  id: string;
  sku: string | null;
  name: string;
  price: { toFixed: (d: number) => string };
  category: string | null;
  description: string | null;
  format: string | null;
  tags: string[];
}

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function buildMemoryContent(product: ProductForMemorySync): string {
  return (
    `Produto: ${product.name}\n` +
    `Preco: R$ ${BRL_FORMATTER.format(Number(product.price))}\n` +
    `Categoria: ${product.category || 'Geral'}\n` +
    `Descricao: ${product.description || ''}\n` +
    `Formato: ${product.format}\n` +
    `Tags: ${(product.tags || []).join(', ')}`
  );
}

function buildMemoryValue(product: ProductForMemorySync): Record<string, unknown> {
  return {
    name: product.name,
    price: product.price,
    category: product.category,
    description: product.description,
    format: product.format,
    tags: product.tags,
  };
}

/**
 * Upserts a product entry in KloelMemory so the Kloel AI is aware of it.
 * Non-critical: failures are silently swallowed so the caller can proceed.
 */
export async function syncProductToMemory(
  prisma: PrismaService,
  workspaceId: string,
  product: ProductForMemorySync,
): Promise<void> {
  try {
    const key = `product:${product.sku || product.id}`;
    const value = buildMemoryValue(product);
    const content = buildMemoryContent(product);
    await prisma.kloelMemory.upsert({
      where: { workspaceId_key: { workspaceId, key } },
      create: {
        workspaceId,
        key,
        category: 'catalog',
        type: 'product',
        value: value as Prisma.InputJsonValue,
        content,
      },
      update: { value: value as Prisma.InputJsonValue, content },
    });
  } catch {
    // PULSE:OK — Memory sync is non-critical; product operation succeeds without it
  }
}

/**
 * Removes a product entry from KloelMemory.
 * Non-critical: failures are silently swallowed so the caller can proceed.
 */
export async function deleteProductFromMemory(
  prisma: PrismaService,
  workspaceId: string,
  product: { id: string; sku: string | null },
): Promise<void> {
  try {
    await prisma.kloelMemory.deleteMany({
      where: {
        workspaceId,
        key: { startsWith: `product:${product.sku || product.id}` },
      },
    });
  } catch {
    // PULSE:OK — Memory cleanup is non-critical; product deletion succeeds without it
  }
}
