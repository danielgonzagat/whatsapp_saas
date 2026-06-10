import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KloelMarkdown } from './KloelMarkdown';
import {
  __resetCdnLoadersForTest,
  type KatexApi,
  type MermaidApi,
} from './KloelMarkdownCdn';

/** Inject a typed library global the same way a loaded CDN script would. */
function setGlobal<T>(key: 'katex' | 'mermaid', value: T): void {
  (window as unknown as Record<string, T>)[key] = value;
}

function clearGlobal(key: 'katex' | 'mermaid'): void {
  delete (window as unknown as Record<string, unknown>)[key];
}

describe('KloelMarkdown render parity', () => {
  it('renders standard GFM markdown (headings, bold, lists)', () => {
    const { container } = render(
      <KloelMarkdown content={'## Título\n\n- **Item um**\n- Item dois'} />,
    );
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Título');
    expect(container.querySelector('strong')).toHaveTextContent('Item um');
    expect(container.querySelectorAll('li')).toHaveLength(2);
  });

  it('adds stable form identifiers to GFM task checkboxes', () => {
    render(<KloelMarkdown content={'- [ ] revisar permissões\n- [x] confirmar isolamento'} />);

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2);
    const ids = checkboxes.map((checkbox) => checkbox.getAttribute('id'));
    const names = checkboxes.map((checkbox) => checkbox.getAttribute('name'));

    expect(ids.every(Boolean)).toBe(true);
    expect(names.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(checkboxes.length);
    expect(new Set(names).size).toBe(checkboxes.length);
  });

  it('renders GFM tables', () => {
    render(
      <KloelMarkdown content={'| A | B |\n| - | - |\n| 1 | 2 |'} />,
    );
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  describe('LaTeX / math (a)', () => {
    it('renders inline $…$ math as a styled math span (not literal $)', () => {
      const { container } = render(<KloelMarkdown content={'A energia é $E = mc^2$ ok.'} />);
      const math = container.querySelector('.kloel-math-inline');
      expect(math).not.toBeNull();
      // c^2 → c² via Unicode superscript.
      expect(math?.textContent).toContain('²');
      // The raw dollar delimiters must not leak into rendered text.
      expect(container.textContent).not.toContain('$');
    });

    it('renders block $$…$$ math as a display block with a real fraction', () => {
      const { container } = render(
        <KloelMarkdown content={'Veja:\n\n$$\\frac{a}{b} + \\alpha$$'} />,
      );
      const display = container.querySelector('.kloel-math-display');
      expect(display).not.toBeNull();
      expect(display?.querySelector('.kloel-frac')).not.toBeNull();
      // \alpha → α.
      expect(display?.textContent).toContain('α');
    });

    it('does not treat a lone unmatched dollar as math', () => {
      const { container } = render(<KloelMarkdown content={'Custa $5 apenas.'} />);
      expect(container.querySelector('.kloel-math-inline')).toBeNull();
      expect(container.textContent).toContain('$5');
    });

    it('never treats Brazilian currency runs as inline math', () => {
      const { container } = render(
        <KloelMarkdown
          content={
            'E2E Smoke Product · R$ 79,50 · inativo; E2E Recovery Proof Product · R$ 99,90 · inativo.'
          }
        />,
      );
      expect(container.querySelector('.kloel-math-inline')).toBeNull();
      expect(container.textContent).toContain('R$ 79,50');
      expect(container.textContent).toContain('R$ 99,90');
    });

    it('keeps paired plain dollar amounts literal', () => {
      const { container } = render(<KloelMarkdown content={'Custa $10 hoje e $20 amanha.'} />);
      expect(container.querySelector('.kloel-math-inline')).toBeNull();
      expect(container.textContent).toContain('$10');
      expect(container.textContent).toContain('$20');
    });
  });

  describe('Mermaid (b)', () => {
    it('recovers a fence glued to prose with no closing fence (live-observed model output)', async () => {
      const content =
        'Diagrama do fluxo de compra:```mermaid\ngraph TD\nA[Cliente compra] --> B[Acesso liberado]';
      const { container } = render(<KloelMarkdown content={content} />);
      await waitFor(() => {
        expect(container.querySelector('.kloel-artifact-mermaid svg')).not.toBeNull();
      });
      expect(container.textContent).not.toContain('```');
    });

    it('renders a ```mermaid graph as an SVG diagram', async () => {
      const content = ['```mermaid', 'graph TD', 'A[Início] --> B[Fim]', '```'].join('\n');
      const { container } = render(<KloelMarkdown content={content} />);
      await waitFor(() => {
        const svg = container.querySelector('.kloel-artifact-mermaid svg');
        expect(svg).not.toBeNull();
      });
      const svg = container.querySelector('.kloel-artifact-mermaid svg');
      expect(svg?.querySelectorAll('rect').length).toBeGreaterThanOrEqual(2);
      expect(svg?.querySelector('line')).not.toBeNull();
      expect(svg?.textContent).toContain('Início');
    });

    it('falls back to a styled source block for unsupported diagram types', async () => {
      const content = ['```mermaid', 'sequenceDiagram', 'Alice->>Bob: Oi', '```'].join('\n');
      const { container } = render(<KloelMarkdown content={content} />);
      await waitFor(() => {
        expect(container.querySelector('.kloel-artifact-mermaid-fallback')).not.toBeNull();
      });
      expect(container.querySelector('.kloel-artifact-mermaid-fallback')?.textContent).toContain(
        'sequenceDiagram',
      );
    });
  });

  describe('HTML artifact (c)', () => {
    it('renders a ```html block inside a sandboxed iframe with no same-origin access', async () => {
      const content = ['```html', '<div class="card">Olá</div>', '```'].join('\n');
      const { container } = render(<KloelMarkdown content={content} />);
      await waitFor(() => {
        expect(container.querySelector('iframe.kloel-artifact-html')).not.toBeNull();
      });
      const iframe = container.querySelector('iframe.kloel-artifact-html');
      const sandbox = iframe?.getAttribute('sandbox') ?? '';
      expect(sandbox).toContain('allow-scripts');
      // Hard security requirement: never same-origin (no cookie/token/storage access).
      expect(sandbox).not.toContain('allow-same-origin');
      expect(iframe?.getAttribute('srcdoc')).toContain('Olá');
    });

    it('preserves script-bearing HTML widgets inside the unique-origin sandbox', async () => {
      const content = [
        '```html',
        '<button id="calc">Somar</button><script>document.getElementById("calc").dataset.ready = "1";</script>',
        '```',
      ].join('\n');
      const { container } = render(<KloelMarkdown content={content} />);
      await waitFor(() => {
        expect(container.querySelector('iframe.kloel-artifact-html')).not.toBeNull();
      });
      const iframe = container.querySelector('iframe.kloel-artifact-html');
      const srcdoc = iframe?.getAttribute('srcdoc') || '';
      expect(iframe?.getAttribute('sandbox')).toContain('allow-scripts');
      expect(iframe?.getAttribute('sandbox')).not.toContain('allow-same-origin');
      expect(srcdoc).toContain('<script>document.getElementById("calc").dataset.ready = "1";</script>');
      expect(srcdoc).toContain('Somar');
    });
  });

  it('preserves SVG artifact rendering', async () => {
    const content = [
      '```svg',
      '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" /></svg>',
      '```',
    ].join('\n');
    const { container } = render(<KloelMarkdown content={content} />);
    await waitFor(() => {
      expect(container.querySelector('.kloel-artifact-svg svg')).not.toBeNull();
    });
  });

  it('keeps fenced code blocks verbatim (not treated as artifacts)', () => {
    const content = ['```ts', 'const x: number = 1;', '```'].join('\n');
    const { container } = render(<KloelMarkdown content={content} />);
    expect(container.textContent).toContain('const x');
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('tokenizes fenced code via rehype-highlight (hljs-* classes reach the DOM)', () => {
    const content = ['```ts', 'const x: number = 1;', '```'].join('\n');
    const { container } = render(<KloelMarkdown content={content} />);
    // rehype-highlight must emit token spans; color is applied by the
    // .kloel-markdown .hljs-* rules in globals.css.
    const keyword = container.querySelector('code .hljs-keyword');
    expect(keyword).not.toBeNull();
    expect(keyword?.textContent).toBe('const');
  });
});

describe('KloelMarkdown real CDN rendering (KaTeX + Mermaid)', () => {
  afterEach(() => {
    clearGlobal('katex');
    clearGlobal('mermaid');
    __resetCdnLoadersForTest();
    vi.restoreAllMocks();
  });

  it('upgrades inline math to real KaTeX output when the CDN global is present', async () => {
    // Mock the CDN-loaded KaTeX: emits a marker KaTeX produces (.katex-html).
    const renderToString = vi.fn((tex: string, options) => {
      const mode = options?.displayMode ? 'display' : 'text';
      return `<span class="katex"><span class="katex-html" data-mode="${mode}">${tex}</span></span>`;
    });
    const katex: KatexApi = { renderToString };
    setGlobal('katex', katex);

    const { container } = render(<KloelMarkdown content={'A energia é $E = mc^2$ ok.'} />);

    await waitFor(() => {
      expect(container.querySelector('.kloel-math-inline[data-katex="true"]')).not.toBeNull();
    });
    // Real KaTeX markup survived sanitization (the .katex span is present).
    expect(container.querySelector('.kloel-math-inline .katex')).not.toBeNull();
    expect(renderToString).toHaveBeenCalledWith(
      'E = mc^2',
      expect.objectContaining({ displayMode: false, throwOnError: false }),
    );
    // Delimiters never leak.
    expect(container.textContent).not.toContain('$');
  });

  it('renders block math via KaTeX in displayMode when the CDN global is present', async () => {
    const renderToString = vi.fn(
      (tex: string, options) =>
        `<span class="katex"><span class="katex-display" data-mode="${
          options?.displayMode ? 'display' : 'text'
        }">${tex}</span></span>`,
    );
    setGlobal('katex', { renderToString });

    const { container } = render(
      <KloelMarkdown content={'Veja:\n\n$$\\frac{a}{b} + \\alpha$$'} />,
    );

    await waitFor(() => {
      expect(container.querySelector('.kloel-math-display[data-katex="true"]')).not.toBeNull();
    });
    expect(container.querySelector('.kloel-math-display .katex-display')).not.toBeNull();
    expect(renderToString).toHaveBeenCalledWith(
      expect.stringContaining('\\frac'),
      expect.objectContaining({ displayMode: true }),
    );
  });

  it('falls back to the built-in math renderer when KaTeX renderToString throws', async () => {
    const renderToString = vi.fn(() => {
      throw new Error('katex parse error');
    });
    setGlobal('katex', { renderToString });

    const { container } = render(<KloelMarkdown content={'Inline $E = mc^2$ aqui.'} />);

    // Give the async loader a tick; it should keep the built-in fallback.
    await waitFor(() => {
      expect(container.querySelector('.kloel-math-inline')).not.toBeNull();
    });
    // Not upgraded to KaTeX, but the built-in renderer still produced c² (superscript).
    expect(container.querySelector('.kloel-math-inline[data-katex="true"]')).toBeNull();
    expect(container.querySelector('.kloel-math-inline')?.textContent).toContain('²');
  });

  it('renders a mermaid graph via real mermaid.render when the CDN global is present', async () => {
    const initialize = vi.fn();
    const render_ = vi.fn(async (id: string, _text: string) => ({
      svg: `<svg data-mermaid-id="${id}" xmlns="http://www.w3.org/2000/svg"><rect/><g class="node"><text>RealNode</text></g></svg>`,
    }));
    const mermaid: MermaidApi = { initialize, render: render_ };
    setGlobal('mermaid', mermaid);

    const content = ['```mermaid', 'graph TD', 'A[Início] --> B[Fim]', '```'].join('\n');
    const { container } = render(<KloelMarkdown content={content} />);

    await waitFor(() => {
      expect(
        container.querySelector('.kloel-artifact-mermaid[data-mermaid="cdn"]'),
      ).not.toBeNull();
    });
    // Output came from the real mermaid mock, not the built-in geometry.
    expect(container.querySelector('.kloel-artifact-mermaid svg')?.textContent).toContain(
      'RealNode',
    );
    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({ startOnLoad: false, securityLevel: 'strict' }),
    );
    expect(render_).toHaveBeenCalled();
  });

  it('renders an otherwise-unsupported diagram type via real mermaid', async () => {
    const render_ = vi.fn(async () => ({
      svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>Sequence!</text></svg>',
    }));
    setGlobal('mermaid', { initialize: vi.fn(), render: render_ });

    const content = ['```mermaid', 'sequenceDiagram', 'Alice->>Bob: Oi', '```'].join('\n');
    const { container } = render(<KloelMarkdown content={content} />);

    await waitFor(() => {
      expect(
        container.querySelector('.kloel-artifact-mermaid[data-mermaid="cdn"]'),
      ).not.toBeNull();
    });
    // Real mermaid handles sequence diagrams → no source-block fallback.
    expect(container.querySelector('.kloel-artifact-mermaid-fallback')).toBeNull();
    expect(container.querySelector('.kloel-artifact-mermaid svg')?.textContent).toContain(
      'Sequence!',
    );
  });

  it('keeps the built-in mermaid fallback when real mermaid.render rejects', async () => {
    const render_ = vi.fn(async () => {
      throw new Error('mermaid syntax error');
    });
    setGlobal('mermaid', { initialize: vi.fn(), render: render_ });

    const content = ['```mermaid', 'graph TD', 'A[Início] --> B[Fim]', '```'].join('\n');
    const { container } = render(<KloelMarkdown content={content} />);

    // Built-in geometry still renders (real mermaid failed → graceful fallback).
    await waitFor(() => {
      expect(container.querySelector('.kloel-artifact-mermaid svg')).not.toBeNull();
    });
    expect(
      container.querySelector('.kloel-artifact-mermaid[data-mermaid="cdn"]'),
    ).toBeNull();
    expect(container.querySelector('.kloel-artifact-mermaid svg')?.textContent).toContain(
      'Início',
    );
  });
});
