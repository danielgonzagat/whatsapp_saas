/**
 * UTP-COLDSTART-005 — Micro-Test Designer.
 *
 * Designs a low-risk, measurable test for one hypothesis. A micro-test
 * has concrete action steps, a success metric, a measurement method,
 * and a minimum sample size.
 *
 * Implements B0.8: hipotese → teste minimo → autorizacao → execucao
 * → observacao → conclusao honesta → atualizacao de crenca.
 *
 * Pure function. Stateless.
 */
import { randomUUID } from 'node:crypto';
import type { HypothesisTemplate } from './coldstart.types';
import type { MicroTest } from './coldstart.types';

export interface DesignMicroTestInput {
  readonly template: HypothesisTemplate;
  readonly workspaceId: string;
  readonly ownerAnswer?: string | undefined;
  readonly nowMs?: number | undefined;
}

export function designMicroTest(input: DesignMicroTestInput): MicroTest {
  const now = new Date(input.nowMs ?? Date.now()).toISOString();
  const testId = `mtest_${randomUUID()}`;
  const { template } = input;

  const actionSteps =
    template.suggestedMicroTests.length > 0
      ? [...template.suggestedMicroTests]
      : ['executar acao minima de validacao'];

  const description = `Micro-teste para hipotese "${template.label}": ${template.description}`;
  const successMetric = successMetricForCategory(template.category);
  const measurementMethod = measurementMethodForCategory(template.category);
  const estimatedDurationHours = estimatedDuration(template.category);
  const minimumSampleSize = minimumSample(template.category);

  return {
    testId,
    workspaceId: input.workspaceId,
    hypothesisTemplateId: template.templateId,
    description,
    actionSteps,
    estimatedDurationHours,
    successMetric,
    measurementMethod,
    minimumSampleSize,
    truthMode: 'inferred',
    designedAt: now,
  };
}

function successMetricForCategory(category: string): string {
  switch (category) {
    case 'audience':
      return '≥ 3 leads convertidos com perfil validado';
    case 'offer':
      return '≥ 30% aumento na taxa de resposta positiva';
    case 'objection':
      return '≥ 1 objecao superada com evidencia';
    case 'channel':
      return '≥ 20% reducao no CPA ou ≥ 20% aumento na taxa de resposta';
    case 'pricing':
      return '≥ 10% aumento na receita sem queda > 20% no volume';
    case 'messaging':
      return '≥ 20% aumento na taxa de resposta em 24h';
    default:
      return 'melhora mensuravel na metrica alvo';
  }
}

function measurementMethodForCategory(category: string): string {
  switch (category) {
    case 'audience':
    case 'messaging':
      return 'comparacao antes/depois da taxa de conversao ou resposta';
    case 'offer':
    case 'objection':
      return 'contagem de leads que avancam no pipeline apos intervencao';
    case 'channel':
      return 'calculo de CPA e taxa de resposta por canal';
    case 'pricing':
      return 'calculo de receita total vs volume de vendas';
    default:
      return 'comparacao de metrica antes/depois';
  }
}

function estimatedDuration(category: string): number {
  switch (category) {
    case 'pricing':
      return 168;
    case 'channel':
      return 72;
    case 'audience':
      return 48;
    case 'offer':
    case 'objection':
    case 'messaging':
      return 24;
    default:
      return 48;
  }
}

function minimumSample(category: string): number {
  switch (category) {
    case 'pricing':
    case 'channel':
      return 20;
    case 'audience':
      return 5;
    case 'offer':
    case 'objection':
    case 'messaging':
      return 10;
    default:
      return 10;
  }
}
