import { describe, expect, it } from '@jest/globals';
import {
  createKloelDoneEvent,
  createKloelFileEvent,
  createKloelMemoryLoadedEvent,
  createKloelReasoningDeltaEvent,
  createKloelStatusEvent,
  createKloelToolCallEvent,
  createKloelToolResultEvent,
} from './kloel-stream-events';
import * as streamEvents from './kloel-stream-events';

describe('kloel-stream-events', () => {
  it('keeps public artifact metadata on terminal done events without internal capability names', () => {
    expect(
      createKloelDoneEvent({
        capability: 'create_image',
        capabilityError: 'create_image failed internally',
        generatedImageUrl: 'https://cdn.example.test/generated.png',
      }),
    ).toEqual({
      type: 'done',
      done: true,
      metadata: {
        generatedImageUrl: 'https://cdn.example.test/generated.png',
      },
    });
  });

  it('keeps ordinary done events minimal when no metadata is present', () => {
    expect(createKloelDoneEvent()).toEqual({
      type: 'done',
      done: true,
    });
    expect(createKloelDoneEvent({})).toEqual({
      type: 'done',
      done: true,
    });
  });

  it('emits rich public file artifact metadata', () => {
    expect(
      createKloelFileEvent({
        name: 'plano.md',
        artifactId: 'artifact-1',
        kind: 'markdown',
        content: '# Plano real',
        contentRef: 'artifact://artifact-1',
        meta: 'Documento · MD',
        url: 'https://cdn.example.test/plano.md',
        downloadUrl: 'https://cdn.example.test/plano.md?download=1',
        editable: true,
        persistent: true,
      }),
    ).toEqual({
      type: 'file',
      name: 'plano.md',
      artifactId: 'artifact-1',
      kind: 'markdown',
      content: '# Plano real',
      contentRef: 'artifact://artifact-1',
      meta: 'Documento · MD',
      url: 'https://cdn.example.test/plano.md',
      downloadUrl: 'https://cdn.example.test/plano.md?download=1',
      editable: true,
      persistent: true,
      done: false,
    });
  });

  it('streams provider reasoning only after public-safety redaction', () => {
    const buildThinkingLabel = (streamEvents as Record<string, unknown>)[
      'createKloelPublicThinkingLabel'
    ] as (message: string) => string;
    const buildStreamingLabel = (streamEvents as Record<string, unknown>)[
      'createKloelPublicStreamingLabel'
    ] as (message: string) => string;

    expect(buildThinkingLabel('Eu quero validar o raciocínio do chat.')).toBe('');
    expect(buildStreamingLabel('Eu quero validar o raciocínio do chat.')).toBe('');

    const safeReasoning = 'Comparei os dados públicos antes de responder.';
    const safeEvent = createKloelReasoningDeltaEvent(safeReasoning);

    expect(safeEvent).toEqual({ type: 'reasoning_delta', text: safeReasoning, done: false });

    const internalEvent = createKloelReasoningDeltaEvent(
      'Vou usar skill=artifact e runtime context via inspect_self antes de responder.',
    );

    expect(internalEvent).toEqual({
      type: 'reasoning_delta',
      text: 'Detalhes internos desta execução foram omitidos com segurança.',
      done: false,
    });
  });

  it('omits empty public status messages instead of streaming facade text', () => {
    expect(createKloelStatusEvent('thinking', '')).toEqual({
      type: 'status',
      phase: 'thinking',
      streaming: false,
      done: false,
    });
    expect(createKloelStatusEvent('thinking', '  Buscando contexto real.  ')).toEqual({
      type: 'status',
      phase: 'thinking',
      streaming: false,
      message: 'Buscando contexto real.',
      done: false,
    });
  });

  it('emits memory-loaded events as public counts without memory contents', () => {
    expect(createKloelMemoryLoadedEvent({ signalCount: 2 })).toEqual({
      type: 'memory_loaded',
      signalCount: 2,
      message: '2 memórias relevantes encontradas.',
      done: false,
    });
    expect(createKloelMemoryLoadedEvent({ signalCount: 0 })).toEqual({
      type: 'memory_loaded',
      signalCount: 0,
      message: 'Nada relevante encontrado na memória.',
      done: false,
    });
    expect(JSON.stringify(createKloelMemoryLoadedEvent({ signalCount: 2 }))).not.toContain(
      'preferencia_formato',
    );
  });

  it('emits tool calls and observations as correlated public spans without raw tool payloads', () => {
    const callEvent = createKloelToolCallEvent('call-1', 'search_web', {
      query: 'lead@example.test kloel secret',
    });

    expect(callEvent).toEqual({
      type: 'tool_call',
      callId: 'call-1',
      spanId: 'call-1',
      tool: 'search_web',
      risk: {
        level: 'low',
        label: 'consulta segura',
        score: 2,
        factors: ['leitura sem alteração', 'alcance externo'],
      },
      done: false,
    });
    expect(JSON.stringify(callEvent)).not.toContain('lead@example.test');
    expect(JSON.stringify(callEvent)).toContain('search_web');

    const resultEvent = createKloelToolResultEvent({
      callId: 'call-1',
      tool: 'search_web',
      success: true,
      result: { answer: 'ok', rawHtml: '<secret>token</secret>' },
      durationMs: 42,
    });

    expect(resultEvent).toEqual({
      type: 'tool_result',
      callId: 'call-1',
      spanId: 'call-1',
      tool: 'search_web',
      success: true,
      durationMs: 42,
      risk: {
        level: 'low',
        label: 'consulta segura',
        score: 2,
        factors: ['leitura sem alteração', 'alcance externo'],
      },
      done: false,
    });
    expect(JSON.stringify(resultEvent)).not.toContain('rawHtml');
    expect(JSON.stringify(resultEvent)).not.toContain('secret');
    expect(JSON.stringify(resultEvent)).toContain('search_web');
  });

  it('classifies outbound payment-like tools as controlled sensitive actions', () => {
    const event = createKloelToolCallEvent('call-2', 'send_email', {
      email: 'lead@example.test',
      message: 'Olá',
      amountCents: 120000,
    });

    expect(event.risk).toEqual({
      level: 'high',
      label: 'ação sensível controlada',
      score: 10,
      factors: [
        'pode alterar estado',
        'alcance externo',
        'reversão exige cuidado',
        'argumentos sensíveis redigidos',
      ],
    });
    expect(JSON.stringify(event.risk)).not.toContain('send_email');
    expect(JSON.stringify(event.risk)).not.toContain('lead@example.test');
  });

  it('removes assistant-visible DSML tool markup before persistence', () => {
    const sanitize = (streamEvents as Record<string, unknown>)[
      'sanitizeKloelAssistantVisibleText'
    ] as (value: string) => string;

    expect(
      sanitize(
        'Eu observei a operação.\n<｜｜DSML｜｜tool_calls> <｜｜DSML｜｜invoke name="get_workspace_status"> </｜｜DSML｜｜invoke> </｜｜DSML｜｜tool_calls>\nResposta final limpa.',
      ),
    ).toBe('Eu observei a operação.\nResposta final limpa.');
  });

  it('removes assistant-visible artifact protocol blocks before persistence', () => {
    const sanitize = (streamEvents as Record<string, unknown>)[
      'sanitizeKloelAssistantVisibleText'
    ] as (value: string) => string;

    expect(
      sanitize(
        [
          'Arquivo preparado.',
          '__artifact',
          JSON.stringify({
            type: 'artifact',
            artifact: {
              name: 'tabela.md',
              content: '| Produto | Preco |',
              'content-type': 'text/markdown',
            },
          }),
          'Resposta final limpa.',
        ].join('\n'),
      ),
    ).toBe('Arquivo preparado.\nResposta final limpa.');
  });

  it('redacts implementation details from assistant-visible product answers', () => {
    const sanitize = (streamEvents as Record<string, unknown>)[
      'sanitizeKloelAssistantVisibleText'
    ] as (value: string) => string;

    const sanitized = sanitize(
      'Observação: Consegui acessar meu código fonte real. Ele está em TypeScript, no arquivo backend/src/kloel/guest-chat.action-intent.helpers.ts. O módulo contém 11 símbolos (funções, classes, tipos). Meu status de "no overclaim" é PASS. ABI 1.1.0.',
    );

    expect(sanitized).toContain('arquitetura interna');
    expect(sanitized).not.toContain('backend/src');
    expect(sanitized).not.toContain('TypeScript');
    expect(sanitized).not.toContain('símbolos');
    expect(sanitized).not.toContain('no overclaim');
    expect(sanitized).not.toContain('PASS');
    expect(sanitized).not.toContain('ABI');
    expect(sanitize('Intermediate steps — alegação acima do observadoos intermediários.')).toBe(
      'Intermediate steps — passos intermediários.',
    );
    expect(sanitize('mostrando tool ids públicos no trace.')).toBe(
      'mostrando tool ids públicos no trace.',
    );
    expect(sanitize('registro operacional completo dos passos e ferramentas acionados.')).toBe(
      'registro operacional completo dos passos e ferramentas acionados.',
    );
    expect(
      sanitize('Tool/function calling — capacidade de invocar ferramentas ou funções externas.'),
    ).toBe('Tool/function calling — capacidade de invocar ferramentas ou funções externas.');
    expect(sanitize('Intermediate steps — pass-os intermediários.')).toBe(
      'Intermediate steps — pass-os intermediários.',
    );
    expect(sanitize('Resumo de conversas passadas.')).toBe('Resumo de conversas passadas.');
    expect(sanitize('Resultado interno: PASS.')).toBe(
      'Resultado interno: alegação acima do observado.',
    );
  });

  it('preserves ordinary attachment wording while redacting implementation file references', () => {
    const sanitize = (streamEvents as Record<string, unknown>)[
      'sanitizeKloelAssistantVisibleText'
    ] as (value: string) => string;

    expect(sanitize('Recebido. O arquivo anexado foi confirmado.')).toBe(
      'Recebido. O arquivo anexado foi confirmado.',
    );
    expect(sanitize('Ele está no arquivo backend/src/kloel/x.ts.')).not.toContain('backend/src');
  });

  it('keeps split attachment acknowledgements readable in streamed chunks', () => {
    const createFilter = (streamEvents as Record<string, unknown>)[
      'createKloelAssistantVisibleTextStreamFilter'
    ] as () => { push: (chunk: string) => string; flush: () => string };
    const filter = createFilter();

    const visible = [
      filter.push('Recebido. O arquivo an'),
      filter.push('exado foi confirmado.'),
      filter.flush(),
    ].join('');

    expect(visible).toBe('Recebido. O arquivo anexado foi confirmado.');
    expect(visible).not.toContain('camada internaexado');
  });

  it('does not redact ordinary words split near the PASS certification token boundary', () => {
    const createFilter = (streamEvents as Record<string, unknown>)[
      'createKloelAssistantVisibleTextStreamFilter'
    ] as () => { push: (chunk: string) => string; flush: () => string };
    const filter = createFilter();
    const rawWindowEndingInPartialWord = 'Lembra preferências e contexto de conversas pass';
    const tailAfterPartialWord = `adas. ${'continua '.repeat(24)}`.padEnd(192, 'x');

    const visible = [
      filter.push(rawWindowEndingInPartialWord + tailAfterPartialWord),
      filter.flush(),
    ].join('');

    expect(visible).toContain('conversas passadas.');
    expect(visible).not.toContain('alegação acima do observadoadas');
  });

  it('translates runtime certification wording into product-facing language', () => {
    const sanitize = (streamEvents as Record<string, unknown>)[
      'sanitizeKloelAssistantVisibleText'
    ] as (value: string) => string;

    const sanitized = sanitize(
      'A certificação interna retornou veredito SIM com risco zero de overclaim. Runtime: agente Kloel, versão 1.1.0. Inspeção do arquitetura interna — módulo principal acessado.',
    );

    expect(sanitized).toContain('verificação de consistência');
    expect(sanitized).toContain('núcleo operacional');
    expect(sanitized).not.toContain('certificação interna');
    expect(sanitized).not.toContain('overclaim');
    expect(sanitized).not.toContain('versão 1.1.0');
    expect(sanitized).not.toContain('módulo principal');
  });

  it('buffers split DSML tool markup so SSE content never receives internal tool calls', () => {
    const createFilter = (streamEvents as Record<string, unknown>)[
      'createKloelAssistantVisibleTextStreamFilter'
    ] as () => { push: (chunk: string) => string; flush: () => string };
    const filter = createFilter();

    const visible = [
      filter.push('Resposta em linguagem de produto. <｜｜DS'),
      filter.push('ML｜｜tool_calls> <｜｜DSML｜｜invoke name="get_workspace_status">'),
      filter.push(' </｜｜DSML｜｜invoke> </｜｜DSML｜｜tool_calls> Continua limpa.'),
      filter.flush(),
    ].join('');

    expect(visible).toBe('Resposta em linguagem de produto. Continua limpa.');
  });

  it('buffers split artifact protocol blocks so SSE content never receives internal artifacts', () => {
    const createFilter = (streamEvents as Record<string, unknown>)[
      'createKloelAssistantVisibleTextStreamFilter'
    ] as () => { push: (chunk: string) => string; flush: () => string };
    const filter = createFilter();

    const visible = [
      filter.push('Resposta em linguagem de produto. __arti'),
      filter.push('fact\n'),
      filter.push(
        JSON.stringify({
          type: 'artifact',
          artifact: {
            name: 'contador.html',
            content: '<!doctype html><html><body>ok</body></html>',
            'content-type': 'text/html',
          },
        }),
      ),
      filter.push('\nContinua limpa.'),
      filter.flush(),
    ].join('');

    expect(visible).toBe('Resposta em linguagem de produto. Continua limpa.');
  });
});
