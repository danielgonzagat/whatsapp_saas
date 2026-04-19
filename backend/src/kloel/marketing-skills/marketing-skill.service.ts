import { Injectable } from '@nestjs/common';
import { MARKETING_SKILL_CATALOG } from './marketing-skill.catalog';
import { MarketingSkillContextBuilder } from './marketing-skill.context';
import { MarketingSkillLoader } from './marketing-skill.loader';
import { MarketingSkillRouter } from './marketing-skill.router';
import type {
  MarketingSkillPacket,
  MarketingSkillSelection,
  MarketingWorkspaceSnapshot,
} from './marketing-skill.types';

@Injectable()
export class MarketingSkillService {
  constructor(
    private readonly loader: MarketingSkillLoader,
    private readonly router: MarketingSkillRouter,
    private readonly contextBuilder: MarketingSkillContextBuilder,
  ) {}

  listInstalledSkillIds(): string[] {
    return this.loader.listInstalledSkillIds();
  }

  async buildPacket(workspaceId: string, message: string): Promise<MarketingSkillPacket | null> {
    if (!this.router.isMarketingRequest(message)) {
      return null;
    }

    const hits = this.router.route(message);
    if (hits.length === 0) {
      return null;
    }

    const selectedSkills: MarketingSkillSelection[] = hits
      .map((hit) => {
        const catalogEntry = MARKETING_SKILL_CATALOG.find((entry) => entry.id === hit.id);
        if (!catalogEntry) return null;

        return {
          ...hit,
          title: catalogEntry.title,
          summary: catalogEntry.summary,
          excerpt: this.loader.loadSkillExcerpt(hit.id),
        };
      })
      .filter((entry): entry is MarketingSkillSelection => entry !== null);

    if (selectedSkills.length === 0) {
      return null;
    }

    const snapshot = await this.contextBuilder.buildSnapshot(workspaceId);

    return {
      isMarketingRequest: true,
      selectedSkills,
      snapshot,
      promptAddendum: this.buildPromptAddendum(selectedSkills, snapshot),
    };
  }

  private buildPromptAddendum(
    selectedSkills: MarketingSkillSelection[],
    snapshot: MarketingWorkspaceSnapshot,
  ): string {
    const skillLines = selectedSkills.map(
      (skill) =>
        `- ${skill.id}: ${skill.summary}. Motivo: ${skill.reasons.join(', ') || 'roteado por contexto'}.`,
    );

    const frameworkLines = selectedSkills.map((skill) => {
      const excerpt = skill.excerpt || 'Framework markdown indisponível no deploy atual.';
      return `### ${skill.title}\n${excerpt}`;
    });

    return [
      'MODO MARKETING ATIVADO',
      'Você está respondendo uma solicitação de marketing/vendas/growth.',
      'Adaptação obrigatória:',
      '- escreva em português brasileiro nativo',
      '- use referências de info-produto, creator commerce e e-commerce brasileiros quando fizer sentido',
      '- não traduza literalmente playbooks de SaaS americano',
      '- quando houver dado real do workspace, priorize esse dado antes de conselho genérico',
      '- se faltar dado real, diga exatamente o que está faltando',
      '',
      'Skills selecionados:',
      ...skillLines,
      '',
      'Snapshot real do workspace:',
      JSON.stringify(snapshot),
      '',
      'Frameworks relevantes:',
      ...frameworkLines,
    ].join('\n');
  }
}
