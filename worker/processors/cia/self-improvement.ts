import { randomUUID } from "crypto";

export type VariantFamily = "followup" | "payment_recovery";
export type VariantOutcome =
  | "SENT"
  | "REPLIED"
  | "SOLD"
  | "FAILED"
  | "SKIPPED"
  | "DISPATCHED";

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

const DEFAULT_VARIANTS: Record<VariantFamily, Array<Omit<MessageVariant, "score" | "uses">>> = {
  followup: [
    {
      key: "followup:direct",
      family: "followup",
      text: "Passei aqui porque seu atendimento ficou em aberto. Se ainda fizer sentido, eu consigo te ajudar a concluir agora.",
    },
    {
      key: "followup:proof",
      family: "followup",
      text: "Muita gente volta quando entende melhor o próximo passo. Se você quiser, eu resumo tudo e deixo isso simples agora.",
    },
    {
      key: "followup:scarcity",
      family: "followup",
      text: "Ainda consigo te atender com prioridade agora, mas não sei se vou manter essa condição mais tarde. Quer que eu avance?",
    },
  ],
  payment_recovery: [
    {
      key: "payment:pix_recovery",
      family: "payment_recovery",
      text: "Vi que o pagamento ficou pendente. Se quiser, eu te reenfio o link agora e deixo isso resolvido em poucos minutos.",
    },
    {
      key: "payment:confidence",
      family: "payment_recovery",
      text: "Seu pagamento ainda está em aberto. Posso te ajudar a concluir com segurança agora, sem perder o que já foi combinado.",
    },
    {
      key: "payment:deadline",
      family: "payment_recovery",
      text: "Consigo reativar sua cobrança agora e garantir a continuidade do seu pedido. Quer que eu faça isso por você?",
    },
  ],
};

function initialVariant(input: Omit<MessageVariant, "score" | "uses">): MessageVariant {
  return {
    ...input,
    score: 1,
    uses: 0,
  };
}

function applyOutcomeScore(
  current: MessageVariant,
  outcome: VariantOutcome,
  revenue?: number,
): MessageVariant {
  let delta = 0;
  if (outcome === "SOLD") delta = 10;
  else if (outcome === "REPLIED") delta = 2;
  else if (outcome === "SENT" || outcome === "DISPATCHED") delta = 1;
  else if (outcome === "SKIPPED") delta = -0.5;
  else if (outcome === "FAILED") delta = -2;

  const revenueBoost = revenue && revenue > 0 ? Math.min(revenue / 500, 10) : 0;

  return {
    ...current,
    score: Number((current.score + delta + revenueBoost).toFixed(3)),
    uses: current.uses + 1,
  };
}

export async function pickVariant(
  prisma: any,
  workspaceId: string,
  family: VariantFamily,
): Promise<MessageVariant> {
  const defaults = DEFAULT_VARIANTS[family].map(initialVariant);
  const keyPrefix =
    family === "payment_recovery" ? "cia_variant:payment_recovery:" : "cia_variant:followup:";

  const stored = prisma?.kloelMemory?.findMany
    ? await prisma.kloelMemory
        .findMany({
          where: {
            workspaceId,
            category: "cia_variant",
            key: { startsWith: keyPrefix },
          },
          take: 20,
        })
        .catch(() => [])
    : [];

  const storedMap = new Map<string, MessageVariant>();
  for (const item of stored || []) {
    const value = (item?.value || {}) as Partial<MessageVariant>;
    if (value?.key) {
      storedMap.set(String(value.key), {
        key: String(value.key),
        family,
        text: String(value.text || item.content || ""),
        score: Number(value.score || 1) || 1,
        uses: Number(value.uses || 0) || 0,
      });
    }
  }

  const merged = defaults.map((variant) => storedMap.get(variant.key) || variant);
  const pool =
    storedMap.size === 0
      ? merged.filter((variant) => variant.uses === 0 || variant.score > 1)
      : merged;

  return [...pool].sort((a, b) => {
    const left = a.score / Math.max(1, a.uses);
    const right = b.score / Math.max(1, b.uses);
    if (right !== left) return right - left;
    return a.uses - b.uses;
  })[0];
}

