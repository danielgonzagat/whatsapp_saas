import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StructuredLogger } from '../logging/structured-logger';
import OpenAI from 'openai';
import { createTextLlmClient } from '../lib/llm-provider';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { LLMBudgetService, estimateChatCostCents } from './llm-budget.service';
import { chatCompletionWithFallback, LLM_MAX_COMPLETION_TOKENS } from './openai-wrapper';
import { MindBeliefService } from './mind-belief.service';
import { MindPolicyService } from './mind-policy.service';
import { MIND_DECISION_TYPES } from './mind-decision-catalog';
import type { MindBelief } from './mind.types';

interface VerbalizerBlock {
  beliefs: MindBelief[];
  label: string;
}

function safeString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return value.toString();
  }
  return '';
}

function contextLabel(context: Record<string, unknown>): string {
  const parts: string[] = [];
  const channel = safeString(context.channel);
  if (channel) parts.push(`canal ${channel}`);
  const segment = safeString(context.segment);
  if (segment) parts.push(`segmento ${segment}`);
  const hour = context.hour;
  if (typeof hour === 'number') {
    parts.push(`hora ${hour}h`);
  }
  const planTier = safeString(context.plan_tier);
  if (planTier) parts.push(`plano ${planTier}`);
  const priceBand = safeString(context.price_band);
  if (priceBand) parts.push(`faixa ${priceBand}`);
  if (parts.length === 0) return 'contexto geral';
  return parts.join(', ');
}

function beliefPhrase(belief: MindBelief, predicateLabel: string): string {
  const mean = belief.mean;
  const samples = belief.samples;
  const ctx = contextLabel(belief.context);
  const certainty = samples < 10 ? ' estimativa inicial com' : ' observação consolidada com';

  const meanDesc =
    mean < 0.15
      ? 'muito baixa'
      : mean < 0.35
        ? 'baixa'
        : mean < 0.65
          ? 'moderada'
          : mean < 0.85
            ? 'alta'
            : 'muito alta';

  return `${predicateLabel} é ${meanDesc} (${(mean * 100).toFixed(0)}%) para ${ctx} —${certainty} ${samples} eventos registrados.`;
}

function predicateLabel(predicate: string): string {
  if (predicate.startsWith('P(reply')) return 'Probabilidade de resposta';
  if (predicate.startsWith('P(conversion')) return 'Probabilidade de conversão';
  if (predicate.startsWith('P(churn')) return 'Risco de abandono';
  return predicate;
}

const HINT_RE = /[_-]+/g;

const KNOWN_LIFT_TYPES = MIND_DECISION_TYPES;

interface LiftResult {
  decisionType: string;
  lift: number;
  baselineMean: number;
  mindMean: number;
  n: number;
  pZScore: number;
}

interface BeliefDatum {
  subject: string;
  predicate: string;
  context: Record<string, string>;
  mean: number;
  samples: number;
}

function buildLlmPrompt(beliefs: BeliefDatum[], lifts: LiftResult[]): string {
  const beliefLines = beliefs.map(
    (b) =>
      `  - ${b.predicate} | sujeito=${b.subject} | contexto=${JSON.stringify(b.context)} | média=${(b.mean * 100).toFixed(1)}% | amostras=${b.samples}`,
  );

  const liftLines = lifts
    .filter((l) => Math.abs(l.lift) > 0.03)
    .map((l) => {
      const type = l.decisionType.replace(HINT_RE, ' ');
      return `  - ${type}: lift=${(l.lift * 100).toFixed(1)}% | baseline=${(l.baselineMean * 100).toFixed(1)}% | MIND=${(l.mindMean * 100).toFixed(1)}% | n=${l.n} | z=${l.pZScore.toFixed(2)}`;
    });

  return [
    'Resuma em português o estado atual da MIND (Motor de Inteligência de Decisões) deste workspace em um briefing executivo de 3-5 parágrafos, conciso e informativo.',
    '',
    'CRENÇAS BAYESIANAS:',
    ...(beliefLines.length ? beliefLines : ['  (nenhuma crença formada ainda)']),
    '',
    'MÉTRICAS DE DECISÃO (lift vs baseline):',
    ...(liftLines.length ? liftLines : ['  (nenhuma métrica disponível)']),
    '',
    'DIRETRIZES:',
    '- Use linguagem executiva em português do Brasil.',
    '- Destaque padrões estatisticamente significativos.',
    '- Alerte sobre quedas de performance e baixa amostragem.',
    '- Se não houver dados suficientes, declare honestamente.',
    '- NÃO invente números, produtos, preços ou políticas.',
    '- NÃO repita os dados brutos como lista — sintetize insights.',
    '- Formate o output como texto corrido, sem markdown ou bullets.',
  ].join('\n');
}

