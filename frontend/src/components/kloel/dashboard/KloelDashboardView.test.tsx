import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { KloelDashboardView } from './KloelDashboard/KloelDashboardView';

function renderDashboardView(overrides?: Partial<ComponentProps<typeof KloelDashboardView>>) {
  const inputRef = { current: null };
  const fileInputRef = { current: null };
  const messagesEndRef = { current: null };
  const props: ComponentProps<typeof KloelDashboardView> = {
    isDragActive: false,
    hasMessages: false,
    messages: [],
    conversationTitle: 'Nova conversa',
    onTitle: vi.fn(),
    streamingMessageId: null,
    isThinking: false,
    isReplyInFlight: false,
    showSlowHint: false,
    greetingLine: 'Ola',
    input: '',
    composerPlaceholder: 'Como posso ajudar?',
    activeCapability: null,
    attachments: [],
    linkedProduct: null,
    selectableProducts: [],
    selectableProductsLoading: false,
    composerNotice: null,
    pendingApprovals: [],
    pendingApprovalsLoading: false,
    approvalActionInFlight: null,
    fileInputRef,
    inputRef,
    messagesEndRef,
    onDragEnter: vi.fn(),
    onDragOver: vi.fn(),
    onDragLeave: vi.fn(),
    onDropFiles: vi.fn().mockResolvedValue(undefined),
    onQueueFilesForUpload: vi.fn().mockResolvedValue(undefined),
    onQuickAction: vi.fn(),
    onUserEdit: vi.fn().mockResolvedValue(undefined),
    onUserRetry: vi.fn().mockResolvedValue(undefined),
    onAssistantFeedback: vi.fn().mockResolvedValue(undefined),
    onAssistantRegenerate: vi.fn().mockResolvedValue(undefined),
    onCancelActiveReply: vi.fn(),
    onInputChange: vi.fn(),
    onSend: vi.fn(),
    onRemoveAttachment: vi.fn(),
    onRetryAttachment: vi.fn(),
    onSelectProduct: vi.fn(),
    onRemoveLinkedProduct: vi.fn(),
    onCapabilityChange: vi.fn(),
    onApprovalDecision: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };

  return {
    ...render(<KloelDashboardView {...props} />),
    props,
  };
}

describe('KloelDashboardView approvals', () => {
  it('renders pending approvals and dispatches owner decisions', () => {
    const { props } = renderDashboardView({
      pendingApprovals: [
        {
          id: 'approval-1',
          kind: 'kloel_tool:create_campaign',
          scope: 'workspace',
          entityType: 'KloelTool',
          entityId: 'create_campaign',
          state: 'OPEN',
          title: 'Aprovar criacao de campanha pela CIA',
          prompt: 'A CIA quer criar uma campanha para leads quentes.',
          payload: { toolName: 'create_campaign' },
          createdAt: '2026-05-11T18:00:00.000Z',
          updatedAt: '2026-05-11T18:00:00.000Z',
        },
      ],
    });

    expect(screen.getByText('Aprovacoes pendentes')).toBeInTheDocument();
    expect(screen.getByText('Aprovar criacao de campanha pela CIA')).toBeInTheDocument();
    expect(screen.getByText('1 em aberto')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Aprovar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ajustar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rejeitar' }));

    expect(props.onApprovalDecision).toHaveBeenNthCalledWith(1, 'approval-1', 'approve');
    expect(props.onApprovalDecision).toHaveBeenNthCalledWith(2, 'approval-1', 'adjust');
    expect(props.onApprovalDecision).toHaveBeenNthCalledWith(3, 'approval-1', 'reject');
  });
});
