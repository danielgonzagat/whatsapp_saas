import { Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { StructuredLogger } from '../../logging/structured-logger';
import { OpsAlertService } from '../../observability/ops-alert.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  classifyMemorySafety,
  sanitizeAgentRuntimeText,
  toInputJsonValue,
} from './agent-runtime.sanitizer';
import type { AgentSkillDefinition, AgentSkillSelection } from './agent-runtime.types';

const DEFAULT_SKILLS: AgentSkillDefinition[] = [
  {
    id: 'checkout-recovery',
    title: 'Checkout Recovery',
    summary: 'Recupera intenção de compra com memória do lead, produto e política comercial.',
    category: 'commercial',
    riskLevel: 'normal',
    allowedTools: ['get_lead_details', 'list_products', 'create_payment_link'],
    requiredEvidence: ['lead_status', 'product_offer', 'payment_policy'],
    validation: ['workspace_isolation', 'no_fake_discount', 'payment_link_audit'],
    rollback: ['do_not_send_without_consent', 'cancel_scheduled_followup_if_requested'],
    metrics: ['conversion_rate', 'response_rate', 'refund_rate'],
    body: 'Use histórico observado do lead e dados reais de produto. Se faltar preço, estoque, garantia ou forma de pagamento, peça dado faltante antes de prometer.',
    version: 1,
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: 'objection-handling',
    title: 'Objection Handling',
    summary: 'Responde objeções usando memória de produto, casos anteriores e limites de desconto.',
    category: 'commercial',
    riskLevel: 'normal',
    allowedTools: ['get_lead_details', 'list_products', 'remember_user_info'],
    requiredEvidence: ['objection_text', 'product_claims', 'sales_policy'],
    validation: ['do_not_invent_claims', 'respect_discount_limit'],
    rollback: ['mark_lead_for_human_review_when_claim_uncertain'],
    metrics: ['objection_resolution_rate', 'handoff_rate'],
    body: 'Valide a emoção, responda com evidência real e avance um próximo passo simples. Não invente escassez, garantia ou resultado.',
    version: 1,
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: 'pulse-self-check',
    title: 'PULSE Self Check',
    summary: 'Consulta o estado operacional PULSE antes de planejar ação autônoma.',
    category: 'pulse',
    riskLevel: 'safe',
    allowedTools: [],
    requiredEvidence: ['pulse_certificate', 'machine_readiness', 'directive'],
    validation: ['no_overclaim', 'authority_boundary'],
    rollback: ['stop_when_pulse_degraded'],
    metrics: ['blocked_overclaims', 'safe_next_units'],
    body: 'Trate PULSE como fonte de verdade operacional. Diferencie canWorkNow de canDeclareComplete.',
    version: 1,
    updatedAt: new Date(0).toISOString(),
  },
];

const VALID_SKILL_ID_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const MAX_SKILL_CONTENT_CHARS = 100_000;

