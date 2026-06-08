import { Injectable } from '@nestjs/common';
import type {
  PromptIntent,
  PromptRefineInput,
  PromptRefineResult,
  PromptScope,
} from './kloel-capabilities.types';

interface IntentRule {
  readonly intent: PromptIntent;
  readonly signals: RegExp;
  /** Context checks relevant to this intent (PT-BR questions when missing). */
  readonly contextChecks: ReadonlyArray<{ test: RegExp; question: string }>;
}

/**
 * PromptRefiner — deterministic intent classifier + prompt sharpener.
 *
 * Reimplemented by intent from the prompt-optimization decision framework:
 * classify the user's intent from signal words, estimate scope, detect missing
 * critical context, and emit a structured, ready-to-act prompt. Advisory only —
 * it never executes the underlying task; the chat uses the result to either ask
 * clarifying questions or proceed with a crisp brief. Pure logic, no provider call,
 * fully PT-BR-facing.
 */
@Injectable()
export class PromptRefinerCapability {
  private static readonly RULES: readonly IntentRule[] = [
    {
      intent: 'bug_fix',
      signals:
        /\b(corrig|conserta|bug|erro|n[aã]o funciona|quebrad|falha|fix|broken|not working|error)\b/i,
      contextChecks: [
        {
          test: /\b(erro|exce|stack|log|mensagem|message)\b/i,
          question: 'Qual é a mensagem de erro exata ou o comportamento observado?',
        },
        {
          test: /\b(reproduz|passo|quando|ao |steps|reproduce)\b/i,
          question: 'Como reproduzir o problema (passos)?',
        },
      ],
    },
    {
      intent: 'testing',
      signals: /\b(teste|testes|cobertura|test|coverage|spec|e2e)\b/i,
      contextChecks: [
        {
          test: /\b(unit|integra|e2e|tipo)\b/i,
          question: 'Que tipo de teste (unitário, integração, e2e)?',
        },
      ],
    },
    {
      intent: 'review',
      signals: /\b(revis|auditar|audit|review|verifique se|checar|c[oó]digo seguro)\b/i,
      contextChecks: [
        {
          test: /\b(arquivo|m[oó]dulo|pasta|pr|file|module)\b/i,
          question: 'Qual arquivo, módulo ou PR deve ser revisado?',
        },
      ],
    },
    {
      intent: 'refactor',
      signals:
        /\b(refator|reorganiz|limpa o c[oó]digo|reestrutur|refactor|clean up|restructure)\b/i,
      contextChecks: [
        {
          test: /\b(arquivo|m[oó]dulo|pasta|scope|escopo|file|module)\b/i,
          question: 'Qual é o escopo do refactor (arquivos/módulos)?',
        },
      ],
    },
    {
      intent: 'documentation',
      signals: /\b(document|docs|readme|coment[aá]ri|documenta[cç][aã]o)\b/i,
      contextChecks: [],
    },
    {
      intent: 'infrastructure',
      signals:
        /\b(deploy|implant|ci\/?cd|docker|kubernetes|banco de dados|database|pipeline|infra)\b/i,
      contextChecks: [
        {
          test: /\b(ambiente|env|produ[cç][aã]o|homolog|provedor|provider)\b/i,
          question: 'Qual ambiente/provedor (produção, homolog, etc.)?',
        },
      ],
    },
    {
      intent: 'design',
      signals:
        /\b(arquitetura|architecture|modelagem|modelo de dados|projetar|design (the|a|o|de)|planejar a estrutura)\b/i,
      contextChecks: [
        {
          test: /\b(requisito|restri[cç]|constraint|requirement|crit[eé]rio)\b/i,
          question: 'Quais são os requisitos e restrições principais?',
        },
      ],
    },
    {
      intent: 'research',
      signals:
        /\b(como (fazer|adicionar|integrar)|how to|investiga|pesquis|explore|o que [eé]|what is|qual a melhor forma)\b/i,
      contextChecks: [],
    },
    {
      intent: 'new_feature',
      signals:
        /\b(cri[ae]|construir|construa|implement|adicion|build|create|add|fazer (uma|um))\b/i,
      contextChecks: [
        {
          test: /\b(crit[eé]rio|aceita|done|pronto|requisito)\b/i,
          question: 'Quais são os critérios de aceitação (como saber que está pronto)?',
        },
      ],
    },
  ];

