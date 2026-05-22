/**
 * UTP-ROLE-004 — Role Metric Registry.
 *
 * Defines which metrics are relevant for each role.
 * Metrics are tied to the real levers of the role (B0.3).
 * A producer cares about conversion rate and refund rate;
 * an affiliate cares about commission and CPC; an agency
 * cares about margin per client and churn.
 *
 * Pure function registry — no DI, no side effects.
 */

import type { Role, RoleMetric } from './types';
import { ALL_ROLES } from './types';

const ROLE_METRICS: readonly RoleMetric[] = [
  {
    metricName: 'conversion_rate',
    label: 'Taxa de Conversao',
    unit: '%',
    relevantRoles: ['produtor', 'closer', 'gestor'],
    description: 'Percentual de leads que convertem em venda',
  },
  {
    metricName: 'refund_rate',
    label: 'Taxa de Reembolso',
    unit: '%',
    relevantRoles: ['produtor', 'gestor'],
    description: 'Percentual de vendas reembolsadas',
  },
  {
    metricName: 'average_ticket',
    label: 'Ticket Medio',
    unit: 'BRL',
    relevantRoles: ['produtor', 'closer', 'gestor'],
    description: 'Valor medio das vendas realizadas',
  },
  {
    metricName: 'customer_ltv',
    label: 'LTV do Cliente',
    unit: 'BRL',
    relevantRoles: ['produtor', 'gestor', 'agencia'],
    description: 'Valor vitalicio estimado do cliente',
  },
  {
    metricName: 'commission_rate',
    label: 'Taxa de Comissao',
    unit: '%',
    relevantRoles: ['afiliado', 'produtor'],
    description: 'Percentual de comissao recebida/oferecida',
  },
  {
    metricName: 'cost_per_click',
    label: 'CPC',
    unit: 'BRL',
    relevantRoles: ['afiliado', 'creator'],
    description: 'Custo medio por clique em anuncios',
  },
  {
    metricName: 'return_on_ad_spend',
    label: 'ROAS',
    unit: 'x',
    relevantRoles: ['afiliado', 'creator', 'produtor'],
    description: 'Retorno sobre investimento em anuncios',
  },
  {
    metricName: 'audience_growth',
    label: 'Crescimento de Audiencia',
    unit: '/mes',
    relevantRoles: ['creator', 'afiliado'],
    description: 'Novos seguidores/inscritos por mes',
  },
  {
    metricName: 'engagement_rate',
    label: 'Taxa de Engajamento',
    unit: '%',
    relevantRoles: ['creator'],
    description: 'Percentual da audiencia que interage com conteudo',
  },
  {
    metricName: 'margin_per_client',
    label: 'Margem por Cliente',
    unit: 'BRL/mes',
    relevantRoles: ['agencia'],
    description: 'Margem liquida por cliente no portfolio',
  },
  {
    metricName: 'client_churn_rate',
    label: 'Churn de Clientes',
    unit: '%/mes',
    relevantRoles: ['agencia'],
    description: 'Percentual de clientes que cancelam por mes',
  },
  {
    metricName: 'team_utilisation',
    label: 'Utilizacao do Time',
    unit: '%',
    relevantRoles: ['agencia', 'gestor'],
    description: 'Percentual de capacidade do time utilizada',
  },
  {
    metricName: 'deal_close_rate',
    label: 'Taxa de Fechamento',
    unit: '%',
    relevantRoles: ['closer', 'gestor', 'produtor'],
    description: 'Percentual de negocios ganhos no pipeline',
  },
  {
    metricName: 'pipeline_velocity',
    label: 'Velocidade do Pipeline',
    unit: 'dias',
    relevantRoles: ['closer', 'gestor'],
    description: 'Tempo medio de lead ate venda fechada',
  },
  {
    metricName: 'operational_efficiency',
    label: 'Eficiencia Operacional',
    unit: '%',
    relevantRoles: ['gestor', 'agencia'],
    description: 'Receita por custo operacional',
  },
  {
    metricName: 'domain_coverage',
    label: 'Cobertura de Dominio',
    unit: '%',
    relevantRoles: ['especialista'],
    description: 'Percentual de requisitos do dominio atendidos',
  },
  {
    metricName: 'certification_compliance',
    label: 'Conformidade Certificada',
    unit: '%',
    relevantRoles: ['especialista'],
    description: 'Percentual de processos certificados no dominio',
  },
];

const METRICS_BY_ROLE = new Map<Role, RoleMetric[]>();
for (const role of ALL_ROLES) {
  METRICS_BY_ROLE.set(role, []);
}
for (const metric of ROLE_METRICS) {
  for (const role of metric.relevantRoles) {
    const list = METRICS_BY_ROLE.get(role);
    if (list) {
      list.push(metric);
    }
  }
}

/**
 * UTP-ROLE-004: get the metrics relevant to a given role.
 */
export function getRelevantMetricsForRole(role: Role): readonly RoleMetric[] {
  return METRICS_BY_ROLE.get(role) ?? [];
}

/**
 * UTP-ROLE-004: get all registered metrics.
 */
export function getAllMetrics(): readonly RoleMetric[] {
  return ROLE_METRICS;
}

/**
 * UTP-ROLE-004: get metrics relevant to multiple roles (union).
 */
export function getMetricsForRoles(roles: readonly Role[]): readonly RoleMetric[] {
  const seen = new Set<string>();
  const result: RoleMetric[] = [];
  for (const role of roles) {
    for (const m of getRelevantMetricsForRole(role)) {
      if (!seen.has(m.metricName)) {
        seen.add(m.metricName);
        result.push(m);
      }
    }
  }
  return result;
}