@Injectable()
export class AgentRuntimeSkillRegistry {
  private readonly logger = StructuredLogger.from(AgentRuntimeSkillRegistry.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  async listSkills(workspaceId: string): Promise<AgentSkillDefinition[]> {
    const rows = await this.prisma.kloelMemory.findMany({
      where: { workspaceId, category: 'agent_skill' },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: { value: true },
    });

    const stored = rows
      .map((row) => this.parseSkill(row.value))
      .filter((skill): skill is AgentSkillDefinition => skill !== null);
    return this.mergeDefaults(stored);
  }

  async selectSkills(workspaceId: string, message: string, limit = 3): Promise<AgentSkillSelection[]> {
    const normalized = sanitizeAgentRuntimeText(message, 1000).toLowerCase();
    const skills = await this.listSkills(workspaceId);
    return skills
      .map((skill) => {
        const haystack = [
          skill.id,
          skill.title,
          skill.summary,
          skill.body,
          ...skill.allowedTools,
          ...skill.requiredEvidence,
        ]
          .join(' ')
          .toLowerCase();
        const words = normalized.split(/\s+/).filter((word) => word.length >= 4);
        const hits = words.filter((word) => haystack.includes(word));
        const score = hits.length + (haystack.includes(normalized) ? 3 : 0);
        return {
          skill,
          score,
          reasons: hits.slice(0, 5).map((word) => `match:${word}`),
        };
      })
      .filter((selection) => selection.score > 0 || selection.skill.category === 'pulse')
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, Math.min(limit, 8)));
  }

  async upsertSkill(workspaceId: string, skill: AgentSkillDefinition): Promise<{
    ok: boolean;
    reasons: string[];
    version?: number;
  }> {
    const validationErrors = this.validateSkill(skill);
    if (validationErrors.length > 0) {
      return { ok: false, reasons: validationErrors };
    }
    const content = this.skillContent(skill);
    const safety = classifyMemorySafety(content);
    if (!safety.safe) {
      return { ok: false, reasons: safety.reasons };
    }

    try {
      const existingRow = await this.prisma.kloelMemory.findUnique({
        where: { workspaceId_key: { workspaceId, key: `agent_skill:${skill.id}` } },
        select: { value: true },
      });
      const existingSkill = existingRow ? this.parseSkill(existingRow.value) : null;
      const now = new Date().toISOString();
      const version = existingSkill
        ? Math.max(existingSkill.version + 1, skill.version || 1)
        : Math.max(skill.version || 1, 1);
      const persistedSkill: AgentSkillDefinition = {
        ...skill,
        version,
        updatedAt: now,
      };
      const persistedContent = this.skillContent(persistedSkill);
      const metadata = {
        kind: 'agent_skill',
        version,
        previousVersion: existingSkill?.version ?? null,
        riskLevel: persistedSkill.riskLevel,
        category: persistedSkill.category,
        updatedAt: now,
      } satisfies Prisma.InputJsonObject;

      await this.prisma.kloelMemory.upsert({
        where: { workspaceId_key: { workspaceId, key: `agent_skill:${skill.id}` } },
        update: {
          value: toInputJsonValue(persistedSkill),
          content: persistedContent,
          type: persistedSkill.category,
          metadata,
        },
        create: {
          workspaceId,
          key: `agent_skill:${skill.id}`,
          category: 'agent_skill',
          type: persistedSkill.category,
          value: toInputJsonValue(persistedSkill),
          content: persistedContent,
          metadata,
        },
      });
      return { ok: true, reasons: [], version };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'AgentRuntimeSkillRegistry.upsertSkill');
      this.logger.warn(`Failed to upsert agent skill: ${this.messageFor(error)}`);
      return { ok: false, reasons: ['persistence_failed'] };
    }
  }

  private mergeDefaults(stored: AgentSkillDefinition[]): AgentSkillDefinition[] {
    const byId = new Map<string, AgentSkillDefinition>();
    for (const skill of DEFAULT_SKILLS) byId.set(skill.id, skill);
    for (const skill of stored) byId.set(skill.id, skill);
    return [...byId.values()];
  }

  private parseSkill(value: Prisma.JsonValue): AgentSkillDefinition | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    const record = value as Record<string, unknown>;
    if (typeof record.id !== 'string' || typeof record.title !== 'string') {
      return null;
    }
    return {
      id: record.id,
      title: record.title,
      summary: typeof record.summary === 'string' ? record.summary : '',
      category: this.categoryFor(record.category),
      riskLevel: this.riskFor(record.riskLevel),
      allowedTools: this.stringArray(record.allowedTools),
      requiredEvidence: this.stringArray(record.requiredEvidence),
      validation: this.stringArray(record.validation),
      rollback: this.stringArray(record.rollback),
      metrics: this.stringArray(record.metrics),
      body: typeof record.body === 'string' ? record.body : '',
      version: typeof record.version === 'number' ? record.version : 1,
      updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date().toISOString(),
    };
  }

  private skillContent(skill: AgentSkillDefinition): string {
    return [
      `${skill.title}: ${skill.summary}`,
      `risk=${skill.riskLevel}`,
      `tools=${skill.allowedTools.join(', ') || 'none'}`,
      `evidence=${skill.requiredEvidence.join(', ') || 'none'}`,
      `validation=${skill.validation.join(', ') || 'none'}`,
      `rollback=${skill.rollback.join(', ') || 'none'}`,
      `metrics=${skill.metrics.join(', ') || 'none'}`,
      skill.body,
    ].join('\n');
  }

  private validateSkill(skill: AgentSkillDefinition): string[] {
    const errors: string[] = [];
    if (!VALID_SKILL_ID_RE.test(skill.id)) {
      errors.push('invalid_skill_id');
    }
    if (!skill.title.trim()) {
      errors.push('missing_title');
    }
    if (!skill.summary.trim()) {
      errors.push('missing_summary');
    }
    const content = this.skillContent(skill);
    if (content.length > MAX_SKILL_CONTENT_CHARS) {
      errors.push('skill_too_large');
    }
    if (skill.riskLevel === 'critical' && skill.validation.length === 0) {
      errors.push('critical_skill_requires_validation');
    }
    return errors;
  }

  private stringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === 'string')
      : [];
  }

  private categoryFor(value: unknown): AgentSkillDefinition['category'] {
    return value === 'commercial' || value === 'operational' || value === 'pulse' || value === 'workspace'
      ? value
      : 'operational';
  }

  private riskFor(value: unknown): AgentSkillDefinition['riskLevel'] {
    return value === 'safe' || value === 'normal' || value === 'high' || value === 'critical'
      ? value
      : 'normal';
  }

  private messageFor(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