function buildRulesBasedNarrative(
  blocks: VerbalizerBlock[],
  allBeliefs: MindBelief[],
  meaningfulLifts: Array<{ dt: string; lift: number }>,
): string {
  const lines: string[] = ['Estado atual da MIND — briefing diário do workspace.', ''];

  for (const block of blocks) {
    const topBeliefs = block.beliefs.slice(0, 3);
    if (topBeliefs.length === 0) continue;

    lines.push(`— ${block.label}`);
    for (const belief of topBeliefs) {
      lines.push(beliefPhrase(belief, block.label));
    }
    lines.push('');
  }

  const totalSamples = allBeliefs.reduce((sum, b) => sum + b.samples, 0);
  const distinctSubjects = new Set(allBeliefs.map((b) => b.subject)).size;
  lines.push(`${totalSamples} observações totais em ${distinctSubjects} entidades distintas.`);

  if (meaningfulLifts.length > 0) {
    lines.push('');
    lines.push('Métricas de decisão:');
    for (const result of meaningfulLifts) {
      const raw = result.dt.replace(HINT_RE, ' ');
      const metric =
        result.lift >= 0
          ? `melhoria de ${(result.lift * 100).toFixed(0)}%`
          : `queda de ${Math.abs(result.lift * 100).toFixed(0)}%`;
      lines.push(`${raw}: ${metric} vs baseline.`);
    }
  }

  return lines.join('\n');
}

@Injectable()
export class MindVerbalizerService {
  private readonly logger = StructuredLogger.from(MindVerbalizerService.name);
  private readonly openai: OpenAI | null;
  private readonly verbalizerModel: string;

  constructor(
    private readonly beliefs: MindBeliefService,
    private readonly policy: MindPolicyService,
    private readonly config: ConfigService,
    private readonly budget: LLMBudgetService,
  ) {
    this.openai = createTextLlmClient(this.config);
    this.verbalizerModel = resolveBackendOpenAIModel('writer', this.config);
  }

  async narrate(workspaceId: string): Promise<string> {
    const startedAt = Date.now();

    const predicates = [
      'P(reply|template,hour,channel)',
      'P(conversion|segment,price_band,channel,hour)',
      'P(churn|days_idle,plan_tier,price_band)',
    ];

    const blocks: VerbalizerBlock[] = await Promise.all(
      predicates.map(async (predicate) => {
        const list = await this.beliefs.list(workspaceId, predicate);
        return { beliefs: list, label: predicateLabel(predicate) };
      }),
    );

    const allBeliefs = blocks.flatMap((b) => b.beliefs);

    if (allBeliefs.length === 0) {
      return 'A MIND ainda está formando as primeiras crenças a partir das observações do workspace. Ainda não há dados suficientes para declarar padrões estatísticos. Assim que as interações e eventos comerciais forem registrados, este briefing será atualizado automaticamente.';
    }

    const liftResults = await Promise.all(
      KNOWN_LIFT_TYPES.map(async (dt) => {
        const h = await this.policy.harness(workspaceId, dt, 14);
        return {
          decisionType: dt,
          lift: h.lift,
          baselineMean: h.baselineMean,
          mindMean: h.mindMean,
          n: h.n,
          pZScore: h.pZScore,
        };
      }),
    );

    const meaningfulLifts = liftResults.filter((r) => Math.abs(r.lift) > 0.05);

    const beliefData: BeliefDatum[] = allBeliefs.map((b) => ({
      subject: b.subject,
      predicate: b.predicate,
      context: Object.fromEntries(Object.entries(b.context).map(([k, v]) => [k, safeString(v)])),
      mean: b.mean,
      samples: b.samples,
    }));

    return this.tryLlm(beliefData, liftResults, workspaceId)
      .catch((err: unknown) => {
        const reason = err instanceof Error ? err.message : 'unknown_llm_error';
        this.logger.warn(
          `verbalizer LLM fallback ws=${workspaceId} reason=${reason.substring(0, 120)}`,
        );
        return null;
      })
      .then((llmOutput) => {
        if (llmOutput && llmOutput.trim().length >= 20) {
          const durationMs = Date.now() - startedAt;
          this.logger.log(`verbalizer llm ws=${workspaceId} ms=${durationMs}`);
          return llmOutput.trim();
        }

        const durationMs = Date.now() - startedAt;
        this.logger.log(`verbalizer rules-based ws=${workspaceId} ms=${durationMs}`);
        return buildRulesBasedNarrative(
          blocks,
          allBeliefs,
          meaningfulLifts.map((l) => ({ dt: l.decisionType, lift: l.lift })),
        );
      });
  }

  private async tryLlm(
    beliefData: BeliefDatum[],
    liftResults: LiftResult[],
    workspaceId: string,
  ): Promise<string | null> {
    if (!this.openai) {
      return null;
    }

    const prompt = buildLlmPrompt(beliefData, liftResults);
    const estimatedCostCents = estimateChatCostCents({
      inputChars: prompt.length,
      maxOutputTokens: Math.min(2048, LLM_MAX_COMPLETION_TOKENS),
    });

    await this.budget.assertBudget(workspaceId, estimatedCostCents);

    const result = await chatCompletionWithFallback(this.openai, {
      model: this.verbalizerModel,
      messages: [
        {
          role: 'system',
          content:
            'Você é o verbalizador da MIND, o motor de inteligência de decisões do KLOEL. ' +
            'Sua função é traduzir crenças bayesianas e métricas estatísticas em um briefing ' +
            'executivo em português do Brasil, conciso e informativo. Nunca invente dados.',
        },
        { role: 'user', content: prompt },
      ],
      max_completion_tokens: 2048,
      temperature: 0.3,
    });

    const actualCostCents = result.usage?.total_tokens
      ? Math.ceil(result.usage.total_tokens * 0.005)
      : estimatedCostCents;

    await this.budget.recordSpend(workspaceId, actualCostCents).catch(() => {
      /* record failure is non-blocking */
    });

    const content = result.choices[0]?.message?.content;
    return typeof content === 'string' ? content : null;
  }
}
