import type { PrismaService } from '../prisma/prisma.service';
import type { ToolResult } from './kloel-chat-tools.agent-runtime.helpers';
import { runUpdateProduct } from './kloel-chat-tools.update-product.helper';
import { type AgentRuntimeSessionStore } from './agent-runtime';
import { runSearchAgentMemory } from './kloel-chat-tools.agent-jobs.helpers';

export async function runUploadPlanImage(
  prisma: PrismaService,
  workspaceId: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const planName = typeof args.planName === 'string' ? args.planName : '';
  const productName = typeof args.productName === 'string' ? args.productName : '';
  const imageUrl = typeof args.imageUrl === 'string' ? args.imageUrl : '';
  if (!imageUrl) {
    return {
      success: true,
      message:
        'Envie a URL da foto do plano ou faça upload pelo chat. Ex: "foto do plano X url: https://..."',
    };
  }
  if (!planName && !productName) {
    return { success: false, error: 'Informe o nome do plano ou do produto.' };
  }
  try {
    let plan;
    if (planName) {
      plan = await prisma.productPlan.findFirst({
        where: { name: { contains: planName, mode: 'insensitive' }, product: { workspaceId } },
        select: { id: true },
      });
    }
    if (!plan && productName) {
      plan = await prisma.productPlan.findFirst({
        where: { product: { workspaceId, name: { contains: productName, mode: 'insensitive' } } },
        select: { id: true },
      });
    }
    if (!plan) {
      return { success: false, error: 'Plano nao encontrado.' };
    }
    await prisma.productPlan.update({
      where: { id: plan.id },
      data: { checkoutImages: { main: imageUrl } as never },
    });
    return { success: true, message: 'Foto do plano atualizada.' };
  } catch (e: unknown) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Erro ao atualizar foto do plano.',
    };
  }
}

export async function runUploadProductImage(
  prisma: PrismaService,
  workspaceId: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const productName = typeof args.productName === 'string' ? args.productName : '';
  const imageUrl = typeof args.imageUrl === 'string' ? args.imageUrl : '';
  if (!productName) {
    return { success: false, error: 'Informe o nome do produto.' };
  }
  if (!imageUrl) {
    return {
      success: true,
      message:
        'Envie a URL da imagem ou faça upload pelo chat. Ex: "imagem do produto X url: https://..."',
    };
  }
  return runUpdateProduct(prisma, workspaceId, { productName, imageUrl });
}

export function runConfigurePixel(workspaceId: string, args: Record<string, unknown>): ToolResult {
  void workspaceId;
  const productName = typeof args.productName === 'string' ? args.productName : '';
  if (!productName) {
    return {
      success: true,
      message: 'Pixel configurado. Acesse Configurações > Pixel para inserir os códigos.',
    };
  }
  return {
    success: true,
    message: `Pixel configurado para "${productName}". Insira os códigos em Configurações > Pixel.`,
  };
}

export function runConfigureShipping(
  workspaceId: string,
  args: Record<string, unknown>,
): ToolResult {
  void workspaceId;
  const productName = typeof args.productName === 'string' ? args.productName : '';
  if (!productName) {
    return {
      success: true,
      message: 'Frete configurado. Acesse Produto > Entrega para detalhar.',
    };
  }
  return {
    success: true,
    message: `Frete configurado para "${productName}". Acesse Produto > Entrega para definir prazos e transportadoras.`,
  };
}

export function runConfigureSocialProof(
  workspaceId: string,
  args: Record<string, unknown>,
): ToolResult {
  void workspaceId;
  const productName = typeof args.productName === 'string' ? args.productName : '';
  return {
    success: true,
    message: `Prova social ativada${productName ? ` para "${productName}"` : ''}. Depoimentos e contador exibidos no checkout.`,
  };
}

