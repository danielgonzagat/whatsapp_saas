import { Logger } from '@nestjs/common';
import { KloelLead, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export const NON_DIGIT_RE = /\D/g;

export function safeStr(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

export function asUnknownRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function detectBuyIntent(message: string): 'high' | 'medium' | 'low' | 'objection' {
  const lowerMessage = message.toLowerCase();
  const highIntentKeywords = [
    'quero comprar',
    'vou comprar',
    'pode enviar',
    'manda o link',
    'aceito',
    'fechado',
    'como pago',
    'pix',
    'cartão',
    'boleto',
    'quero esse',
    'vou levar',
    'me envia',
    'pode mandar',
  ];
  const mediumIntentKeywords = [
    'quanto custa',
    'qual o valor',
    'tem desconto',
    'parcelado',
    'como funciona',
    'me conta mais',
    'interessado',
    'gostei',
  ];
  const objectionKeywords = [
    'tá caro',
    'muito caro',
    'não tenho',
    'vou pensar',
    'depois',
    'não sei',
    'não posso',
    'não quero',
    'sem interesse',
  ];
  for (const keyword of highIntentKeywords) {
    if (lowerMessage.includes(keyword)) return 'high';
  }
  for (const keyword of mediumIntentKeywords) {
    if (lowerMessage.includes(keyword)) return 'medium';
  }
  for (const keyword of objectionKeywords) {
    if (lowerMessage.includes(keyword)) return 'objection';
  }
  return 'low';
}

export async function getOrCreateLead(
  prisma: PrismaService,
  logger: Logger,
  workspaceId: string,
  phone: string,
): Promise<KloelLead> {
  let lead = await prisma.kloelLead.findFirst({ where: { workspaceId, phone } });
  if (!lead) {
    lead = await prisma.kloelLead.create({
      data: { workspaceId, phone, name: `Lead ${phone.slice(-4)}`, stage: 'new', score: 0 },
    });
    logger.log(`Novo lead criado: ${lead.id}`);
  }
  return lead;
}

export async function getLeadConversationHistory(
  prisma: PrismaService,
  leadId: string,
): Promise<ChatMessage[]> {
  try {
    const messages = await prisma.kloelConversation.findMany({
      where: { leadId },
      orderBy: { createdAt: 'asc' },
      take: 30,
      select: { role: true, content: true },
    });
    return messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  } catch (_error) {
    return [];
  }
}

export async function saveLeadMessage(
  prisma: PrismaService,
  logger: Logger,
  leadId: string,
  role: string,
  content: string,
): Promise<void> {
  try {
    await prisma.kloelConversation.create({ data: { leadId, role, content } });
  } catch (error) {
    logger.warn('Erro ao salvar mensagem do lead:', error);
  }
}

export async function updateLeadFromConversation(
  prisma: PrismaService,
  logger: Logger,
  workspaceId: string,
  leadId: string,
  userMessage: string,
): Promise<void> {
  try {
    const buyIntent = detectBuyIntent(userMessage);
    const updateData: Prisma.KloelLeadUpdateManyMutationInput = {
      lastMessage: userMessage,
      lastIntent: buyIntent,
      updatedAt: new Date(),
    };
    if (buyIntent === 'high') {
      updateData.score = { increment: 20 };
      updateData.stage = 'negotiation';
    } else if (buyIntent === 'medium') {
      updateData.score = { increment: 10 };
      updateData.stage = 'interested';
    } else if (buyIntent === 'objection') {
      updateData.stage = 'objection';
    }
    await prisma.kloelLead.updateMany({
      where: { id: leadId, workspaceId },
      data: updateData,
    });
  } catch (error) {
    logger.warn('Erro ao atualizar lead:', error);
  }
}

export async function extractProductFromMessage(
  prisma: PrismaService,
  workspaceId: string,
  message: string,
): Promise<{ name: string; price: number } | null> {
  try {
    const products = await prisma.kloelMemory.findMany({
      where: { workspaceId, type: 'product' },
      select: { id: true, value: true },
      take: 100,
    });
    const lowerMessage = message.toLowerCase();
    for (const product of products) {
      const productData = product.value as Record<string, unknown>;
      const productName = safeStr(productData.name).toLowerCase();
      if (productName && lowerMessage.includes(productName))
        return { name: safeStr(productData.name), price: Number(productData.price) || 0 };
    }
    const dbProducts = await prisma.product
      ?.findMany?.({
        where: { workspaceId, active: true },
        select: { id: true, name: true, price: true },
        take: 100,
      })
      .catch(() => []);
    for (const product of dbProducts || []) {
      if (lowerMessage.includes(product.name.toLowerCase()))
        return { name: product.name, price: product.price };
    }
    return null;
  } catch (_error) {
    return null;
  }
}
