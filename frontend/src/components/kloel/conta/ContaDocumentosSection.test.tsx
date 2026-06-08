import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import DocumentosSection from './ContaDocumentosSection';

const mocks = vi.hoisted(() => ({
  deleteDocument: vi.fn(),
  mutate: vi.fn(),
  uploadDocument: vi.fn(),
}));

vi.mock('@/hooks/useKyc', () => ({
  useDocumentMutations: () => ({
    deleteDocument: mocks.deleteDocument,
    uploadDocument: mocks.uploadDocument,
  }),
}));

describe('DocumentosSection', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('exposes empty upload zones as keyboard accessible upload buttons', () => {
    render(<DocumentosSection documents={[]} fiscal={{ type: 'PF' }} mutate={mocks.mutate} />);

    expect(screen.getByRole('button', { name: /Enviar Documento de identidade/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Enviar Comprovante de residencia/i })).toBeTruthy();
  });

  it('names pending document delete actions with the uploaded file name', () => {
    render(
      <DocumentosSection
        documents={[
          {
            id: 'doc-1',
            type: 'DOCUMENT_FRONT',
            status: 'pending',
            fileName: 'rg.pdf',
          },
        ]}
        fiscal={{ type: 'PF' }}
        mutate={mocks.mutate}
      />,
    );

    expect(screen.getByRole('button', { name: /Excluir rg\.pdf/i })).toBeTruthy();
  });

  it('uploads identity documents through the real document mutation path', async () => {
    mocks.uploadDocument.mockResolvedValueOnce({ id: 'doc-1' });
    const file = new File(['documento'], 'rg.pdf', { type: 'application/pdf' });

    render(<DocumentosSection documents={[]} fiscal={{ type: 'PF' }} mutate={mocks.mutate} />);

    const input = screen.getByLabelText('Documento de identidade') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(mocks.uploadDocument).toHaveBeenCalledWith('DOCUMENT_FRONT', file);
    });
    expect(mocks.mutate).toHaveBeenCalled();
  });

  it('lets pending documents be replaced without deleting first', async () => {
    mocks.uploadDocument.mockResolvedValueOnce({ id: 'doc-2' });
    const file = new File(['novo documento'], 'rg-novo.pdf', { type: 'application/pdf' });

    render(
      <DocumentosSection
        documents={[
          {
            id: 'doc-1',
            type: 'DOCUMENT_FRONT',
            status: 'pending',
            fileName: 'rg.pdf',
          },
        ]}
        fiscal={{ type: 'PF' }}
        mutate={mocks.mutate}
      />,
    );

    expect(screen.getByRole('button', { name: /Substituir rg\.pdf/i })).toBeTruthy();

    const input = screen.getByLabelText('Documento de identidade - substituir rg.pdf') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(mocks.uploadDocument).toHaveBeenCalledWith('DOCUMENT_FRONT', file);
    });
    expect(mocks.mutate).toHaveBeenCalled();
  });

  it('switches the second upload slot to company documents for PJ fiscal accounts', () => {
    render(<DocumentosSection documents={[]} fiscal={{ type: 'PJ', cnpj: '12345678000190' }} mutate={mocks.mutate} />);

    expect(screen.getByText('Contrato social ou cartao CNPJ')).toBeTruthy();
    expect(screen.getByLabelText('Contrato social ou cartao CNPJ')).toBeTruthy();
  });
});
