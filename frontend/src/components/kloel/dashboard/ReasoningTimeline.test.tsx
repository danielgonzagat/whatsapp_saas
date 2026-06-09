import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { AssistantProcessingTraceEntry, AssistantReasoning } from '@/lib/kloel-message-ui';
import { ReasoningTimeline } from './ReasoningTimeline';

function makeReasoning(overrides: Partial<AssistantReasoning> = {}): AssistantReasoning {
  return {
    text: '',
    summary: '',
    durationMs: null,
    files: [],
    ...overrides,
  };
}

describe('ReasoningTimeline', () => {
  it('renders public processing detail inside the thinking step while processing', () => {
    render(
      <ReasoningTimeline
        reasoning={makeReasoning({ text: 'Delta público do provedor.' })}
        steps={[]}
        fallbackSummary=""
        isProcessing
        isComplete={false}
      />,
    );

    expect(screen.getByText('Delta público do provedor.')).toBeTruthy();
  });

  it('keeps public processing detail visible after completion', () => {
    render(
      <ReasoningTimeline
        reasoning={makeReasoning({
          text: 'Comparei os planos disponíveis e escolhi a melhor recomendação.',
          durationMs: 2400,
        })}
        steps={[]}
        fallbackSummary=""
        isProcessing={false}
        isComplete
      />,
    );

    expect(
      screen.getByText('Comparei os planos disponíveis e escolhi a melhor recomendação.'),
    ).toBeTruthy();
  });

  it('redacts private prompt/runtime markers from provider reasoning', () => {
    render(
      <ReasoningTimeline
        reasoning={makeReasoning({
          text: 'runtime context incluiu system prompt e skill=artifact.',
          durationMs: 2400,
        })}
        steps={[]}
        fallbackSummary=""
        isProcessing={false}
        isComplete
      />,
    );

    expect(
      screen.getByText('Detalhes internos desta execução foram omitidos com segurança.'),
    ).toBeTruthy();
    expect(screen.queryByText(/runtime context/)).toBeNull();
    expect(screen.queryByText(/system prompt/)).toBeNull();
    expect(screen.queryByText(/skill=artifact/)).toBeNull();
  });

  it('keeps public raw reasoning and tool names visible', () => {
    render(
      <ReasoningTimeline
        reasoning={makeReasoning({
          text: 'chain-of-thought bruto: usei tool_call search_web e inspect_self antes de responder.',
          durationMs: 2400,
        })}
        steps={[]}
        fallbackSummary=""
        isProcessing={false}
        isComplete
      />,
    );

    expect(
      screen.getByText(
        'chain-of-thought bruto: usei tool_call search_web e inspect_self antes de responder.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('Detalhes internos desta execução foram omitidos com segurança.')).toBeNull();
  });

  it('renders nothing when there is no reasoning text, no tools and no processing (honest empty state)', () => {
    const { container } = render(
      <ReasoningTimeline
        reasoning={makeReasoning()}
        steps={[]}
        fallbackSummary=""
        isProcessing={false}
        isComplete={false}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders nothing while processing until reasoning or operational trace exists', () => {
    const { container } = render(
      <ReasoningTimeline
        reasoning={makeReasoning()}
        steps={[]}
        fallbackSummary=""
        isProcessing
        isComplete={false}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('labels operational traces as execution when the provider did not emit reasoning', () => {
    const steps: AssistantProcessingTraceEntry[] = [
      {
        id: 'call-1:call',
        kind: 'tool_call',
        phase: 'tool_calling',
        label: 'Consultei contexto operacional relevante antes de responder.',
        tool: 'search_web',
      },
    ];

    render(
      <ReasoningTimeline
        reasoning={makeReasoning()}
        steps={steps}
        fallbackSummary=""
        isProcessing={false}
        isComplete
      />,
    );

    expect(screen.getByText('Execução')).toBeTruthy();
    expect(screen.queryByText('Raciocínio')).toBeNull();
  });

  it('renders tool steps with the public tool name and measured duration', () => {
    const steps: AssistantProcessingTraceEntry[] = [
      {
        id: 'call-1:call',
        kind: 'tool_call',
        phase: 'tool_calling',
        label: 'Consultei contexto operacional relevante antes de responder.',
        tool: 'list_products',
      },
      {
        id: 'call-1:result',
        kind: 'tool_result',
        phase: 'tool_result',
        label: 'Incorporei as observações encontradas antes de responder.',
        tool: 'list_products',
        durationMs: 1200,
        success: true,
      },
    ];

    render(
      <ReasoningTimeline
        reasoning={makeReasoning({ text: 'Delta público final.' })}
        steps={steps}
        fallbackSummary=""
        isProcessing={false}
        isComplete
      />,
    );

    expect(screen.getAllByText('list_products').length).toBeGreaterThan(0);
    expect(screen.queryByText('catálogo de produtos')).toBeNull();
    expect(screen.getByText('1.2s')).toBeTruthy();
    expect(screen.getByText('Concluído')).toBeTruthy();
  });

  it('renders public tool risk chips with executable tool names', () => {
    const steps: AssistantProcessingTraceEntry[] = [
      {
        id: 'call-1:call',
        kind: 'tool_call',
        phase: 'tool_calling',
        label: 'Consultei contexto operacional relevante antes de responder.',
        tool: 'send_email',
        riskLabel: 'ação sensível controlada',
        riskLevel: 'high',
      },
    ];

    render(
      <ReasoningTimeline
        reasoning={makeReasoning({ text: 'Validando a ação antes de responder.' })}
        steps={steps}
        fallbackSummary=""
        isProcessing={false}
        isComplete
      />,
    );

    expect(screen.getByText('ação sensível controlada')).toBeTruthy();
    expect(screen.getByText('send_email')).toBeTruthy();
    expect(screen.queryByText('envio de mensagem')).toBeNull();
  });

  it('renders real memory/context status steps without labeling them as tools', () => {
    const steps: AssistantProcessingTraceEntry[] = [
      {
        id: 'trace-memory',
        kind: 'status',
        phase: 'thinking',
        label: '2 memórias relevantes encontradas.',
      },
      {
        id: 'trace-context',
        kind: 'system',
        phase: 'thinking',
        label: 'Contexto operacional do turno preparado.',
      },
    ];

    render(
      <ReasoningTimeline
        reasoning={makeReasoning()}
        steps={steps}
        fallbackSummary=""
        isProcessing={false}
        isComplete
      />,
    );

    expect(screen.getByText('2 memórias relevantes encontradas.')).toBeTruthy();
    expect(screen.getByText('Contexto operacional do turno preparado.')).toBeTruthy();
    expect(screen.queryByText('Ação')).toBeNull();
  });

  it('renders download and Drive save actions for real public file cards', () => {
    render(
      <ReasoningTimeline
        reasoning={makeReasoning({
          files: [
            {
              name: 'relatorio.pdf',
              meta: 'PDF validado',
              url: 'https://cdn.example.com/relatorio.pdf',
            },
          ],
        })}
        steps={[]}
        fallbackSummary=""
        isProcessing={false}
        isComplete
      />,
    );

    expect(screen.getByRole('link', { name: 'Baixar relatorio.pdf' })).toBeTruthy();
    const driveLink = screen.getByRole('link', { name: 'Salvar no Drive relatorio.pdf' });
    expect(driveLink.getAttribute('href')).toBe(
      'https://drive.google.com/save?url=https%3A%2F%2Fcdn.example.com%2Frelatorio.pdf',
    );
  });

  it('collapses the header to the real summary when one is present', () => {
    render(
      <ReasoningTimeline
        reasoning={makeReasoning({
          text: 'Raciocínio em andamento.',
          summary: 'Analisei a pergunta e consultei o catálogo real antes da resposta.',
        })}
        steps={[]}
        fallbackSummary=""
        isProcessing={false}
        isComplete
      />,
    );

    expect(
      screen.getByText('Analisei a pergunta e consultei o catálogo real antes da resposta.'),
    ).toBeTruthy();
  });
});
