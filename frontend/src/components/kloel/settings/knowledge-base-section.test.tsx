import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  addSource: vi.fn(),
  create: vi.fn(),
  getWorkspaceId: vi.fn(),
  list: vi.fn(),
  listSources: vi.fn(),
}));

vi.mock('@/lib/i18n/t', () => ({
  kloelT: (value: string) => value,
}));

vi.mock('@/lib/api', () => ({
  knowledgeBaseApi: {
    addSource: apiMocks.addSource,
    create: apiMocks.create,
    list: apiMocks.list,
    listSources: apiMocks.listSources,
  },
  tokenStorage: {
    getWorkspaceId: apiMocks.getWorkspaceId,
  },
}));

vi.mock('./accordion-section', () => ({
  AccordionSection: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}));

vi.mock('./kb-file-upload', () => ({
  KbFileUpload: ({ selectedKbId }: { selectedKbId: string }) => <div>UploadKb:{selectedKbId}</div>,
}));

import { KnowledgeBaseSection } from './knowledge-base-section';

const knowledgeBase = {
  id: 'kb-1',
  name: 'Base Real',
};

const knowledgeSource = {
  id: 'source-1',
  type: 'TEXT' as const,
  content: 'Conteudo real',
  status: 'READY',
  createdAt: '2026-06-03T12:00:00.000Z',
};

beforeEach(() => {
  Object.values(apiMocks).forEach((mock) => mock.mockReset());
  apiMocks.getWorkspaceId.mockReturnValue('workspace-1');
  apiMocks.list.mockResolvedValue({ data: [knowledgeBase] });
  apiMocks.listSources.mockResolvedValue({ data: [knowledgeSource] });
});

describe('KnowledgeBaseSection', () => {
  it('rejects malformed create payloads instead of showing a fake local success', async () => {
    apiMocks.create.mockResolvedValueOnce({ data: { name: 'Base sem id' } });

    render(<KnowledgeBaseSection />);

    await screen.findByText('1 base(s) carregada(s).');
    fireEvent.change(screen.getByPlaceholderText('Nova base de conhecimento'), {
      target: { value: 'Base Nova' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Criar base/i }));

    await waitFor(() => {
      expect(screen.queryByText('Payload de base de conhecimento invalido.')).not.toBeNull();
    });

    expect(screen.queryByText('Base Base Nova criada.')).toBeNull();
    expect(apiMocks.create).toHaveBeenCalledWith('Base Nova');
  });
});
