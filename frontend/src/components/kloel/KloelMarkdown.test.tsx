import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KloelMarkdown } from './KloelMarkdown';

describe('KloelMarkdown render parity', () => {
  it('renders standard GFM markdown (headings, bold, lists)', () => {
    const { container } = render(
      <KloelMarkdown content={'## Título\n\n- **Item um**\n- Item dois'} />,
    );
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Título');
    expect(container.querySelector('strong')).toHaveTextContent('Item um');
    expect(container.querySelectorAll('li')).toHaveLength(2);
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
  });

  describe('Mermaid (b)', () => {
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

    it('strips <script> from the html artifact before sandboxing', async () => {
      const content = [
        '```html',
        '<div>safe</div><script>window.__pwned = 1</script>',
        '```',
      ].join('\n');
      const { container } = render(<KloelMarkdown content={content} />);
      await waitFor(() => {
        expect(container.querySelector('iframe.kloel-artifact-html')).not.toBeNull();
      });
      const srcdoc = container.querySelector('iframe.kloel-artifact-html')?.getAttribute('srcdoc');
      expect(srcdoc).not.toContain('<script>');
      expect(srcdoc).toContain('safe');
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
});
