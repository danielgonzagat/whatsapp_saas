/**
 * ARCHITECTURAL COHESION: This file is the Variant Reinforcement Learning
 * Engine. It defines the variant families (followup, payment_recovery), the
 * default message templates, the scoring algorithm (applyOutcomeScore), the
 * epsilon-greedy selection strategy (pickVariant), and the variant outcome
 * persistence (updateVariantOutcome). The decision log functions
 * (recordDecisionLog, computeLearningSnapshot) are extracted to
 * cia-decision-log.ts. What remains is the closed-loop learn→select→score
 * system that cannot be split without breaking the feedback loop it models.
 */

import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
export { computeLearningSnapshot, recordDecisionLog } from './cia-decision-log';

export type VariantFamily = 'followup' | 'payment_recovery';
export type VariantOutcome = 'SENT' | 'REPLIED' | 'SOLD' | 'FAILED' | 'SKIPPED' | 'DISPATCHED';

export interface MessageVariant {
  key: string;
  family: VariantFamily;
  text: string;
  score: number;
  uses: number;
}

export interface LearningSnapshot {
  totalLogs: number;
  soldCount: number;
  sentCount: number;
  failedCount: number;
  topVariantKey: string | null;
  topVariantScore: number;
}

export interface VariantSelectionStrategy {
  preferredLength?: 'short' | 'medium' | 'long';
  preferredVariantFamily?: string | null;
  confidence?: number;
}

const DEFAULT_VARIANTS: Record<VariantFamily, Array<Omit<MessageVariant, 'score' | 'uses'>>> = {
  followup: [
    {
      key: 'followup:direct',
      family: 'followup',
      text: 'Passei aqui porque seu atendimento ficou em aberto. Se ainda fizer sentido, eu consigo te ajudar a concluir agora.',
    },
    {
      key: 'followup:proof',
      family: 'followup',
      text: 'Muita gente volta quando entende melhor o próximo passo. Se você quiser, eu resumo tudo e deixo isso simples agora.',
    },
    {
      key: 'followup:scarcity',
      family: 'followup',
      text: 'Ainda consigo te atender com prioridade agora, mas não sei se vou manter essa condição mais tarde. Quer que eu avance?',
    },
  ],
  payment_recovery: [
    {
      key: 'payment:pix_recovery',
      family: 'payment_recovery',
      text: 'Vi que o pagamento ficou pendente. Se quiser, eu te reenfio o link agora e deixo isso resolvido em poucos minutos.',
    },
    {
      key: 'payment:confidence',
      family: 'payment_recovery',
      text: 'Seu pagamento ainda está em aberto. Posso te ajudar a concluir com segurança agora, sem perder o que já foi combinado.',
    },
    {
      key: 'payment:deadline',
      family: 'payment_recovery',
      text: 'Consigo reativar sua cobrança agora e garantir a continuidade do seu pedido. Quer que eu faça isso por você?',
    },
  ],
};

function decisionType(family: VariantFamily): string {
  return `cia_variant:${family}`;
}

function armContext(variant: Omit<MessageVariant, 'score' | 'uses'>): Prisma.InputJsonObject {
  return { family: variant.family, text: variant.text };
}

function defaultVariantMap(family: VariantFamily): Map<string, MessageVariant> {
  return new Map(
    DEFAULT_VARIANTS[family].map((variant) => [variant.key, { ...variant, score: 1, uses: 0 }]),
  );
}

function firstDefaultVariant(family: VariantFamily): MessageVariant {
  const first = Array.from(defaultVariantMap(family).values())[0];
  if (!first) {
    throw new Error(`No CIA variant configured for ${family}`);
  }
  return first;
}

function score(alpha: number, beta: number, pulls: number, totalPulls: number): number {
  const mean = alpha / (alpha + beta);
  const uncertainty = Math.sqrt(Math.log(Math.max(2, totalPulls + 1)) / Math.max(1, pulls));
  return mean + uncertainty;
}