  /** Cross-cutting context checks applied to most coding intents. */
  private static readonly UNIVERSAL_CHECKS: ReadonlyArray<{
    test: RegExp;
    question: string;
    intents: ReadonlySet<PromptIntent>;
  }> = [
    {
      test: /\b(arquivo|m[oó]dulo|pasta|componente|endpoint|file|module|component|directory)\b/i,
      question: 'Em qual arquivo, módulo ou área do código a mudança deve acontecer?',
      intents: new Set<PromptIntent>(['new_feature', 'bug_fix', 'refactor', 'testing']),
    },
    {
      test: /\b(n[aã]o (fa[cç]a|altere|mexa)|exceto|sem (mexer|alterar)|do not|scope boundary|fora do escopo)\b/i,
      question: 'Há algo que NÃO deve ser alterado (limites de escopo)?',
      intents: new Set<PromptIntent>([
        'new_feature',
        'bug_fix',
        'refactor',
        'infrastructure',
        'design',
      ]),
    },
  ];

  refine(input: PromptRefineInput): PromptRefineResult {
    const prompt = input.prompt.trim();
    const { intent, confidence } = this.classifyIntent(prompt);
    const scope = this.assessScope(prompt);
    const missingContext = this.detectMissingContext(prompt, intent);
    const needsClarification = missingContext.length >= 3 || confidence < 0.4;
    const refinedPrompt = this.buildRefinedPrompt(prompt, intent, scope, missingContext);

    return {
      capability: 'prompt_refiner',
      intent,
      scope,
      intentConfidence: Math.round(confidence * 100) / 100,
      missingContext,
      refinedPrompt,
      needsClarification,
      summary: needsClarification
        ? `Intenção: ${this.intentLabel(intent)} (escopo ${this.scopeLabel(scope)}). Faltam ${missingContext.length} informação(ões) — recomendo perguntar antes de agir.`
        : `Intenção: ${this.intentLabel(intent)} (escopo ${this.scopeLabel(scope)}). Prompt refinado pronto para uso.`,
    };
  }

  private classifyIntent(prompt: string): { intent: PromptIntent; confidence: number } {
    if (prompt.length === 0) {
      return { intent: 'unknown', confidence: 0 };
    }
    for (const rule of PromptRefinerCapability.RULES) {
      const matches = prompt.match(rule.signals);
      if (matches) {
        // Confidence scales with how clearly the signal appears relative to length.
        const wordCount = prompt.split(/\s+/).filter(Boolean).length;
        const base = 0.6;
        const lengthBonus = wordCount >= 4 ? 0.25 : 0.1;
        return { intent: rule.intent, confidence: Math.min(0.95, base + lengthBonus) };
      }
    }
    return { intent: 'unknown', confidence: 0.2 };
  }

  private assessScope(prompt: string): PromptScope {
    const lower = prompt.toLowerCase();
    const wordCount = prompt.split(/\s+/).filter(Boolean).length;

    if (
      /\b(multi-?sess|v[aá]rias telas|sistema inteiro|reescrever tudo|arquitetura completa|epic)\b/.test(
        lower,
      )
    ) {
      return 'epic';
    }
    if (
      /\b(v[aá]rios m[oó]dulos|cross-?domain|m[uú]ltiplos arquivos|integra[cç][aã]o entre|5\+ arquivos|toda a)\b/.test(
        lower,
      )
    ) {
      return 'high';
    }
    if (/\b(componente|endpoint|m[oó]dulo|tela|fluxo)\b/.test(lower) || wordCount > 40) {
      return 'medium';
    }
    if (wordCount > 12) {
      return 'low';
    }
    return 'trivial';
  }

