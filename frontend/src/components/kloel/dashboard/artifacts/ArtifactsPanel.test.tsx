import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DashboardMessage } from '../KloelDashboard.message';
import { ArtifactsPanel } from './ArtifactsPanel';
import {
  artifactFromReasoningFile,
  artifactKindFromFileName,
  decodeDataUrlText,
  encodeTextToDataUrl,
  type Artifact,
} from './artifact-types';
import { deriveArtifacts } from './useArtifacts';

function makeArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: 'conv-1:0:plano.md',
    conversationId: 'conv-1',
    kind: 'markdown',
    title: 'plano.md',
    content: '# Plano de lançamento\n\nPasso 1.',
    downloadUrl: undefined,
    meta: 'Documento · MD',
    editable: true,
    createdAt: 0,
    ...overrides,
  };
}

describe('artifact-types', () => {
  it('maps file extensions to artifact kinds', () => {
    expect(artifactKindFromFileName('plano.md')).toBe('markdown');
    expect(artifactKindFromFileName('pagina.html')).toBe('html');
    expect(artifactKindFromFileName('grafico.svg')).toBe('svg');
    expect(artifactKindFromFileName('fluxo.mmd')).toBe('mermaid');
    expect(artifactKindFromFileName('Componente.tsx')).toBe('react');
    expect(artifactKindFromFileName('relatorio.pdf')).toBe('pdf');
    expect(artifactKindFromFileName('script.py')).toBe('code');
    expect(artifactKindFromFileName('arquivo-sem-extensao')).toBe('code');
  });

  it('round-trips text through a base64 data URL', () => {
    const text = '# Título com acentuação — çãé';
    const url = encodeTextToDataUrl(text, 'text/markdown');
    expect(url.startsWith('data:text/markdown')).toBe(true);
    expect(decodeDataUrlText(url)).toBe(text);
  });

  it('returns null when decoding a non-data URL', () => {
    expect(decodeDataUrlText('https://example.com/file.md')).toBe(null);
    expect(decodeDataUrlText(undefined)).toBe(null);
  });

  it('builds an editable artifact from a real inlined text file', () => {
    const content = '# Plano\n\nConteúdo real.';
    const artifact = artifactFromReasoningFile(
      {
        name: 'plano.md',
        meta: 'Documento · MD',
        downloadUrl: encodeTextToDataUrl(content, 'text/markdown'),
      },
      'conv-1',
      0,
      123,
    );
    expect(artifact).not.toBe(null);
    expect(artifact?.kind).toBe('markdown');
    expect(artifact?.editable).toBe(true);
    expect(artifact?.content).toBe(content);
    expect(artifact?.createdAt).toBe(123);
  });

  it('does not fabricate an artifact for a file with no content and no url', () => {
    const artifact = artifactFromReasoningFile({ name: 'vazio.md' }, 'conv-1', 0, 0);
    expect(artifact).toBe(null);
  });

  it('keeps a remote pdf as a non-editable download artifact', () => {
    const artifact = artifactFromReasoningFile(
      { name: 'relatorio.pdf', url: 'https://cdn.example.com/relatorio.pdf' },
      'conv-1',
      0,
      0,
    );
    expect(artifact?.kind).toBe('pdf');
    expect(artifact?.editable).toBe(false);
    expect(artifact?.downloadUrl).toBe('https://cdn.example.com/relatorio.pdf');
  });
});

describe('deriveArtifacts', () => {
  it('derives artifacts from a real assistant answer fenced block', () => {
    const longDoc = `# Relatório\n\n${'Conteúdo real do relatório. '.repeat(20)}`;
    const messages: DashboardMessage[] = [
      { id: 'm1', role: 'user', text: 'gere um relatório' },
      {
        id: 'm2',
        role: 'assistant',
        text: `Aqui está:\n\n\`\`\`markdown\n${longDoc}\n\`\`\``,
        metadata: null,
      },
    ];
    const artifacts = deriveArtifacts(messages, 'conv-1');
    expect(artifacts.length).toBe(1);
    expect(artifacts[0]?.kind).toBe('markdown');
    expect(artifacts[0]?.editable).toBe(true);
  });

  it('returns an empty list when no real artifact exists', () => {
    const messages: DashboardMessage[] = [
      { id: 'm1', role: 'user', text: 'oi' },
      { id: 'm2', role: 'assistant', text: 'Olá! Como posso ajudar?', metadata: null },
    ];
    expect(deriveArtifacts(messages, 'conv-1')).toEqual([]);
  });
});

describe('ArtifactsPanel', () => {
  it('renders nothing when no artifact is open', () => {
    const { container } = render(
      <ArtifactsPanel
        artifact={null}
        editable={false}
        onClose={vi.fn()}
        onContentChange={vi.fn()}
      />,
    );
    expect(container.firstChild).toBe(null);
  });

  it('renders the artifact title and a working download link', () => {
    render(
      <ArtifactsPanel
        artifact={makeArtifact()}
        editable
        onClose={vi.fn()}
        onContentChange={vi.fn()}
      />,
    );
    expect(screen.getByText('plano.md')).toBeTruthy();
    const download = screen.getByText('Baixar').closest('a');
    expect(download?.getAttribute('download')).toBe('plano.md');
    expect(download?.getAttribute('href')?.startsWith('data:text/markdown')).toBe(true);
  });

  it('closes via the ember-red traffic light', () => {
    const onClose = vi.fn();
    render(
      <ArtifactsPanel
        artifact={makeArtifact()}
        editable
        onClose={onClose}
        onContentChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText('Fechar artefato'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('enters edit mode and emits content changes for text kinds', () => {
    const onContentChange = vi.fn();
    render(
      <ArtifactsPanel
        artifact={makeArtifact()}
        editable
        onClose={vi.fn()}
        onContentChange={onContentChange}
      />,
    );
    fireEvent.click(screen.getByLabelText('Editar'));
    const textarea = screen.getByLabelText('Editar conteúdo do artefato');
    fireEvent.change(textarea, { target: { value: '# Novo conteúdo' } });
    expect(onContentChange).toHaveBeenCalledWith('conv-1:0:plano.md', '# Novo conteúdo');
  });

  it('does not show the edit affordance for a non-editable artifact', () => {
    render(
      <ArtifactsPanel
        artifact={makeArtifact({
          kind: 'pdf',
          title: 'relatorio.pdf',
          content: '',
          editable: false,
          downloadUrl: 'https://cdn.example.com/relatorio.pdf',
        })}
        editable={false}
        onClose={vi.fn()}
        onContentChange={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText('Editar')).toBe(null);
  });
});
