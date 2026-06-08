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
  it('renders the real streamed reasoning text inside the thinking step while processing', () => {
    render(
      <ReasoningTimeline
        reasoning={makeReasoning({ text: 'Analisando os dados da conta antes de responder.' })}
        steps={[]}
        fallbackSummary=""
        isProcessing
        isComplete={false}
      />,
    );

    expect(
      screen.getByText('Analisando os dados da conta antes de responder.'),
    ).toBeTruthy();
  });

  it('keeps the streamed reasoning text visible after completion', () => {
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

  it('renders tool steps with the real tool name and measured duration', () => {
    const steps: AssistantProcessingTraceEntry[] = [
      {
        id: 'call-1:call',
        kind: 'tool_call',
        phase: 'tool_calling',
        label: 'Consultei contexto operacional relevante antes de responder.',
        tool: 'catálogo de produtos',
      },
      {
        id: 'call-1:result',
        kind: 'tool_result',
        phase: 'tool_result',
        label: 'Incorporei as observações encontradas antes de responder.',
        tool: 'catálogo de produtos',
        durationMs: 1200,
        success: true,
      },
    ];

    render(
      <ReasoningTimeline
        reasoning={makeReasoning({ text: 'Pensando.' })}
        steps={steps}
        fallbackSummary=""
        isProcessing={false}
        isComplete
      />,
    );

    expect(screen.getAllByText('catálogo de produtos').length).toBeGreaterThan(0);
    expect(screen.getByText('1.2s')).toBeTruthy();
    expect(screen.getByText('Concluído')).toBeTruthy();
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
