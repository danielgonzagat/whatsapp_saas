import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StepBar } from './OfficialMarketingChannelPage/ChannelOnboarding/atoms';
import { paletteFor } from './OfficialMarketingChannelPage/ChannelOnboarding/palette';

/**
 * The Marketing spec (§5) retired the numbered, grid-based stepper. The
 * canonical screen now uses {@link StepBar} — four abstract traces, viewport
 * independent (the screen's responsiveness lives in its column padding, not
 * in the bar). These assertions are grounded directly in spec §5.
 */
function mockMatchMedia(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches,
      media: '(max-width: 639px)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

const C = paletteFor('dark');

function renderStepBar(step: number) {
  return render(<StepBar step={step} C={C} />);
}

/** The StepBar root is the container's first element; its children are the traces. */
function traceEls(container: HTMLElement): HTMLElement[] {
  const root = container.firstElementChild as HTMLElement | null;
  return root ? (Array.from(root.children) as HTMLElement[]) : [];
}

describe('Channel onboarding step bar (spec §5)', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders exactly four abstract traces, each 28x2px', () => {
    const { container } = renderStepBar(0);
    const traces = traceEls(container);
    expect(traces).toHaveLength(4);
    traces.forEach((trace) => {
      expect(trace.style.width).toBe('28px');
      expect(trace.style.height).toBe('2px');
    });
  });

  it('renders no numbers and no list semantics (not a numbered stepper)', () => {
    const { container } = renderStepBar(2);
    expect(container.querySelector('ol')).toBeNull();
    expect(container.querySelector('li')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('colours completed and current traces ember, future traces neutral', () => {
    const { container } = renderStepBar(1);
    const traces = traceEls(container);
    // step 1 → traces 0 and 1 lit (ember), 2 and 3 dormant (hi).
    expect(traces[0].style.background).toBe(C.ember);
    expect(traces[1].style.background).toBe(C.ember);
    expect(traces[2].style.background).toBe(C.hi);
    expect(traces[3].style.background).toBe(C.hi);
  });

  it('is viewport independent — identical structure on mobile and desktop', () => {
    mockMatchMedia(true);
    const mobile = renderStepBar(2);
    const mobileHtml = mobile.container.innerHTML;
    cleanup();

    mockMatchMedia(false);
    const desktop = renderStepBar(2);
    expect(desktop.container.innerHTML).toBe(mobileHtml);
  });
});
