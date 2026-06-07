import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CiaHeader } from './CiaHeader';

type CiaHeaderProps = ComponentProps<typeof CiaHeader>;
type CiaAccountRuntime = NonNullable<CiaHeaderProps['accountRuntime']>;

function makeAccountRuntime(overrides: Partial<CiaAccountRuntime> = {}): CiaAccountRuntime {
  return {
    objective: 'Manter operacao comercial ativa',
    mode: 'ACTIVE',
    openApprovalCount: 0,
    pendingInputCount: 0,
    completedApprovalCount: 0,
    openApprovals: [],
    pendingInputs: [],
    workItems: [],
    openWorkItemCount: 0,
    noLegalActions: false,
    noLegalActionReasons: [],
    capabilityRegistryVersion: '1',
    capabilityCount: 0,
    conversationActionRegistryVersion: '1',
    conversationActionCount: 0,
    lastMeaningfulActionAt: null,
    ...overrides,
  };
}

function renderHeader(overrides: Partial<CiaHeaderProps> = {}) {
  const props: CiaHeaderProps = {
    surface: null,
    accountRuntime: null,
    activating: false,
    workspaceLoading: false,
    hasWorkspace: true,
    onRefresh: vi.fn(),
    onAutopilotTotal: vi.fn(),
    ...overrides,
  };

  return render(<CiaHeader {...props} />);
}

describe('CiaHeader runtime state', () => {
  it('does not report loading after the account runtime is active without a surface payload', () => {
    renderHeader({ accountRuntime: makeAccountRuntime() });

    expect(screen.queryByText('CARREGANDO')).toBeNull();
    expect(screen.getByText('OPERACIONAL')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
  });

  it('keeps the loading state while workspace context is still resolving', () => {
    renderHeader({ workspaceLoading: true, hasWorkspace: false });

    expect(screen.getByText('CARREGANDO')).toBeInTheDocument();
  });
});