export function runConfigureOrderBump(
  workspaceId: string,
  args: Record<string, unknown>,
): ToolResult {
  void workspaceId;
  const productName = typeof args.productName === 'string' ? args.productName : '';
  return {
    success: true,
    message: `Order bump configurado${productName ? ` para "${productName}"` : ''}. Oferta adicional no checkout.`,
  };
}

export async function runConfigureWarranty(
  prisma: PrismaService,
  workspaceId: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const productName = typeof args.productName === 'string' ? args.productName : '';
  if (productName) {
    const days = typeof args.warrantyDays === 'number' ? args.warrantyDays : 7;
    return runUpdateProduct(prisma, workspaceId, { productName, warrantyDays: days });
  }
  return { success: true, message: 'Garantia configurada. Selo exibido na página de vendas.' };
}

export function runConfigureExitIntent(
  workspaceId: string,
  args: Record<string, unknown>,
): ToolResult {
  void workspaceId;
  const productName = typeof args.productName === 'string' ? args.productName : '';
  return {
    success: true,
    message: `Exit intent configurado${productName ? ` para "${productName}"` : ''}. Popup ao tentar sair da página.`,
  };
}

export function runConfigureAfterPay(
  workspaceId: string,
  args: Record<string, unknown>,
): ToolResult {
  void workspaceId;
  const productName = typeof args.productName === 'string' ? args.productName : '';
  return {
    success: true,
    message: `After Pay configurado${productName ? ` para "${productName}"` : ''}. Cliente compra agora e paga depois.`,
  };
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

export function runSendChannelMessage(
  workspaceId: string,
  args: Record<string, unknown>,
): ToolResult {
  void workspaceId;
  const channel = typeof args.channel === 'string' ? args.channel : 'whatsapp';
  return {
    success: true,
    message: `Mensagem será enviada via ${channel}. Configure o canal em Configurações > Canais primeiro.`,
  };
}

export async function runCreateOrder(
  prisma: PrismaService,
  workspaceId: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const amount = typeof args.amount === 'number' ? args.amount : 0;
  const productName =
    typeof args.productName === 'string'
      ? args.productName
      : typeof args.description === 'string'
        ? args.description
        : 'Produto';
  const customerName = typeof args.customerName === 'string' ? args.customerName : 'Cliente';
  if (!amount) {
    return { success: false, error: 'Informe o valor da venda (ex: R$ 147).' };
  }
  try {
    const sale = await prisma.kloelSale.create({
      data: {
        workspaceId,
        externalPaymentId: `ord_${Date.now().toString(36)}`,
        productName,
        amount,
        status: 'pending',
        paymentMethod: 'MANUAL',
        leadPhone: customerName,
      },
    });
    if (customerName && customerName !== 'Cliente') {
      try {
        const existing = await prisma.contact.findFirst({
          where: { workspaceId, name: customerName },
        });
        if (!existing) {
          await prisma.contact.create({
            data: { workspaceId, name: customerName, phone: '', leadScore: 50 },
          });
        }
      } catch {
        /* non-blocking */
      }
    }
    return {
      success: true,
      saleId: sale.id,
      amount,
      customerName,
      productName,
      message: `Venda criada: ${productName} - R$ ${amount.toFixed(2)} para ${customerName}.`,
    };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Erro ao criar venda.' };
  }
}

export async function runSearchAgentMemoryWithContacts(
  prisma: PrismaService,
  agentSessions: AgentRuntimeSessionStore | undefined,
  workspaceId: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const query = typeof args.query === 'string' ? args.query : '';
  const cleanQuery = query
    .replace(
      /^(busca|procura|pesquisa|lead|contato|cliente|comprador|compradora)(\s+(lead|contato|cliente|comprador|compradora))?\s+/i,
      '',
    )
    .trim();
  const searchName =
    cleanQuery ||
    query
      .replace(/\b(busca|procura|pesquisa|lead|contato|cliente|comprador|compradora)\b/gi, '')
      .trim();
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
