import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AngleSuggestion } from './types';
import { clamp } from '../../common/math';

interface AngleSuggestionInput {
  readonly offerId: string;
  readonly workspaceId: string;
  readonly offerCategory: string;
  readonly offerPrice: number;
  readonly offerProblemSolved: string;
  readonly audiencePainPoints: readonly string[];
}

interface AngleTemplate {
  readonly category: string;
  readonly triggers: readonly string[];
  readonly templates: readonly Omit<
    AngleTemplateInstance,
    'noveltyScore' | 'predictedPerformance'
  >[];
}

interface AngleTemplateInstance {
  readonly angle: string;
  readonly hook: string;
  readonly body: string;
  readonly targetEmotion: string;
  readonly noveltyScore: number;
  readonly predictedPerformance: number;
}

const ANGLE_TEMPLATES: readonly AngleTemplate[] = [
  {
    category: 'health',
    triggers: ['saude', 'bem-estar', 'emagrecimento', 'fitness'],
    templates: [
      {
        angle: 'Transformacao em 30 dias',
        hook: 'Ela mudou completamente em 30 dias. Veja como.',
        body: 'Descubra o metodo que ja transformou mais de 10 mil pessoas. Sem dietas malucas, sem academia, sem sofrimento.',
        targetEmotion: 'esperanca',
      },
      {
        angle: 'O que os medicos nao contam',
        hook: 'Medicos escondem isso ha decadas. Agora voce pode saber.',
        body: 'A industria farmaceutica nao quer que voce saiba disso. Um metodo natural que resolve a raiz do problema.',
        targetEmotion: 'curiosidade_indignacao',
      },
    ],
  },
  {
    category: 'finance',
    triggers: ['renda', 'investimento', 'dinheiro', 'financeiro'],
    templates: [
      {
        angle: 'Liberdade financeira antecipada',
        hook: 'Ele largou o emprego aos 35 anos. O metodo e mais simples do que parece.',
        body: 'Voce nao precisa trabalhar ate os 65. Com essa estrategia, e possivel antecipar sua aposentadoria em decadas.',
        targetEmotion: 'desejo_liberdade',
      },
      {
        angle: 'O segundo salario invisivel',
        hook: 'Enquanto voce dorme, seu dinheiro pode estar trabalhando.',
        body: 'Renda passiva nao e mito. Milhares de brasileiros ja estao recebendo um segundo salario sem sair de casa.',
        targetEmotion: 'seguranca',
      },
    ],
  },
  {
    category: 'education',
    triggers: ['curso', 'aprender', 'estudo', 'carreira', 'profissao'],
    templates: [
      {
        angle: 'A habilidade que dobra seu salario',
        hook: 'Essa unica habilidade pode dobrar seu salario em 6 meses.',
        body: 'O mercado esta desesperado por profissionais com essa competencia. E a maioria das pessoas nem sabe que ela existe.',
        targetEmotion: 'urgencia_oportunidade',
      },
      {
        angle: 'Estudei 4 anos para descobrir que isso era o que importava',
        hook: '4 anos de faculdade. 1 mes desse curso. Adivinha qual mudou minha vida.',
        body: 'A educacao tradicional falhou com uma geracao inteira. Aqui esta o que realmente funciona no mercado hoje.',
        targetEmotion: 'frustracao_alivio',
      },
    ],
  },
  {
    category: 'general',
    triggers: [],
    templates: [
      {
        angle: 'O segredo que [nicho] nao quer que voce saiba',
        hook: 'A industria de [nicho] esconde isso de voce. Ate agora.',
        body: 'Enquanto todo mundo esta fazendo X, os experts estao fazendo Y em silencio. Aqui esta o mapa.',
        targetEmotion: 'curiosidade',
      },
      {
        angle: 'De [antes] para [depois] em [tempo]',
        hook: 'De [antes] para [depois] em [tempo]. O passo a passo completo.',
        body: 'Nao e sorte. Nao e talento. E um sistema que qualquer pessoa pode seguir. E esta aqui, explicado em detalhes.',
        targetEmotion: 'esperanca',
      },
      {
        angle: 'Por que [autoridade] recomenda isso',
        hook: 'Se [autoridade] recomenda, voce deveria pelo menos olhar.',
        body: 'Quando os maiores especialistas do mercado comecam a recomendar a mesma coisa, e hora de prestar atencao.',
        targetEmotion: 'confianca_validacao',
      },
    ],
  },
];

@Injectable()
export class AngleSuggesterService {
  private readonly logger = new Logger(AngleSuggesterService.name);

  suggest(input: AngleSuggestionInput): readonly AngleSuggestion[] {
    const normalized = input.offerCategory.toLowerCase();
    const matchingTemplates = this.findMatchingTemplates(normalized);

    if (matchingTemplates.length === 0) {
      this.logger.debug(`No angle templates for category: ${input.offerCategory}`);
      return [];
    }

    const suggestions = matchingTemplates.map((template, index) => {
      const noveltyScore = clamp(0.5 + index * 0.05, 0, 1);
      const predictedPerformance = this.predictPerformance(input, template);

      return {
        id: `ang_${randomUUID()}`,
        offerId: input.offerId,
        workspaceId: input.workspaceId,
        angle: template.angle,
        hook: template.hook,
        body: template.body,
        targetEmotion: template.targetEmotion,
        noveltyScore: Math.round(noveltyScore * 1000) / 1000,
        predictedPerformance: Math.round(predictedPerformance * 1000) / 1000,
        generatedAt: new Date().toISOString(),
      };
    });

    this.logger.debug(
      `Generated ${suggestions.length} angle suggestions for offer ${input.offerId}`,
    );

    return suggestions;
  }

  private findMatchingTemplates(category: string): readonly Omit<AngleTemplateInstance, 'noveltyScore' | 'predictedPerformance'>[] {
    const exact = ANGLE_TEMPLATES.find(
      (t) => t.category === category,
    );
    if (exact) {return exact.templates;}

    for (const template of ANGLE_TEMPLATES) {
      for (const trigger of template.triggers) {
        if (category.includes(trigger)) {
          return template.templates;
        }
      }
    }

    const general = ANGLE_TEMPLATES.find((t) => t.category === 'general');
    return general?.templates ?? [];
  }

  private predictPerformance(
    input: AngleSuggestionInput,
    _template: Omit<AngleTemplateInstance, 'noveltyScore' | 'predictedPerformance'>,
  ): number {
    const painPointBonus = Math.min(input.audiencePainPoints.length * 0.05, 0.2);
    const priceSignal = input.offerPrice > 0 ? Math.min(input.offerPrice / 1000, 0.15) : 0;
    return clamp(0.45 + painPointBonus + priceSignal, 0, 1);
  }
}