  private detectMissingContext(prompt: string, intent: PromptIntent): readonly string[] {
    const questions: string[] = [];
    const seen = new Set<string>();
    const push = (q: string): void => {
      if (!seen.has(q)) {
        seen.add(q);
        questions.push(q);
      }
    };

    const rule = PromptRefinerCapability.RULES.find((r) => r.intent === intent);
    if (rule) {
      for (const check of rule.contextChecks) {
        if (!check.test.test(prompt)) {
          push(check.question);
        }
      }
    }
    for (const check of PromptRefinerCapability.UNIVERSAL_CHECKS) {
      if (check.intents.has(intent) && !check.test.test(prompt)) {
        push(check.question);
      }
    }
    return questions;
  }

  private buildRefinedPrompt(
    prompt: string,
    intent: PromptIntent,
    scope: PromptScope,
    missingContext: readonly string[],
  ): string {
    const lines: string[] = [];
    lines.push(`Tarefa (${this.intentLabel(intent)} — escopo ${this.scopeLabel(scope)}):`);
    lines.push(prompt);
    lines.push('');

    if (missingContext.length > 0) {
      lines.push('Antes de executar, confirme:');
      missingContext.forEach((q, i) => lines.push(`${i + 1}. ${q}`));
      lines.push('');
    }

    lines.push('Diretrizes:');
    for (const guideline of this.guidelinesFor(intent)) {
      lines.push(`- ${guideline}`);
    }
    lines.push('- Critério de pronto: defina e verifique antes de concluir.');
    lines.push('- Não altere áreas fora do escopo descrito.');

    return lines.join('\n');
  }

  private guidelinesFor(intent: PromptIntent): readonly string[] {
    switch (intent) {
      case 'bug_fix':
        return [
          'Reproduza o problema antes de corrigir.',
          'Adicione um teste que falha e passe-o ao corrigir.',
        ];
      case 'new_feature':
        return [
          'Planeje a estrutura antes de codar.',
          'Cubra com testes e revise antes de finalizar.',
        ];
      case 'refactor':
        return ['Preserve o comportamento existente.', 'Garanta que os testes continuem passando.'];
      case 'testing':
        return ['Cubra casos felizes e de borda.', 'Mantenha os testes determinísticos.'];
      case 'review':
        return ['Aponte riscos de segurança e correção.', 'Sugira simplificações quando houver.'];
      case 'documentation':
        return ['Mantenha a documentação alinhada ao código atual.'];
      case 'infrastructure':
        return ['Valide mudanças arriscadas antes de aplicar em produção.'];
      case 'design':
        return ['Liste alternativas e trade-offs antes de decidir.'];
      case 'research':
        return ['Reúna fontes confiáveis antes de concluir.'];
      case 'unknown':
        return ['Esclareça o objetivo principal antes de prosseguir.'];
    }
  }

  private intentLabel(intent: PromptIntent): string {
    switch (intent) {
      case 'new_feature':
        return 'nova funcionalidade';
      case 'bug_fix':
        return 'correção de bug';
      case 'refactor':
        return 'refatoração';
      case 'research':
        return 'pesquisa';
      case 'testing':
        return 'testes';
      case 'review':
        return 'revisão';
      case 'documentation':
        return 'documentação';
      case 'infrastructure':
        return 'infraestrutura';
      case 'design':
        return 'design/arquitetura';
      case 'unknown':
        return 'indefinida';
    }
  }

  private scopeLabel(scope: PromptScope): string {
    switch (scope) {
      case 'trivial':
        return 'trivial';
      case 'low':
        return 'baixo';
      case 'medium':
        return 'médio';
      case 'high':
        return 'alto';
      case 'epic':
        return 'épico';
    }
  }
}
