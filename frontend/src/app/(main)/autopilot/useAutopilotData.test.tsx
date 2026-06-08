import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchAutopilotDataBundle, toggleAutopilot, tokenStorage } = vi.hoisted(() => ({
  fetchAutopilotDataBundle: vi.fn(),
  toggleAutopilot: vi.fn(),
  tokenStorage: {
    getToken: vi.fn(() => 'token-1'),
    getWorkspaceId: vi.fn(() => 'workspace-1'),
  },
}));

vi.mock('@/lib/api', () => ({
  askAutopilotInsights: vi.fn(),
  exportAutopilotActions: vi.fn(),
  runAutopilotSmokeTest: vi.fn(),
  toggleAutopilot,
  updateAutopilotConfig: vi.fn(),
  tokenStorage,
}));

vi.mock('./page.helpers', () => ({
  deriveAutopilotMissions: vi.fn(() => []),
  fetchAutopilotDataBundle,
}));

import { useAutopilotData } from './useAutopilotData';

function autopilotBundle() {
  return {
    status: { enabled: false, billingSuspended: false },
    stats: null,
    impact: null,
    actions: [],
    pipeline: {
      workspaceId: 'workspace-1',
      autonomy: { connected: false, whatsappStatus: 'DISCONNECTED' },
    },
    systemHealth: null,
    moneyReport: null,
    revenueEvents: [],
    insights: [],
    queueStats: null,
    config: null,
    runtimeConfig: null,
    partialError: false,
  };
}

describe('useAutopilotData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchAutopilotDataBundle.mockResolvedValue(autopilotBundle());
  });

  it('blocks activation locally when WhatsApp is known disconnected', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const backendMessage =
      'Conecte/configure o WhatsApp antes de ativar o Autopilot. Faltando: whatsappApiSession.status=connected';
    toggleAutopilot.mockRejectedValueOnce(new Error(backendMessage));

    const { result } = renderHook(() => useAutopilotData('workspace-1'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.handleToggle();
    });

    expect(result.current.error).toBe(backendMessage);
    expect(toggleAutopilot).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();

    consoleError.mockRestore();
  });
});
