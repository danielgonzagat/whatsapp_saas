import type { UnknownRecord } from '../common/types';
export type { UnknownRecord };

export function titleForHighRiskTool(toolName: string): string {
  if (toolName === 'create_campaign') {
    return 'Aprovar criacao de campanha pela CIA';
  }
  if (toolName === 'change_plan') {
    return 'Aprovar alteracao de plano pela CIA';
  }
  if (toolName === 'products.review_and_publish' || toolName === 'publish_product') {
    return 'Aprovar publicacao de produto pela CIA';
  }
  return `Aprovar acao ${toolName}`;
}

export function promptForHighRiskTool(toolName: string, args: UnknownRecord): string {
  if (toolName === 'create_campaign') {
    const name = typeof args.name === 'string' && args.name.trim() ? args.name.trim() : 'sem nome';
    const audience =
      typeof args.targetAudience === 'string' && args.targetAudience.trim()
        ? args.targetAudience.trim()
        : 'all';
    return `A CIA quer criar a campanha "${name}" para o publico "${audience}". Revise antes de autorizar qualquer disparo.`;
  }
  if (toolName === 'change_plan') {
    const plan =
      typeof args.newPlan === 'string' && args.newPlan.trim()
        ? args.newPlan.trim()
        : typeof args.planId === 'string' && args.planId.trim()
          ? args.planId.trim()
          : typeof args.plan === 'string' && args.plan.trim()
            ? args.plan.trim()
            : 'plano solicitado';
    return `A CIA quer alterar o plano do workspace para "${plan}". Revise impacto de cobranca e limites antes de autorizar.`;
  }
  if (toolName === 'products.review_and_publish' || toolName === 'publish_product') {
    const product =
      typeof args.productName === 'string' && args.productName.trim()
        ? args.productName.trim()
        : typeof args.productId === 'string' && args.productId.trim()
          ? args.productId.trim()
          : 'produto solicitado';
    return `A CIA quer publicar o produto "${product}". Isso pode liberar venda real, checkout e afiliados; revise antes de autorizar.`;
  }
  return `A CIA solicitou a acao ${toolName}. Revise o contexto antes de executar.`;
}

export function isSupportedApprovedHighRiskTool(toolName: string): boolean {
  return (
    toolName === 'create_campaign' ||
    toolName === 'change_plan' ||
    toolName === 'products.review_and_publish' ||
    toolName === 'publish_product'
  );
}

/**
 * Strip sensitive fields (password, token, secret, cpf, ssn, full PAN/card)
 * from a tool args record before persisting to the audit log.
 */
export function sanitizeDetails(args: UnknownRecord): UnknownRecord {
  const SENSITIVE_KEY_RE = /password|token|secret|cpf|ssn|card|pan/i;
  const out: UnknownRecord = {};
  for (const [k, v] of Object.entries(args ?? {})) {
    if (SENSITIVE_KEY_RE.test(k)) {
      continue;
    }
    out[k] = v;
  }
  return out;
}

export function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
