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
    expect(artifactKindFromFileName('relatorio.docx')).toBe('docx');
    expect(artifactKindFromFileName('apresentacao.pptx')).toBe('pptx');
    expect(artifactKindFromFileName('planilha.xlsx')).toBe('xlsx');
    expect(artifactKindFromFileName('grafico.png')).toBe('image');
    expect(artifactKindFromFileName('dados.csv')).toBe('data');
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

  it('uses explicit stream artifact metadata before filename inference', () => {
    const content = '<button>Comprar</button>';
    const artifact = artifactFromReasoningFile(
      {
        name: 'preview.txt',
        artifactId: 'artifact-html-1',
        kind: 'html',
        content,
        contentRef: 'artifact://artifact-html-1',
        meta: 'Página HTML',
        editable: true,
        persistent: true,
      },
      'conv-1',
      3,
      456,
    );

    expect(artifact).toEqual(
      expect.objectContaining({
        id: 'conv-1:artifact-html-1',
        kind: 'html',
        content,
        contentRef: 'artifact://artifact-html-1',
        downloadUrl: expect.stringMatching(/^data:text\/html;charset=utf-8;base64,/),
        editable: true,
        persistent: true,
        createdAt: 456,
      }),
    );
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

  it('keeps remote office artifacts as non-editable real downloads', () => {
    const docx = artifactFromReasoningFile(
      { name: 'relatorio.docx', downloadUrl: 'https://cdn.example.com/relatorio.docx' },
      'conv-1',
      0,
      0,
    );
    const pptx = artifactFromReasoningFile(
      { name: 'apresentacao.pptx', downloadUrl: 'https://cdn.example.com/apresentacao.pptx' },
      'conv-1',
      1,
      0,
    );
    const xlsx = artifactFromReasoningFile(
      { name: 'planilha.xlsx', downloadUrl: 'https://cdn.example.com/planilha.xlsx' },
      'conv-1',
      2,
      0,
    );

    expect(docx?.kind).toBe('docx');
    expect(docx?.editable).toBe(false);
    expect(docx?.downloadUrl).toBe('https://cdn.example.com/relatorio.docx');
    expect(pptx?.kind).toBe('pptx');
    expect(pptx?.editable).toBe(false);
    expect(xlsx?.kind).toBe('xlsx');
    expect(xlsx?.editable).toBe(false);
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

  it('dedupes answer-derived fallback when stream metadata already has the file', () => {
    const longDoc = `# Relatório\n\n${'Conteúdo real do relatório. '.repeat(20)}`;
    const messages: DashboardMessage[] = [
      { id: 'm1', role: 'user', text: 'gere um relatório' },
      {
        id: 'm2',
        role: 'assistant',
        text: `Aqui está:\n\n\`\`\`markdown\n${longDoc}\n\`\`\``,
        metadata: {
          files: [
            {
              name: 'relatorio.md',
              artifactId: 'artifact-relatorio-1',
              kind: 'markdown',
              content: longDoc,
              meta: 'Documento · MD',
              editable: true,
              persistent: true,
            },
          ],
        },
      },
    ];

    const artifacts = deriveArtifacts(messages, 'conv-1');
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.id).toBe('conv-1:artifact-relatorio-1');
    expect(artifacts[0]?.content).toBe(longDoc);
  });

  it('dedupes fallback artifacts by inline content when the stream supplied a better filename', () => {
    const html = `<!doctype html>\n<html><body><button>+1</button></body></html>`;
    const messages: DashboardMessage[] = [
      { id: 'm1', role: 'user', text: 'gere html' },
      {
        id: 'm2',
        role: 'assistant',
        text: `Arquivo 2: contador.html\n\n\`\`\`html\n${html}\n\`\`\``,
        metadata: {
          files: [
            {
              name: 'contador.html',
              artifactId: 'artifact-contador-1',
              kind: 'html',
              content: html,
              meta: 'Página HTML · HTML',
              editable: true,
              persistent: true,
            },
          ],
        },
      },
    ];

    const artifacts = deriveArtifacts(messages, 'conv-1');
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.title).toBe('contador.html');
    expect(artifacts[0]?.id).toBe('conv-1:artifact-contador-1');
  });

  it('dedupes generic fallback artifacts when stream metadata already has that extension', () => {
    const answerHtml = `<!doctype html>\n<html><body>${'<p>Linha</p>'.repeat(40)}</body></html>`;
    const messages: DashboardMessage[] = [
      { id: 'm1', role: 'user', text: 'gere html' },
      {
        id: 'm2',
        role: 'assistant',
        text: `\`\`\`html\n${answerHtml}\n\`\`\``,
        metadata: {
          files: [
            {
              name: 'contador.html',
              artifactId: 'artifact-contador-1',
              kind: 'html',
              content: '<!doctype html><html><body>stream artifact</body></html>',
              meta: 'Página HTML · HTML',
              editable: true,
              persistent: true,
            },
          ],
        },
      },
    ];

    const artifacts = deriveArtifacts(messages, 'conv-1');
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.title).toBe('contador.html');
  });

  it('dedupes generic markdown substrates when stream metadata has a professional document', () => {
    const answerMarkdown = Array.from(
      { length: 10 },
      (_, index) =>
        `- item ${index + 1}: conteudo markdown usado apenas como substrato de um PDF profissional.`,
    ).join('\n');
    const messages: DashboardMessage[] = [
      { id: 'm1', role: 'user', text: 'gere pdf' },
      {
        id: 'm2',
        role: 'assistant',
        text: `Arquivo: relatorio.pdf\n\`\`\`markdown\n${answerMarkdown}\n\`\`\``,
        metadata: {
          files: [
            {
              name: 'relatorio.pdf',
              artifactId: 'artifact-relatorio-pdf',
              kind: 'pdf',
              meta: 'PDF · PDF',
              downloadUrl: 'data:application/pdf;base64,JVBERi0=',
              editable: false,
              persistent: true,
            },
          ],
        },
      },
    ];

    const artifacts = deriveArtifacts(messages, 'conv-1');
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.title).toBe('relatorio.pdf');
  });

  it('dedupes named markdown and csv substrates when stream metadata has professional documents', () => {
    const markdownBody = Array.from(
      { length: 8 },
      (_, index) => `Slide ${index + 1}: conteudo intermediario para montar o PowerPoint.`,
    ).join('\n');
    const csvBody = 'fase,status\nPesquisa web,ok\nDashboard de dados,ok\nValidacao browser,ok';
    const messages: DashboardMessage[] = [
      { id: 'm1', role: 'user', text: 'gere office' },
      {
        id: 'm2',
        role: 'assistant',
        text: [
          'Arquivo: validacao.docx',
          `Arquivo disponível para download: slide-1-pesquisa-web.md\n\`\`\`markdown\n${markdownBody}\n\`\`\``,
          'Arquivo: validacao.pptx',
          `Arquivo disponível para download: documento-3.csv\n\`\`\`csv\n${csvBody}\n\`\`\``,
          'Arquivo: validacao.xlsx',
        ].join('\n'),
        metadata: {
          files: [
            {
              name: 'validacao.docx',
              artifactId: 'artifact-validacao-docx',
              kind: 'docx',
              meta: 'Word · DOCX',
              downloadUrl:
                'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,UEs=',
              editable: false,
              persistent: true,
            },
            {
              name: 'validacao.pptx',
              artifactId: 'artifact-validacao-pptx',
              kind: 'pptx',
              meta: 'PowerPoint · PPTX',
              downloadUrl:
                'data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,UEs=',
              editable: false,
              persistent: true,
            },
            {
              name: 'validacao.xlsx',
              artifactId: 'artifact-validacao-xlsx',
              kind: 'xlsx',
              meta: 'Excel · XLSX',
              downloadUrl:
                'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,UEs=',
              editable: false,
              persistent: true,
            },
          ],
        },
      },
    ];

    const artifacts = deriveArtifacts(messages, 'conv-1');
    expect(artifacts.map((artifact) => artifact.title)).toEqual([
      'validacao.docx',
      'validacao.pptx',
      'validacao.xlsx',
    ]);
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

  it('does not close by clicking the backdrop behind the artifact window', () => {
    const onClose = vi.fn();
    const { container } = render(
      <ArtifactsPanel
        artifact={makeArtifact()}
        editable
        onClose={onClose}
        onContentChange={vi.fn()}
      />,
    );
    fireEvent.click(container.firstElementChild as Element);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('toggles fullscreen with the emerald traffic light without closing the artifact', () => {
    const onClose = vi.fn();
    render(
      <ArtifactsPanel
        artifact={makeArtifact()}
        editable
        onClose={onClose}
        onContentChange={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Artefato: plano.md' });
    expect(dialog.style.width).not.toBe('auto');

    fireEvent.click(screen.getByLabelText('Expandir janela'));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Restaurar janela')).toBeTruthy();
    expect(dialog.style.width).toBe('auto');
    expect(dialog.style.height).toBe('auto');
  });

  it('resizes the desktop artifact window with the bottom-right grip', () => {
    render(
      <ArtifactsPanel
        artifact={makeArtifact()}
        editable
        onClose={vi.fn()}
        onContentChange={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Artefato: plano.md' });
    const initialWidth = Number.parseFloat(dialog.style.width);
    const initialHeight = Number.parseFloat(dialog.style.height);

    fireEvent.pointerDown(screen.getByLabelText('Redimensionar janela'), {
      pointerId: 7,
      clientX: 700,
      clientY: 400,
    });
    fireEvent.pointerMove(window, { pointerId: 7, clientX: 780, clientY: 455 });
    fireEvent.pointerUp(window, { pointerId: 7 });

    expect(Number.parseFloat(dialog.style.width)).toBeGreaterThan(initialWidth);
    expect(Number.parseFloat(dialog.style.height)).toBeGreaterThan(initialHeight);
  });

  it('renders HTML artifacts in an interactive unique-origin sandbox', () => {
    render(
      <ArtifactsPanel
        artifact={makeArtifact({
          kind: 'html',
          title: 'calculadora.html',
          content: '<button id="run">Somar</button><script>window.__ran = true;</script>',
          downloadUrl: undefined,
          editable: true,
        })}
        editable
        onClose={vi.fn()}
        onContentChange={vi.fn()}
      />,
    );
    const iframe = screen.getByTitle('Pré-visualização HTML');
    expect(iframe.getAttribute('sandbox')).toContain('allow-scripts');
    expect(iframe.getAttribute('sandbox')).not.toContain('allow-same-origin');
  });

  it('renders React artifacts in an executable unique-origin sandbox', () => {
    render(
      <ArtifactsPanel
        artifact={makeArtifact({
          kind: 'react',
          title: 'Widget.tsx',
          content: 'export default function App() { return <button>Comprar</button>; }',
          downloadUrl: undefined,
          editable: true,
        })}
        editable
        onClose={vi.fn()}
        onContentChange={vi.fn()}
      />,
    );

    const iframe = screen.getByTitle('Pré-visualização React');
    expect(iframe.getAttribute('sandbox')).toContain('allow-scripts');
    expect(iframe.getAttribute('sandbox')).not.toContain('allow-same-origin');
    const srcdoc = iframe.getAttribute('srcdoc') || '';
    expect(srcdoc).toContain('react.production.min.js');
    expect(srcdoc).toContain('@babel/standalone');
    expect(srcdoc).toContain('function App()');
    expect(srcdoc).not.toContain('export default function App');
  });

  it('loads the React artifact capability libraries as sandbox globals', () => {
    render(
      <ArtifactsPanel
        artifact={makeArtifact({
          kind: 'react',
          title: 'Dashboard.jsx',
          content: 'function App() { return <LineChart data={[]} />; }',
          downloadUrl: undefined,
          editable: true,
        })}
        editable
        onClose={vi.fn()}
        onContentChange={vi.fn()}
      />,
    );

    const srcdoc = screen.getByTitle('Pré-visualização React').getAttribute('srcdoc') || '';
    expect(srcdoc).toContain('recharts/umd/Recharts');
    expect(srcdoc).toContain('d3@7');
    expect(srcdoc).toContain('three@');
    expect(srcdoc).toContain('plotly-');
    expect(srcdoc).toContain('chart.umd.min.js');
    expect(srcdoc).toContain('tone@');
    expect(srcdoc).toContain('mathjs@');
    expect(srcdoc).toContain('lodash@');
    expect(srcdoc).toContain('papaparse@');
    expect(srcdoc).toContain('xlsx@');
    expect(srcdoc).toContain('mammoth@');
    expect(srcdoc).toContain('@tensorflow/tfjs@');
    expect(srcdoc).toContain('lucide-react@');
    expect(srcdoc).toContain('const { LineChart, Line, BarChart, Bar, XAxis, YAxis } = Recharts;');
    expect(srcdoc).toContain('const { Search, Download, Save, X, Maximize2, MapPin } = LucideReact;');
  });

  it('renders data artifacts as an inspectable table preview', () => {
    render(
      <ArtifactsPanel
        artifact={makeArtifact({
          kind: 'data',
          title: 'dados.csv',
          content: 'nome,valor\nPlano Pro,97\nCurso,197',
          downloadUrl: undefined,
          editable: true,
        })}
        editable
        onClose={vi.fn()}
        onContentChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByText('nome')).toBeTruthy();
    expect(screen.getByText('Plano Pro')).toBeTruthy();
    expect(screen.getByText('197')).toBeTruthy();
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
