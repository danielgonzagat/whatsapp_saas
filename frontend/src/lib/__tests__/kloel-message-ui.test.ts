import { describe, expect, it } from 'vitest';
import {
  appendAssistantTraceFromEvent,
  detectDeliverableAnswerFiles,
  getAssistantProcessingTrace,
  getAssistantResponseVersions,
  sanitizeAssistantVisibleContent,
  summarizeAssistantProcessingTrace,
  withDeliverableFiles,
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
    expect(sanitizeAssistantVisibleContent('Ele está no arquivo backend/src/kloel/x.ts.')).not.toContain(
      'backend/src',
    );
    expect(sanitizeAssistantVisibleContent('Respondo sem expor código interno ou nomes de ferramentas.')).toBe(
      'Respondo sem expor processo privado ou nomes internos de capacidades.',
    );
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
      sanitizeAssistantVisibleContent('Intermediate steps — alegação acima do observadoos intermediários.'),
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

  it('builds a durable processing trace and summary from stream events', () => {
    const withThinking = appendAssistantTraceFromEvent(undefined, {
      type: 'status',
      phase: 'thinking',
      label: 'Entendendo sua pergunta e reunindo o contexto da conversa.',
    });
    const withToolCall = appendAssistantTraceFromEvent(withThinking, {
      type: 'tool_call',
      tool: 'search_web',
      callId: 'call-1',
      spanId: 'span-1',
    });
    const withToolResult = appendAssistantTraceFromEvent(withToolCall, {
      type: 'tool_result',
      tool: 'search_web',
      callId: 'call-1',
      spanId: 'span-1',
      success: true,
      result: { answer: 'ok' },
      artifactId: 'artifact-1',
      durationMs: 42,
    });

    const entries = getAssistantProcessingTrace(withToolResult);

    expect(entries).toEqual([
      expect.objectContaining({
        phase: 'thinking',
        label: 'Entendendo sua pergunta e reunindo o contexto da conversa.',
      }),
      expect.objectContaining({
        phase: 'tool_calling',
        label: 'Consultei contexto operacional relevante antes de responder.',
        spanId: 'span-1',
      }),
      expect.objectContaining({
        phase: 'tool_result',
        label: 'Incorporei as observações encontradas antes de responder.',
        spanId: 'span-1',
        artifactId: 'artifact-1',
        durationMs: 42,
      }),
    ]);
    expect(summarizeAssistantProcessingTrace(entries)).toBe(
      'Entendendo sua pergunta e reunindo o contexto da conversa, consultei contexto operacional relevante antes de responder e incorporei as observações encontradas antes de responder.',
    );
  });

  it('ignores malformed metadata entries and still falls back safely', () => {
    expect(
      getAssistantResponseVersions(
        {
          responseVersions: [
            null,
            { id: 'broken' },
            { content: 'Versão válida', source: 'initial' },
          ],
        },
        'Resposta atual',
        'message-1',
      ),
    ).toEqual([
      expect.objectContaining({
        content: 'Versão válida',
        source: 'initial',
      }),
    ]);

    expect(
      getAssistantProcessingTrace({
        processingTrace: [
          { foo: 'bar' },
          { label: 'Executando search web.', phase: 'tool_calling' },
        ],
      }),
    ).toEqual([
      expect.objectContaining({
        label: 'Executando search web.',
        phase: 'tool_calling',
      }),
    ]);
  });

  it('deduplicates repeated processing events instead of bloating persisted trace history', () => {
    const first = appendAssistantTraceFromEvent(undefined, {
      type: 'status',
      phase: 'thinking',
      label: 'Entendendo sua pergunta e reunindo o contexto da conversa.',
    });
    const second = appendAssistantTraceFromEvent(first, {
      type: 'status',
      phase: 'thinking',
      label: 'Entendendo sua pergunta e reunindo o contexto da conversa.',
    });

    expect(getAssistantProcessingTrace(second)).toHaveLength(1);
  });

  it('keeps live tool call and tool result trace ids distinct for React rendering', () => {
    const withToolCall = appendAssistantTraceFromEvent(undefined, {
      type: 'tool_call',
      tool: 'search_web',
      callId: 'call-1',
    });
    const withToolResult = appendAssistantTraceFromEvent(withToolCall, {
      type: 'tool_result',
      tool: 'search_web',
      callId: 'call-1',
      success: true,
      result: { ok: true },
    });

    expect(getAssistantProcessingTrace(withToolResult).map((entry) => entry.id)).toEqual([
      'call-1:call',
      'call-1:result',
    ]);
  });

  it('renders internal code tool traces with product-grade labels', () => {
    const metadata = appendAssistantTraceFromEvent(undefined, {
      type: 'tool_call',
      tool: 'code_outline',
      callId: 'call-code',
    });

    expect(getAssistantProcessingTrace(metadata)[0]?.label).toBe(
      'Consultei contexto operacional relevante antes de responder.',
    );
  });

  it('renders backend validation tool traces without raw tool names', () => {
    const metadata = appendAssistantTraceFromEvent(undefined, {
      type: 'tool_call',
      tool: 'run_backend_tests',
      callId: 'call-tests',
    });
    const label = getAssistantProcessingTrace(metadata)[0]?.label;

    expect(label).toBe('Consultei contexto operacional relevante antes de responder.');
    expect(label).not.toContain('run backend tests');
    expect(label).not.toContain('run_backend_tests');
  });

  it('renders composer capability traces with product-grade labels', () => {
    const withSite = appendAssistantTraceFromEvent(undefined, {
      type: 'tool_call',
      tool: 'create_site',
      callId: 'call-site',
    });
    const withImage = appendAssistantTraceFromEvent(withSite, {
      type: 'tool_result',
      tool: 'create_image',
      callId: 'call-image',
      success: false,
      error: 'provider missing',
    });

    expect(getAssistantProcessingTrace(withImage).map((entry) => entry.label)).toEqual([
      'Consultei contexto operacional relevante antes de responder.',
      'Registrei uma limitação operacional antes de responder.',
    ]);
  });

  it('renders commerce and workspace tool traces with product-grade labels', () => {
    const withProducts = appendAssistantTraceFromEvent(undefined, {
      type: 'tool_call',
      tool: 'list_products',
      callId: 'call-products',
    });
    const withSettings = appendAssistantTraceFromEvent(withProducts, {
      type: 'tool_result',
      tool: 'get_settings',
      callId: 'call-settings',
      success: true,
      result: {},
    });
    const withBilling = appendAssistantTraceFromEvent(withSettings, {
      type: 'tool_result',
      tool: 'get_billing_status',
      callId: 'call-billing',
      success: true,
      result: {},
    });
    const withHealth = appendAssistantTraceFromEvent(withBilling, {
      type: 'tool_call',
      tool: 'self.health',
      callId: 'call-health',
    });

    expect(getAssistantProcessingTrace(withHealth).map((entry) => entry.label)).toEqual([
      'Consultei contexto operacional relevante antes de responder.',
      'Incorporei as observações encontradas antes de responder.',
      'Consultei contexto operacional relevante antes de responder.',
    ]);
  });

  it('sanitizes persisted status trace labels from legacy internal tool wording', () => {
    const trace = getAssistantProcessingTrace({
      processingTrace: [
        {
          id: 'trace-legacy-code',
          kind: 'status',
          phase: 'tool_calling',
          label: 'Executando code_outline, executando code outline e concluiu code outline.',
        },
      ],
    });

    expect(trace[0]?.label).toBe(
      'Executando checagem privada, executando checagem privada e concluiu checagem privada.',
    );
    expect(trace[0]?.label).not.toContain('code_outline');
    expect(trace[0]?.label).not.toContain('code outline');
  });

  it('sanitizes persisted status trace labels from legacy business tool wording', () => {
    const trace = getAssistantProcessingTrace({
      processingTrace: [
        {
          id: 'trace-legacy-products',
          kind: 'status',
          phase: 'tool_calling',
          label:
            'Ação enviada para list products. Observação recebida de get settings. Observação recebida de get billing status.',
        },
      ],
    });

    expect(trace[0]?.label).toBe(
      'Consultei contexto operacional relevante antes de responder. Incorporei as observações encontradas antes de responder. Incorporei as observações encontradas antes de responder.',
    );
    expect(trace[0]?.label).not.toContain('list products');
    expect(trace[0]?.label).not.toContain('get settings');
    expect(trace[0]?.label).not.toContain('get billing status');
  });

  it('sanitizes persisted sales trace tool names from legacy executable traces', () => {
    const trace = getAssistantProcessingTrace({
      processingTrace: [
        {
          id: 'trace-sales-call',
          kind: 'tool_call',
          phase: 'tool_calling',
          label: 'Ação enviada para get order details.',
          tool: 'get_order_details',
        },
        {
          id: 'trace-sales-result',
          kind: 'tool_result',
          phase: 'tool_result',
          label: 'Falha observada em get order details.',
          tool: 'get_order_details',
          success: false,
        },
      ],
    });

    expect(trace.map((entry) => entry.label)).toEqual([
      'Consultei contexto operacional relevante antes de responder.',
      'Registrei uma limitação operacional antes de responder.',
    ]);
    expect(trace.map((entry) => entry.label).join(' ')).not.toContain('get order details');
    expect(trace.map((entry) => entry.label).join(' ')).not.toContain('get_order_details');
  });

  it('sanitizes persisted processing summaries from legacy internal tool wording', () => {
    const summary = summarizeAssistantProcessingTrace(
      [],
      'Executando code_outline, executando code outline e concluiu code outline.',
    );

    expect(summary).toBe(
      'Executando checagem privada, executando checagem privada e concluiu checagem privada.',
    );
    expect(summary).not.toContain('code_outline');
    expect(summary).not.toContain('code outline');
  });

  it('ignores tool status events when typed tool events provide the executable trace', () => {
    const withToolStatus = appendAssistantTraceFromEvent(undefined, {
      type: 'status',
      phase: 'tool_calling',
      label: 'Executando search web.',
    });
    const withToolCall = appendAssistantTraceFromEvent(withToolStatus, {
      type: 'tool_call',
      tool: 'search_web',
      callId: 'call-1',
    });

    expect(getAssistantProcessingTrace(withToolCall)).toEqual([
      expect.objectContaining({
        kind: 'tool_call',
        label: 'Consultei contexto operacional relevante antes de responder.',
      }),
    ]);
  });

  it('labels refinement traces without exposing internal capability names', () => {
    const metadata = appendAssistantTraceFromEvent(undefined, {
      type: 'tool_call',
      tool: 'refine_response',
      callId: 'call-refine',
    });

    expect(getAssistantProcessingTrace(metadata)).toEqual([
      expect.objectContaining({
        kind: 'tool_call',
        label: 'Consultei contexto operacional relevante antes de responder.',
      }),
    ]);
  });

  it('merges live capability metadata from terminal stream events', () => {
    const metadata = appendAssistantTraceFromEvent(
      { clientRequestId: 'req-1' },
      {
        type: 'done',
        metadata: {
          capability: 'create_image',
          generatedImageUrl: 'https://cdn.example.test/generated.png',
        },
      },
    );

    expect(metadata).toEqual(
      expect.objectContaining({
        clientRequestId: 'req-1',
        capability: 'create_image',
        generatedImageUrl: 'https://cdn.example.test/generated.png',
      }),
    );
    expect(getAssistantProcessingTrace(metadata)).toEqual([]);
  });

  it('derives downloadable files from substantial fenced answer blocks', () => {
    const fence = '```';
    const body = [
      '# Plano de Conteudo',
      '',
      ...Array.from(
        { length: 12 },
        (_, index) => `Secao ${index + 1}: conteudo operacional suficiente para download real.`,
      ),
    ].join('\n');

    const files = detectDeliverableAnswerFiles(`Segue:\n\n${fence}markdown\n${body}\n${fence}`);
    const file = files.at(0);

    expect(files).toHaveLength(1);
    if (!file) {
      throw new Error('missing derived file');
    }
    const downloadUrl = file.downloadUrl ?? '';
    expect(file.name).toBe('plano-de-conteudo.md');
    expect(file.meta).toContain('Documento');
    expect(file.meta).toContain('MD');
    expect(downloadUrl).toMatch(/^data:text\/markdown;charset=utf-8;base64,/);
    expect(atob(downloadUrl.split(',')[1] ?? '')).toBe(body);
  });


  it('derives downloadable files from a trailing unclosed fenced answer block', () => {
    const fence = '```';
    const body = [
      '# Plano Truncado',
      '',
      ...Array.from(
        { length: 12 },
        (_, index) => `Parte ${index + 1}: conteudo preservado mesmo sem fence final.`,
      ),
    ].join('\n');

    const files = detectDeliverableAnswerFiles(`Segue:\n\n${fence}markdown\n${body}`);

    expect(files.map((file) => file.name)).toEqual(['plano-truncado.md']);
  });
  it('does not duplicate answer-derived files already present in reasoning metadata', () => {
    const fence = '```';
    const body = [
      '# Plano Existente',
      '',
      ...Array.from(
        { length: 12 },
        (_, index) => `Linha ${index + 1}: conteudo suficiente para manter o arquivo deduplicado.`,
      ),
    ].join('\n');
    const reasoning = {
      text: '',
      summary: '',
      durationMs: null,
      files: [{ name: 'plano-existente.md', meta: 'Documento' }],
    };

    expect(withDeliverableFiles(reasoning, `${fence}markdown\n${body}\n${fence}`)).toBe(reasoning);
  });
});
