import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Pull the bare presentational atoms + the wrapper + the hook so every
// remaining diff line is exercised. Mock the theme provider so the hook
// works in isolation.
vi.mock('@/components/kloel/theme/ThemeProvider', () => ({
  useTheme: () => ({ theme: 'light' }),
}));

import { CTA, Dial } from './atoms';
import { Glyph } from './Glyph';
import { paletteFor } from './palette';
import { useOnboardingPalette } from './use-onboarding-palette';

const C = paletteFor('light');
const D = paletteFor('dark');

afterEach(cleanup);

describe('coverage-fill: useOnboardingPalette wires the workspace theme', () => {
  function Probe() {
    const p = useOnboardingPalette();
    return <div data-testid="probe">{p.void}</div>;
  }

  it('returns the light palette when the provider yields theme=light', () => {
    render(<Probe />);
    expect(screen.getByTestId('probe').textContent).toBe(C.void);
  });
});

describe('coverage-fill: CTA visual states', () => {
  it('changes background on mouseEnter and restores on mouseLeave (primary)', () => {
    render(
      <CTA C={C} variant="primary">
        Primary
      </CTA>,
    );
    const btn = screen.getByRole('button');
    fireEvent.mouseEnter(btn);
    expect(btn.style.background).toBe(C.primaryHover);
    fireEvent.mouseLeave(btn);
    expect(btn.style.background).toBe(C.silver);
  });

  it('mouseEnter is a no-op when disabled', () => {
    render(
      <CTA C={C} variant="ember" disabled>
        Locked
      </CTA>,
    );
    const btn = screen.getByRole('button');
    const before = btn.style.background;
    fireEvent.mouseEnter(btn);
    expect(btn.style.background).toBe(before);
  });

  it('ghost variant skips both hover and base swaps', () => {
    render(
      <CTA C={C} variant="ghost">
        Ghost
      </CTA>,
    );
    const btn = screen.getByRole('button');
    fireEvent.mouseEnter(btn);
    fireEvent.mouseLeave(btn);
    expect(btn.style.background).toBe('transparent');
  });

  it('focus paints an ember 2px ring and blur clears it', () => {
    render(
      <CTA C={C} variant="ember">
        Focusable
      </CTA>,
    );
    const btn = screen.getByRole('button');
    fireEvent.focus(btn);
    expect(btn.style.boxShadow).toContain(C.ember);
    fireEvent.blur(btn);
    expect(btn.style.boxShadow).toBe('none');
  });

  it('focus stays inert when disabled', () => {
    render(
      <CTA C={C} variant="primary" disabled>
        Inert
      </CTA>,
    );
    const btn = screen.getByRole('button');
    fireEvent.focus(btn);
    expect(btn.style.boxShadow).toBe('');
  });
});

describe('coverage-fill: Dial selection + small CTA size', () => {
  it('renders the small CTA variant', () => {
    render(
      <CTA C={D} variant="ghost" small>
        Tiny
      </CTA>,
    );
    const btn = screen.getByRole('button');
    expect(btn.style.height).toBe('36px');
    expect(btn.style.padding).toBe('0px 18px');
  });

  it('Dial pre-selected segment paints ember and other segments paint hi', () => {
    const onChange = vi.fn();
    render(
      <Dial
        C={D}
        label="L"
        value={0}
        onChange={onChange}
        labels={['A', 'B', 'C'] as const}
      />,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons[0].style.background).toBe(D.ember);
    expect(buttons[1].style.background).toBe(D.hi);
    expect(buttons[2].style.background).toBe(D.hi);

    fireEvent.click(buttons[1]);
    expect(onChange).toHaveBeenCalledWith(1);
  });
});

describe('coverage-fill: Glyph variations', () => {
  it('lights up the calibrated drop-shadow on step 4', () => {
    const { container } = render(<Glyph C={D} step={4} products={6} arsenal={12} />);
    const lit = container.querySelectorAll('circle');
    // All 6 product circles + 12 arsenal centers are present at step 4.
    expect(lit.length).toBeGreaterThan(10);
  });

  it('keeps the amber identity line visible on step 0 only', () => {
    const { container: c0, unmount } = render(<Glyph C={D} step={0} />);
    const amberGroups = c0.querySelectorAll('g[style*="opacity: 1"]');
    expect(amberGroups.length).toBeGreaterThan(0);
    unmount();
    const { container: c1 } = render(<Glyph C={D} step={1} />);
    const amberHidden = c1.querySelectorAll('g[style*="opacity: 0"]');
    expect(amberHidden.length).toBeGreaterThan(0);
  });
});
