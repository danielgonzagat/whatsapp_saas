import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchCrmInitialDataMock = vi.hoisted(() => vi.fn());
const apiMocks = vi.hoisted(() => ({
  autoSegment: vi.fn(),
  createContact: vi.fn(),
  createDeal: vi.fn(),
  createPipeline: vi.fn(),
  getPresetSegment: vi.fn(),
  moveDeal: vi.fn(),
}));

vi.mock('@/lib/i18n/t', () => ({
  kloelT: (value: string) => value,
}));

vi.mock('@/components/kloel/KloelBrand', () => ({
  KloelMushroomMark: () => <span data-testid="kloel-mark" />,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('@/lib/api', () => ({
  crmApi: {
    createContact: apiMocks.createContact,
    createDeal: apiMocks.createDeal,
    createPipeline: apiMocks.createPipeline,
    moveDeal: apiMocks.moveDeal,
  },
  segmentationApi: {
    autoSegment: apiMocks.autoSegment,
    getPresetSegment: apiMocks.getPresetSegment,
  },
}));

vi.mock('./contract', () => ({
  SettingsNotice: ({ children }: { children: ReactNode }) => <div role="alert">{children}</div>,
  kloelSettingsClass: {
    outlineButton: '',
    sectionDescription: '',
    sectionTitle: '',
  },
}));

vi.mock('./crm-settings-section.handlers', () => ({
  fetchCrmInitialData: fetchCrmInitialDataMock,
}));

vi.mock('./crm-settings-section.parts', () => ({
  ContactCard: ({ contacts }: { contacts: unknown[] }) => <div>ContactCard:{contacts.length}</div>,
  SegmentationCard: ({
    onPresetChange,
    presetContacts,
    presets,
  }: {
    onPresetChange: (value: string) => void;
    presetContacts: unknown[];
    presets: unknown[];
  }) => (
    <div>
      <div>SegmentationCard:{presets.length}</div>
      <div>PresetContacts:{presetContacts.length}</div>
      <button type="button" onClick={() => onPresetChange('Preset Novo')}>Trocar preset</button>
    </div>
  ),
  StatCard: ({ title, value }: { title: string; value: string }) => <div>{title}:{value}</div>,
}));

vi.mock('./crm-settings-section.pipeline', () => ({
  PipelineCard: ({ pipelines }: { pipelines: unknown[] }) => <div>PipelineCard:{pipelines.length}</div>,
}));

import { CrmSettingsSection } from './crm-settings-section';

const initialCrmData = {
  contacts: [{ id: 'contact-1', phone: '+5511999999999', name: 'Contato Real', tags: [] }],
  deals: [{ id: 'deal-1', title: 'Deal Real', contactId: 'contact-1', stageId: 'stage-1', value: 9900 }],
  pipelines: [{ id: 'pipeline-1', name: 'Pipeline Real', stages: [{ id: 'stage-1', name: 'Novo' }] }],
  presets: [{ id: 'preset-1', name: 'Preset Real', criteria: {} }],
  stats: { total: 1, totalContacts: 1, segments: [] },
};

describe('CrmSettingsSection', () => {
  beforeEach(() => {
    fetchCrmInitialDataMock.mockReset();
    Object.values(apiMocks).forEach((mock) => mock.mockReset());
    apiMocks.getPresetSegment.mockResolvedValue({ data: { contacts: [], total: 0 } });
  });

  it('keeps loaded CRM data visible when a manual refresh fails', async () => {
    fetchCrmInitialDataMock.mockResolvedValue(initialCrmData);

    render(<CrmSettingsSection />);

    await screen.findByText('Contatos:1');
    await waitFor(() => expect(fetchCrmInitialDataMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('Pipelines:1')).not.toBeNull();
    expect(screen.queryByText('Deals:1')).not.toBeNull();

    fetchCrmInitialDataMock.mockRejectedValueOnce(new Error('Payload de contatos CRM invalido.'));
    fireEvent.click(screen.getByRole('button', { name: /Atualizar/i }));

    await screen.findByText('Payload de contatos CRM invalido.');
    await waitFor(() => expect(fetchCrmInitialDataMock).toHaveBeenCalledTimes(3));
    expect(screen.queryByText('Contatos:1')).not.toBeNull();
    expect(screen.queryByText('Pipelines:1')).not.toBeNull();
    expect(screen.queryByText('Deals:1')).not.toBeNull();
  });

  it('keeps loaded preset contacts visible when the selected segment payload is malformed', async () => {
    fetchCrmInitialDataMock.mockResolvedValue(initialCrmData);
    apiMocks.getPresetSegment.mockResolvedValue({
      data: { contacts: [{ id: 'segment-contact-1', phone: '+5511888888888', name: 'Contato Segmentado' }], total: 1 },
    });

    render(<CrmSettingsSection />);

    await screen.findByText('PresetContacts:1');

    apiMocks.getPresetSegment.mockResolvedValueOnce({ data: { total: 0 } });
    fireEvent.click(screen.getByRole('button', { name: 'Trocar preset' }));

    await screen.findByText('Payload de segmento CRM invalido.');
    expect(screen.queryByText('PresetContacts:1')).not.toBeNull();
  });
});
