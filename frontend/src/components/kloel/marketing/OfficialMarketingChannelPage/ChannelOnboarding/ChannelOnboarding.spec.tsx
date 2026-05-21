import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  paletteFor,
  PILL_RADIUS,
  CHANNEL_COPY,
  TONE_LABELS,
  EDGE_LABELS,
  TONE_VALUES,
  EDGE_VALUES,
  toneIndex,
  edgeIndex,
} from './palette';
import { CTA, Chip, Dial, StepBar, Vinheta, Arrow, Back } from './atoms';
import { Glyph } from './Glyph';
import { StepConnect, StepProducts, StepArsenal, StepVoice, Done } from './steps';

const D = paletteFor('dark');
const L = paletteFor('light');

afterEach(cleanup);

describe('palette (spec §11/§12)', () => {
  it('dark and light are distinct, ember constant, 999 pill radius', () => {
    expect(D.void).not.toBe(L.void);
    expect(D.ember).toBe('rgb(232, 93, 48)');
    expect(L.ember).toBe('rgb(232, 93, 48)');
    expect(PILL_RADIUS).toBe(999);
    expect(D.flowerOpacity).toBe(0.22);
    expect(L.flowerOpacity).toBe(0.45);
  });

  it('palette values never use hex notation (visual-contract safe)', () => {
    for (const v of Object.values(D)) {
      if (typeof v === 'string') {
        expect(v.includes('#')).toBe(false);
      }
    }
  });

  it('tone/edge indices map values and default to the middle', () => {
    expect(toneIndex(TONE_VALUES[0])).toBe(0);
    expect(toneIndex(TONE_VALUES[2])).toBe(2);
    expect(toneIndex('consultivo')).toBe(1);
    expect(edgeIndex(EDGE_VALUES[0])).toBe(0);
    expect(edgeIndex('moderado')).toBe(1);
    expect(TONE_LABELS).toHaveLength(3);
    expect(EDGE_LABELS).toHaveLength(3);
  });

  it('every channel has the four textual elements (spec §10)', () => {
    for (const key of ['whatsapp', 'instagram', 'tiktok', 'facebook', 'email'] as const) {
      const c = CHANNEL_COPY[key];
      expect(c.provider).toBe(c.provider.toUpperCase());
      expect(c.provider.length).toBeGreaterThan(0);
      expect(c.sub).toBe(c.sub.toUpperCase());
      expect(c.sub.length).toBeGreaterThan(0);
      expect(c.verb.length).toBeGreaterThan(0);
      expect(c.awakeName).not.toBe(c.awakeName.toUpperCase());
    }
  });
});