async function ensureBanditArms(
  prisma: PrismaClient,
  workspaceId: string,
  family: VariantFamily,
): Promise<void> {
  if (!prisma?.mindBanditArm?.upsert) return;
  for (const variant of DEFAULT_VARIANTS[family]) {
    await prisma.mindBanditArm.upsert({
      where: {
        workspaceId_decisionType_arm: {
          workspaceId,
          decisionType: decisionType(family),
          arm: variant.key,
        },
      },
      update: { isActive: true, context: armContext(variant) },
      create: {
        id: randomUUID(),
        workspaceId,
        decisionType: decisionType(family),
        arm: variant.key,
        isActive: true,
        context: armContext(variant),
      },
    });
  }
}

function variantFromArm(
  family: VariantFamily,
  arm: { arm: string; alpha: number; beta: number; pulls: number; context: unknown },
): MessageVariant {
  const defaults = defaultVariantMap(family);
  const fallback = defaults.get(arm.arm) || firstDefaultVariant(family);
  const context =
    arm.context && typeof arm.context === 'object' ? (arm.context as Record<string, unknown>) : {};
  return {
    key: arm.arm,
    family,
    text: String(context.text || fallback?.text || ''),
    score: Number((arm.alpha / Math.max(arm.alpha + arm.beta, 1)).toFixed(3)),
    uses: arm.pulls,
  };
}

export function resolveVariantByKey(family: VariantFamily, key: string): MessageVariant {
  const variants = defaultVariantMap(family);
  return variants.get(key) || firstDefaultVariant(family);
}

export function listVariantKeys(family: VariantFamily): string[] {
  return Array.from(defaultVariantMap(family).keys());
}

/**
 * @deprecated Decision authority migrated to MindService.resolveBestVariant via HTTP.
 * Kept as local fallback when backend is unreachable. See ADR 0004.
 */
export async function pickVariant(
  prisma: PrismaClient,
  workspaceId: string,
  family: VariantFamily,
  strategy?: VariantSelectionStrategy | null,
): Promise<MessageVariant> {
  void strategy;
  await ensureBanditArms(prisma, workspaceId, family);
  const arms = prisma?.mindBanditArm?.findMany
    ? await prisma.mindBanditArm.findMany({
        where: { workspaceId, decisionType: decisionType(family), isActive: true },
      })
    : [];
  const totalPulls = arms.reduce((sum, arm) => sum + arm.pulls, 0);
  const chosen = [...arms].sort(
    (left, right) =>
      score(right.alpha, right.beta, right.pulls, totalPulls) -
      score(left.alpha, left.beta, left.pulls, totalPulls),
  )[0];
  if (!chosen) {
    return firstDefaultVariant(family);
  }
  await prisma.mindBanditArm.updateMany({
    where: { id: chosen.id, workspaceId, decisionType: decisionType(family) },
    data: { pulls: { increment: 1 } },
  });
  return variantFromArm(family, chosen);
}

export async function updateVariantOutcome(
  prisma: PrismaClient,
  input: {
    workspaceId: string;
    family: VariantFamily;
    variant: MessageVariant;
    outcome: VariantOutcome;
    revenue?: number;
  },
): Promise<void> {
  if (!prisma?.mindBanditArm?.update) {
    return;
  }

  const outcome = input.outcome === 'SOLD' || input.outcome === 'REPLIED' ? 1 : 0;

  await prisma.mindBanditArm.update({
    where: {
      workspaceId_decisionType_arm: {
        workspaceId: input.workspaceId,
        decisionType: decisionType(input.family),
        arm: input.variant.key,
      },
    },
    data: {
      alpha: { increment: outcome },
      beta: { increment: 1 - outcome },
      wins: { increment: outcome },
      context: {
        family: input.family,
        text: input.variant.text,
        lastOutcome: input.outcome,
        revenue: input.revenue || 0,
      },
    },
  });
}
