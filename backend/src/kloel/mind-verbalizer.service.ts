import { Injectable } from '@nestjs/common';
import { MindBeliefService } from './mind-belief.service';
import { MindPolicyService } from './mind-policy.service';
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

@Injectable()
export class MindVerbalizerService {
  constructor(
    private readonly beliefs: MindBeliefService,
    private readonly policy: MindPolicyService,
  ) {}

  async narrate(workspaceId: string): Promise<string> {
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

    const liftTypes = ['followup_timing', 'conversion_optimization'];
    const liftResults = await Promise.all(
      liftTypes.map(async (dt) => {
        const h = await this.policy.harness(workspaceId, dt, 14);
        return { dt, lift: h.lift };
      }),
    );

    const meaningfulLifts = liftResults.filter((r) => Math.abs(r.lift) > 0.05);

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
}
