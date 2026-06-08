import { describe, expect, it } from 'vitest';
import {
  getAssistantResponseVersions,
  sanitizeAssistantMarkdown,
  sanitizeAssistantVisibleContent,
} from '../kloel-message-ui';

describe('kloel-message-ui', () => {
  it('normalizes persisted response versions and preserves regenerated history', () => {
    const versions = getAssistantResponseVersions(
      {
        responseVersions: [
          {
            id: 'resp-1',
            content: 'Primeira resposta',
            createdAt: '2026-04-13T10:00:00.000Z',
            source: 'initial',
          },
          {
            id: 'resp-2',
            content: 'Segunda resposta',
            createdAt: '2026-04-13T10:01:00.000Z',
            source: 'regenerated',
          },
        ],
      },
      'Resposta atual',
      'message-1',
    );

    expect(versions).toEqual([
      expect.objectContaining({
        id: 'resp-1',
        content: 'Primeira resposta',
        source: 'initial',
      }),
      expect.objectContaining({
        id: 'resp-2',
        content: 'Segunda resposta',
        source: 'regenerated',
      }),
    ]);
  });

  it('creates a fallback version when legacy messages have no stored history', () => {
    const versions = getAssistantResponseVersions(undefined, 'Resposta legada', 'message-legacy');

    expect(versions).toEqual([
      {
        id: 'message-legacy',
        content: 'Resposta legada',
        source: 'initial',
      },
    ]);
  });

  it('preserves ordinary attachment wording while still hiding implementation file references', () => {
    expect(sanitizeAssistantVisibleContent('Recebido. O arquivo anexado foi confirmado.')).toBe(
      'Recebido. O arquivo anexado foi confirmado.',
    );
    expect(sanitizeAssistantVisibleContent('Recebido. O camada internaexado foi confirmado.')).toBe(
      'Recebido. O arquivo anexado foi confirmado.',
    );
    expect(sanitizeAssistantVisibleContent('camada interna teste recebido e confirmado.')).toBe(
      'Arquivo de teste recebido e confirmado.',
    );
    expect(
      sanitizeAssistantVisibleContent('Ele está no arquivo backend/src/kloel/x.ts.'),
    ).not.toContain('backend/src');
    expect(
      sanitizeAssistantVisibleContent('Respondo sem expor código interno ou nomes de ferramentas.'),
    ).toBe('Respondo sem expor processo privado ou nomes internos de capacidades.');
    expect(
      sanitizeAssistantVisibleContent(
        'Agent trace: registro operacional completo dos passos e ferramentas acionados.',
      ),
    ).toBe('Agent trace: registro operacional completo dos passos e ações executadas.');
    expect(
      sanitizeAssistantVisibleContent(
        'Reasoning summary: sem exibir ferramentas utilizadas ou hipóteses internas.',
      ),
    ).toBe('Reasoning summary: sem exibir ações executadas ou hipóteses internas.');
    expect(
      sanitizeAssistantVisibleContent(
        'Tool/function calling — capacidade de invocar ferramentas ou funções externas.',
      ),
    ).toBe('Tool/function calling — capacidade de invocar ferramentas ou funções externas.');
    expect(
      sanitizeAssistantVisibleContent(
        'Intermediate steps — alegação acima do observadoos intermediários.',
      ),
    ).toBe('Intermediate steps — passos intermediários.');
    expect(sanitizeAssistantVisibleContent('Intermediate steps — pass-os intermediários.')).toBe(
      'Intermediate steps — pass-os intermediários.',
    );

    const publicCopy = sanitizeAssistantVisibleContent(
      'Não exponha camada operacional, acesso à camada operacional, chamada a sistema ou estado oculto da ferramenta.',
    );
    expect(publicCopy).toContain('processo privado');
    expect(publicCopy).toContain('acesso ao processo privado');
    expect(publicCopy).toContain('detalhe privado');
    expect(publicCopy).toContain('estado privado');
    expect(publicCopy).not.toContain('à processo privado');
    expect(publicCopy).not.toContain('camada operacional');
    expect(publicCopy).not.toContain('chamada a sistema');
    expect(publicCopy).not.toContain('estado oculto da ferramenta');
  });

  it('sanitizes persisted assistant versions before rendering historical chat content', () => {
    const versions = getAssistantResponseVersions(
      {
        responseVersions: [
          {
            id: 'resp-leaky',
            content:
              'Executando code_outline. <｜｜DSML｜｜tool_calls><｜｜DSML｜｜invoke name="get_workspace_status"></｜｜DSML｜｜invoke></｜｜DSML｜｜tool_calls> Código backend/src/kloel/guest-chat.action-intent.helpers.ts em TypeScript: 11 símbolos. Meu status de "no overclaim" é PASS. ABI 1.1.0.',
            source: 'initial',
          },
        ],
      },
      'fallback',
      'message-legacy',
    );

    expect(versions[0]?.content).toContain('processo privado');
    expect(versions[0]?.content).not.toContain('camada operacional');
    expect(versions[0]?.content).not.toContain('arquitetura interna');
    expect(versions[0]?.content).not.toContain('code_outline');
    expect(versions[0]?.content).not.toContain('DSML');
    expect(versions[0]?.content).not.toContain('backend/src');
    expect(versions[0]?.content).not.toContain('TypeScript');
    expect(versions[0]?.content).not.toContain('símbolos');
    expect(versions[0]?.content).not.toContain('overclaim');
    expect(versions[0]?.content).not.toContain('PASS');
    expect(versions[0]?.content).not.toContain('ABI');
  });

  it('sanitizes persisted assistant versions with internal capability names and runtime terms', () => {
    const versions = getAssistantResponseVersions(
      {
        responseVersions: [
          {
            id: 'resp-runtime-leaky',
            content:
              'As capacidades list_products e get_product_plans existem no código. workingMemory: [] e attention.candidates estão vazios. Runtime backend versão ABI 1.1.0 com certificationVerdict PASS.',
            source: 'initial',
          },
        ],
      },
      'fallback',
      'message-runtime-legacy',
    );

    const content = versions[0]?.content || '';
    expect(content).toContain('catálogo de produtos');
    expect(content).toContain('consultar planos do produto');
    expect(content).toContain('memória de trabalho');
    expect(content).toContain('foco de atenção');
    expect(content).toContain('arquitetura cognitiva');
    expect(content).not.toContain('list_products');
    expect(content).not.toContain('get_product_plans');
    expect(content).not.toContain('workingMemory');
    expect(content).not.toContain('attention.candidates');
    expect(content).not.toContain('Runtime');
    expect(content).not.toContain('backend');
    expect(content).not.toContain('código');
    expect(content).not.toContain('ABI');
    expect(content).not.toContain('certificationVerdict');
    expect(content).not.toContain('PASS');
    expect(content).not.toContain('alegação acima do observado');
  });

  it('sanitizes historical create-site setup wording from persisted assistant output', () => {
    const versions = getAssistantResponseVersions(
      {
        responseVersions: [
          {
            id: 'resp-create-site-setup-leaky',
            content:
              'A criação de site está conectada, mas o provedor de geração de sites ainda não está configurado neste ambiente. Configure a chave do provedor e tente novamente.',
            source: 'initial',
          },
        ],
      },
      'fallback',
      'message-create-site-setup-legacy',
    );

    const content = versions[0]?.content || '';
    expect(content).toBe(
      'A criação de site está conectada, mas a configuração de geração de sites ainda não foi concluída neste ambiente. Finalize a configuração e tente novamente.',
    );
    expect(content).not.toContain('provedor');
    expect(content).not.toContain('chave');
  });

  it('sanitizes raw capability labels from persisted assistant output', () => {
    const versions = getAssistantResponseVersions(
      {
        responseVersions: [
          {
            id: 'resp-capability-label-leaky',
            content:
              'Saúde do Kloel: consultada. Prova material: Capacidade: self.health. Capacidade: sales.create_pix.',
            source: 'initial',
          },
        ],
      },
      'fallback',
      'message-capability-label-legacy',
    );

    const content = versions[0]?.content || '';
    expect(content).toContain('Saúde do Kloel');
    expect(content).toContain('Ação operacional');
    expect(content).not.toContain('Capacidade:');
    expect(content).not.toContain('self.health');
    expect(content).not.toContain('sales.create_pix');
  });

  it('sanitizes historical mechanical operator success and auth failures', () => {
    const versions = getAssistantResponseVersions(
      {
        responseVersions: [
          {
            id: 'resp-operator-mechanical-leaky',
            content:
              'Acao "catálogo de produtos" executada com sucesso. Falha ao executar "catálogo de produtos": Missing Authorization header. Tente novamente. Erro: Venda nao encontrada.',
            source: 'initial',
          },
        ],
      },
      'fallback',
      'message-operator-mechanical-legacy',
    );

    const content = versions[0]?.content || '';
    expect(content).toContain('Consultei seu catálogo real');
    expect(content).toContain('sessão expirou');
    expect(content).toContain('Não encontrei uma venda correspondente para essa consulta.');
    expect(content).not.toContain('Acao');
    expect(content).not.toContain('Falha ao executar');
    expect(content).not.toContain('Erro: Venda nao encontrada');
    expect(content).not.toContain('Missing Authorization header');
  });

  it('sanitizes historical assistant product copy with internal status labels and debug metrics', () => {
    const versions = getAssistantResponseVersions(
      {
        responseVersions: [
          {
            id: 'resp-product-copy-leaky',
            content:
              'Workspace active e healthy no dashboard:chat. A skill checkout-recovery existe no contexto com outcome: selected, mas success: 0, failure: 0, patch: 0, view: 0. A skill `checkout-recovery` existe no contexto com , mas , , , `. Estado pending, developing, stable, proven e observed. ✅ ❌ ⚠️ arquivo infraestrutura/arquitetura interna com funções, classes, tipos e símbolos reais. Ele está em TypeScript, no arquivo backend/src/x.ts. O módulo contém componentes reais. do minha arquitetura interna. ao minha própria arquitetura interna. não é uma simulação, é o camada interna na infraestrutura. arquitetura cognitiva cognitiva.',
            source: 'initial',
          },
        ],
      },
      'fallback',
      'message-product-copy-legacy',
    );

    const content = versions[0]?.content || '';
    expect(content).toContain('ambiente operacional ativo e saudável');
    expect(content).toContain('chat do Kloel');
    expect(content).toContain('habilidade de recuperação de checkout');
    expect(content).toContain('pendente');
    expect(content).toContain('em desenvolvimento');
    expect(content).toContain('estável');
    expect(content).toContain('comprovado');
    expect(content).toContain('observado');
    expect(content).toContain('camada interna');
    expect(content).toContain('componentes reais');
    expect(content).not.toContain('Workspace');
    expect(content).not.toContain('dashboard:chat');
    expect(content).not.toContain('skill checkout-recovery');
    expect(content).not.toContain('skill recuperação de checkout');
    expect(content).not.toContain('métrica interna');
    expect(content).not.toContain('outcome:');
    expect(content).not.toContain('success:');
    expect(content).not.toContain('failure:');
    expect(content).not.toContain('patch:');
    expect(content).not.toContain('view:');
    expect(content).not.toContain('✅');
    expect(content).not.toContain('❌');
    expect(content).not.toContain('⚠️');
    expect(content).not.toContain('infraestrutura/arquitetura interna');
    expect(content).not.toContain('tecnologia interna');
    expect(content).not.toContain('arquivo camada interna');
    expect(content).not.toContain('backend/src');
    expect(content).not.toContain('TypeScript');
    expect(content).not.toContain('do minha arquitetura interna');
    expect(content).not.toContain('ao minha própria arquitetura interna');
    expect(content).not.toContain('é o camada interna na infraestrutura');
    expect(content).not.toContain('funções, classes, tipos');
    expect(content).not.toContain('arquitetura cognitiva cognitiva');
  });

  it('preserves fenced and inline code verbatim while still rewriting surrounding prose', () => {
    const fence = '```';
    const codeBody = [
      'export const path = "frontend/src/components/Foo.tsx";',
      '// language: TypeScript — runs at runtime, not in the backend',
      'const score = 1;',
    ].join('\n');
    const input = [
      'Este código está em backend/src/x.ts e usa runtime do frontend.',
      '',
      `${fence}tsx`,
      codeBody,
      fence,
      '',
      'O caminho inline `frontend/src/lib/kloel-message-ui.ts` e a linguagem `TypeScript` ficam intactos.',
    ].join('\n');

    const output = sanitizeAssistantMarkdown(input);

    // Fenced code block survives byte-for-byte.
    expect(output).toContain(`${fence}tsx\n${codeBody}\n${fence}`);
    expect(output).toContain('frontend/src/components/Foo.tsx');
    expect(output).toContain('// language: TypeScript — runs at runtime, not in the backend');
    expect(output).toContain('const score = 1;');

    // Inline code survives verbatim.
    expect(output).toContain('`frontend/src/lib/kloel-message-ui.ts`');
    expect(output).toContain('`TypeScript`');

    // Prose outside code is still rewritten (paths/langs/tokens hidden).
    const fenceStart = output.indexOf(`${fence}tsx`);
    const leadingProse = output.slice(0, fenceStart);
    expect(leadingProse).not.toContain('backend/src/x.ts');
    expect(leadingProse).not.toContain('runtime');
    expect(leadingProse).not.toContain('frontend');
    // Prose was actually rewritten (not left as-is): the original prose tokens
    // are gone and replaced with product-facing wording.
    expect(leadingProse).not.toBe(
      'Este código está em backend/src/x.ts e usa runtime do frontend.',
    );
    expect(leadingProse).toContain('processo privado');
  });

  it('leaves a code-free string identical to the plain prose sanitizer', () => {
    const prose = 'Ele está no arquivo backend/src/kloel/x.ts em TypeScript.';

    expect(sanitizeAssistantMarkdown(prose)).toBe(sanitizeAssistantVisibleContent(prose));
  });
});
