import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  getMe: vi.fn(),
  getWorkspaceId: vi.fn(),
  updateSettings: vi.fn(),
}));

vi.mock('@/lib/i18n/t', () => ({
  kloelT: (value: string) => value,
}));

vi.mock('@/lib/api', () => ({
  tokenStorage: {
    getWorkspaceId: apiMocks.getWorkspaceId,
  },
  workspaceApi: {
    getMe: apiMocks.getMe,
    updateSettings: apiMocks.updateSettings,
  },
}));

vi.mock('./contract', () => ({
  SettingsNotice: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  kloelSettingsClass: {
    sectionDescription: '',
    sectionTitle: '',
  },
}));

vi.mock('./ai-tools-panel', () => ({ AiToolsPanel: () => <div>AiToolsPanel</div> }));
vi.mock('./autopilot-section', () => ({ AutopilotSection: () => <div>AutopilotSection</div> }));
vi.mock('./company-identity-section', () => ({ CompanyIdentitySection: () => <div>CompanyIdentitySection</div> }));
vi.mock('./emergency-mode-card', () => ({ EmergencyModeCard: () => <div>EmergencyModeCard</div> }));
vi.mock('./faq-section', () => ({ FaqSection: ({ value }: { value: unknown[] }) => <div>Faqs:{value.length}</div> }));
vi.mock('./knowledge-base-section', () => ({ KnowledgeBaseSection: () => <div>KnowledgeBaseSection</div> }));
vi.mock('./kloel-status-card', () => ({
  KloelStatusCard: ({ rulesLearned }: { rulesLearned: number }) => <div>StatusRules:{rulesLearned}</div>,
}));
vi.mock('./missing-steps-card', () => ({ MissingStepsCard: () => <div>MissingStepsCard</div> }));
vi.mock('./opening-message-card', () => ({ OpeningMessageCard: () => <div>OpeningMessageCard</div> }));
vi.mock('./product-catalog-section', () => ({ ProductCatalogSection: () => <div>ProductCatalogSection</div> }));
vi.mock('./voice-tone-section', () => ({ VoiceToneSection: () => <div>VoiceToneSection</div> }));
vi.mock('./customer-personas-section', () => ({
  CustomerPersonasSection: ({ value }: { value: unknown[] }) => <div>Personas:{value.length}</div>,
}));
vi.mock('./attendance-rules-section', () => ({
  AttendanceRulesSection: ({ value }: { value: unknown[] }) => <div>Rules:{value.length}</div>,
}));

import { BrainSettingsSection } from './brain-settings-section';

function workspaceResponse(kloelProfile: Record<string, unknown>) {
  return {
    data: {
      providerSettings: {
        kloelProfile,
      },
    },
  };
}

const validProfile = {
  company: { name: 'Empresa Real', sector: 'Educacao', description: 'Perfil real', mission: '', differentials: ['Diferencial'] },
  emergencyMode: { emergencyAction: 'pause', fixedMessage: 'Aguarde' },
  faqs: [{ id: 'faq-1', question: 'Pergunta?', answer: 'Resposta' }],
  openingMessage: { message: 'Ola', useEmojis: true, isFormal: false, isFriendly: true },
  personas: ['Persona Real'],
  rules: ['Regra Real'],
  voiceTone: { style: 'consultivo', customInstructions: '', useProfessional: true, useFriendly: true, usePersuasive: false },
};

describe('BrainSettingsSection', () => {
  beforeEach(() => {
    Object.values(apiMocks).forEach((mock) => mock.mockReset());
    apiMocks.getWorkspaceId.mockReturnValue('workspace-1');
  });

  it('keeps loaded personas and rules visible when a profile refresh returns malformed arrays', async () => {
    apiMocks.getMe.mockResolvedValueOnce(workspaceResponse(validProfile));

    const { rerender } = render(<BrainSettingsSection />);

    await screen.findByText('Personas:1');
    expect(screen.queryByText('Rules:1')).not.toBeNull();
    expect(screen.queryByText('StatusRules:1')).not.toBeNull();

    apiMocks.getWorkspaceId.mockReturnValue('workspace-2');
    apiMocks.getMe.mockResolvedValueOnce(workspaceResponse({ ...validProfile, personas: { id: 'persona-1' } }));

    rerender(<BrainSettingsSection />);

    await screen.findByText('Payload de perfil Kloel invalido: personas.');
    expect(screen.queryByText('Personas:1')).not.toBeNull();
    expect(screen.queryByText('Rules:1')).not.toBeNull();
    expect(screen.queryByText('StatusRules:1')).not.toBeNull();
    await waitFor(() => expect(apiMocks.getMe).toHaveBeenCalledTimes(2));
  });
});