export async function recordDecisionLog(
  prisma: any,
  input: {
    workspaceId: string;
    contactId?: string;
    phone?: string;
    variantKey?: string | null;
    intent: string;
    message?: string;
    outcome: VariantOutcome;
    priority?: number;
    metadata?: Record<string, any>;
  },
) {
  if (!prisma?.kloelMemory?.create) return null;

  return prisma.kloelMemory.create({
    data: {
      workspaceId: input.workspaceId,
      key: `decision_log:${input.contactId || input.phone || "workspace"}:${Date.now()}:${randomUUID()}`,
      value: {
        variantKey: input.variantKey || null,
        intent: input.intent,
        message: input.message || null,
        outcome: input.outcome,
        priority: input.priority || null,
        metadata: input.metadata || {},
      },
      category: "decision_log",
      type: input.intent,
      content: input.message || input.intent,
      metadata: {
        contactId: input.contactId || null,
        phone: input.phone || null,
        outcome: input.outcome,
        variantKey: input.variantKey || null,
      },
    },
  });
}

export async function updateVariantOutcome(
  prisma: any,
  input: {
    workspaceId: string;
    family: VariantFamily;
    variant: MessageVariant;
    outcome: VariantOutcome;
    revenue?: number;
  },
) {
  if (!prisma?.kloelMemory?.upsert) return null;

  const key = `cia_variant:${input.family}:${input.variant.key}`;
  const existing = prisma?.kloelMemory?.findUnique
    ? await prisma.kloelMemory
        .findUnique({
          where: {
            workspaceId_key: {
              workspaceId: input.workspaceId,
              key,
            },
          },
        })
        .catch(() => null)
    : null;

  const current: MessageVariant = existing?.value
    ? {
        key: String(existing.value.key || input.variant.key),
        family: input.family,
        text: String(existing.value.text || input.variant.text),
        score: Number(existing.value.score || input.variant.score) || 1,
        uses: Number(existing.value.uses || input.variant.uses) || 0,
      }
    : input.variant;

  const next = applyOutcomeScore(current, input.outcome, input.revenue);

  await prisma.kloelMemory.upsert({
    where: {
      workspaceId_key: {
        workspaceId: input.workspaceId,
        key,
      },
    },
    update: {
      value: next,
      content: next.text,
      metadata: {
        outcome: input.outcome,
        revenue: input.revenue || 0,
      },
    },
    create: {
      workspaceId: input.workspaceId,
      key,
      value: next,
      category: "cia_variant",
      type: input.family,
      content: next.text,
      metadata: {
        outcome: input.outcome,
        revenue: input.revenue || 0,
      },
    },
  });

  return next;
}

export async function computeLearningSnapshot(
  prisma: any,
  workspaceId: string,
): Promise<LearningSnapshot> {
  const logs = prisma?.kloelMemory?.findMany
    ? await prisma.kloelMemory
        .findMany({
          where: {
            workspaceId,
            category: "decision_log",
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        })
        .catch(() => [])
    : [];

  const variantScores = new Map<string, number>();
  let soldCount = 0;
  let sentCount = 0;
  let failedCount = 0;

  for (const item of logs || []) {
    const value = (item?.value || {}) as any;
    const outcome = String(value?.outcome || item?.metadata?.outcome || "");
    const variantKey = String(value?.variantKey || item?.metadata?.variantKey || "");

    if (outcome === "SOLD") soldCount += 1;
    if (outcome === "SENT" || outcome === "REPLIED" || outcome === "SOLD") {
      sentCount += 1;
    }
    if (outcome === "FAILED") failedCount += 1;

    if (variantKey) {
      const score =
        outcome === "SOLD"
          ? 10
          : outcome === "REPLIED"
            ? 2
            : outcome === "SENT"
              ? 1
              : outcome === "FAILED"
                ? -2
                : 0;
      variantScores.set(variantKey, (variantScores.get(variantKey) || 0) + score);
    }
  }

  const [topVariantKey, topVariantScore] = [...variantScores.entries()].sort(
    (a, b) => b[1] - a[1],
  )[0] || [null, 0];

  return {
    totalLogs: logs.length,
    soldCount,
    sentCount,
    failedCount,
    topVariantKey,
    topVariantScore,
  };
}
