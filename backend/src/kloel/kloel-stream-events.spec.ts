import { describe, expect, it } from '@jest/globals';
import {
  createKloelDoneEvent,
  createKloelToolCallEvent,
  createKloelToolResultEvent,
} from './kloel-stream-events';
import * as streamEvents from './kloel-stream-events';

describe('kloel-stream-events', () => {
  it('carries capability metadata on terminal done events', () => {
    const metadata = {
      capability: 'create_image',
      generatedImageUrl: 'https://cdn.example.test/generated.png',
    };

    expect(createKloelDoneEvent(metadata)).toEqual({
      type: 'done',
      done: true,
      metadata,
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

  it('builds public thinking labels from the user request instead of a fixed placeholder', () => {
    const buildThinkingLabel = (streamEvents as Record<string, unknown>)[
      'createKloelPublicThinkingLabel'
    ] as (message: string) => string;
    const buildStreamingLabel = (streamEvents as Record<string, unknown>)[
      'createKloelPublicStreamingLabel'
    ] as (message: string) => string;

    const thinkingLabel = buildThinkingLabel(
      'Eu quero validar o raciocínio do chat sem Step, Span ou texto chumbado.',
    );
    const streamingLabel = buildStreamingLabel(
      'Eu quero validar o raciocínio do chat sem Step, Span ou texto chumbado.',
    );

    expect(thinkingLabel).toContain('validar o raciocínio do chat');
    expect(thinkingLabel).not.toContain('Kloel está pensando');
    expect(thinkingLabel).not.toContain('Step');
    expect(thinkingLabel).not.toContain('Span');
    expect(streamingLabel).toContain('raciocínio do chat');
    expect(streamingLabel).not.toContain('Kloel está pensando');
  });

  it('emits tool calls and observations as correlated spans', () => {
    expect(createKloelToolCallEvent('call-1', 'search_web', { query: 'kloel' })).toEqual({
      type: 'tool_call',
      callId: 'call-1',
      spanId: 'call-1',
      tool: 'search_web',
      args: { query: 'kloel' },
      done: false,
    });

    expect(
      createKloelToolResultEvent({
        callId: 'call-1',
        tool: 'search_web',
        success: true,
        result: { answer: 'ok' },
        durationMs: 42,
      }),
    ).toEqual({
      type: 'tool_result',
      callId: 'call-1',
      spanId: 'call-1',
      tool: 'search_web',
      success: true,
      result: { answer: 'ok' },
      durationMs: 42,
      done: false,
    });
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
    expect(sanitize('sem exibir ferramentas utilizadas ou nomes de ferramentas.')).toBe(
      'sem exibir ações executadas ou nomes internos de capacidades.',
    );
    expect(sanitize('registro operacional completo dos passos e ferramentas acionados.')).toBe(
      'registro operacional completo dos passos e ações executadas.',
    );
    expect(
      sanitize('Tool/function calling — capacidade de invocar ferramentas ou funções externas.'),
    ).toBe('Tool/function calling — capacidade de invocar ferramentas ou funções externas.');
    expect(sanitize('Intermediate steps — pass-os intermediários.')).toBe(
      'Intermediate steps — pass-os intermediários.',
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
});