describe('atoms', () => {
  it('CTA fires onClick and respects disabled', () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <CTA C={D} onClick={onClick}>
        Go
      </CTA>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(
      <CTA C={D} onClick={onClick} disabled>
        Go
      </CTA>,
    );
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('Dial renders one button per label and selects on click', () => {
    const onChange = vi.fn();
    render(<Dial C={D} label="Temperatura" value={1} onChange={onChange} labels={TONE_LABELS} />);
    const btns = screen.getAllByRole('button');
    expect(btns).toHaveLength(TONE_LABELS.length);
    fireEvent.click(btns[2]);
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('Chip / Vinheta / icons render', () => {
    render(<Chip C={D}>META BUSINESS</Chip>);
    expect(screen.getByText('META BUSINESS')).toBeTruthy();
    const { container } = render(
      <Vinheta C={L} head={<>Head</>} sub="SUB" action={<span>act</span>} />,
    );
    expect(container.textContent).toContain('Head');
    expect(container.textContent).toContain('SUB');
    render(
      <span>
        <Arrow />
        <Back />
      </span>,
    );
  });

  it('StepBar lights completed+current traces only', () => {
    const { container } = render(<StepBar step={2} C={D} />);
    const traces = Array.from(
      (container.firstElementChild as HTMLElement).children,
    ) as HTMLElement[];
    expect(traces).toHaveLength(4);
    expect(traces[0].style.background).toBe(D.ember);
    expect(traces[2].style.background).toBe(D.ember);
    expect(traces[3].style.background).toBe(D.inactiveTrace);
  });
});

describe('Glyph (spec §6)', () => {
  it('renders a 300x300 svg and evolves layers per step', () => {
    const { container, rerender } = render(<Glyph C={D} step={0} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('300');
    expect(svg?.getAttribute('height')).toBe('300');
    // dormant core at step 0, awakened pulse at step 4
    rerender(<Glyph C={D} step={4} products={6} arsenal={12} />);
    expect(container.querySelector('svg')).toBeTruthy();
  });
});

describe('step vignettes wired by props', () => {
  it('StepConnect shows the per-channel sub line + verb and connects', () => {
    const onConnect = vi.fn();
    render(
      <StepConnect
        C={D}
        sub="LOGIN META · OAUTH OFICIAL"
        verb="Vincular número"
        busy={false}
        onConnect={onConnect}
      />,
    );
    expect(screen.getByText('LOGIN META · OAUTH OFICIAL')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Vincular número/ }));
    expect(onConnect).toHaveBeenCalled();
  });

  it('StepProducts toggles, blocks advance when empty, shows price', () => {
    const onToggle = vi.fn();
    const onContinue = vi.fn();
    const products = [
      { id: 'p1', name: 'Alpha', price: 197 },
      { id: 'p2', name: 'Beta', price: null },
    ];
    const { rerender } = render(
      <StepProducts
        C={D}
        products={products}
        picked={[]}
        onToggle={onToggle}
        onBack={vi.fn()}
        onContinue={onContinue}
      />,
    );
    expect(screen.getByText(/R\$\s*197/)).toBeTruthy();
    const advance = screen.getByRole('button', { name: /Avançar/ });
    expect(advance).toBeDisabled();
    fireEvent.click(screen.getByText('Alpha'));
    expect(onToggle).toHaveBeenCalledWith('p1');
    rerender(
      <StepProducts
        C={D}
        products={products}
        picked={['p1']}
        onToggle={onToggle}
        onBack={vi.fn()}
        onContinue={onContinue}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Avançar/ }));
    expect(onContinue).toHaveBeenCalled();
  });

  it('StepProducts shows honest empty state', () => {
    render(
      <StepProducts
        C={L}
        products={[]}
        picked={[]}
        onToggle={vi.fn()}
        onBack={vi.fn()}
        onContinue={vi.fn()}
      />,
    );
    expect(screen.getByText(/Nenhum produto no catálogo ainda/i)).toBeTruthy();
  });

  it('StepArsenal reports count and forwards picked files', () => {
    const onAddFiles = vi.fn();
    const { container, rerender } = render(
      <StepArsenal
        C={D}
        count={0}
        onAddFiles={onAddFiles}
        onBack={vi.fn()}
        onContinue={vi.fn()}
      />,
    );
    expect(screen.getByText(/Pular esta camada/)).toBeTruthy();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'proof.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onAddFiles).toHaveBeenCalled();
    rerender(
      <StepArsenal
        C={D}
        count={2}
        onAddFiles={onAddFiles}
        onBack={vi.fn()}
        onContinue={vi.fn()}
      />,
    );
    expect(screen.getByText(/2 provas carregadas/)).toBeTruthy();
  });

  it('StepVoice exposes both dials and awakens', () => {
    const onActivate = vi.fn();
    const onToneChange = vi.fn();
    render(
      <StepVoice
        C={D}
        tone={1}
        edge={1}
        onToneChange={onToneChange}
        onEdgeChange={vi.fn()}
        onBack={vi.fn()}
        onActivate={onActivate}
        activating={false}
      />,
    );
    expect(screen.getByText('Temperatura')).toBeTruthy();
    expect(screen.getByText('Postura')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Despertar/ }));
    expect(onActivate).toHaveBeenCalled();
  });

  it('Done shows "<channel> acordou" and resets', () => {
    const onReset = vi.fn();
    const { container } = render(<Done C={D} awakeName="WhatsApp" onReset={onReset} />);
    expect(container.textContent).toContain('WhatsApp');
    expect(container.textContent).toContain('acordou');
    fireEvent.click(screen.getByRole('button', { name: /Recomeçar/ }));
    expect(onReset).toHaveBeenCalled();
  });
});
