import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ThanosSection from '../ThanosSection';
import { THANOS_STYLES } from '../thanos-section.const';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={typeof href === 'string' ? href : '#'} {...props}>
      {children}
    </a>
  ),
}));

function mockReducedMotion(matches = true) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches,
      media: '(prefers-reduced-motion: reduce)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

function mockIntersectionObserver() {
  class MockIntersectionObserver {
    constructor(private readonly callback: IntersectionObserverCallback) {}
    observe() {
      this.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      );
    }
    disconnect() {}
  }
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
}

function mockInstantImages() {
  class MockImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    decoding = '';
    set src(_value: string) {
      Promise.resolve().then(() => this.onload?.());
    }
  }
  vi.stubGlobal('Image', MockImage);
}

function mockAnimationFrame() {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 0),
  );
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => window.clearTimeout(handle));
}

function mockCanvas() {
  const data = new Uint8ClampedArray(240 * 160 * 4);
  const context = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ data })),
    createImageData: vi.fn((width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
    })),
    putImageData: vi.fn(),
  };

  Object.defineProperty(HTMLCanvasElement.prototype, 'offsetWidth', {
    configurable: true,
    value: 240,
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'offsetHeight', {
    configurable: true,
    value: 160,
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  return context;
}

async function flushReactEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function flushAnimatedReveal() {
  await flushReactEffects();
  await act(async () => {
    vi.advanceTimersByTime(3000);
  });
  await flushReactEffects();
  await act(async () => {
    vi.advanceTimersByTime(1);
  });
  await flushReactEffects();
  await act(async () => {
    vi.advanceTimersByTime(500);
  });
  await flushReactEffects();
  await act(async () => {
    vi.advanceTimersByTime(800);
  });
  await flushReactEffects();
}

describe('ThanosSection', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('static render', () => {
    it('renders the reveal text under reduced motion', () => {
      mockReducedMotion(true);

      render(<ThanosSection />);

      expect(screen.getByText('O Kloel escala.')).toBeInTheDocument();
    });

    it('keeps the canvas hidden under reduced motion', () => {
      mockReducedMotion(true);

      const { container } = render(<ThanosSection />);

      expect(container.querySelector('canvas')).toHaveStyle({ opacity: '0' });
    });
  });

  describe('animated render', () => {
    it('reveals the omnichannel grid after the canvas dust cycle', async () => {
      vi.useFakeTimers();
      mockReducedMotion(false);
      mockIntersectionObserver();
      mockInstantImages();
      mockAnimationFrame();
      const context = mockCanvas();

      render(<ThanosSection />);
      await flushAnimatedReveal();

      expect(context.drawImage).toHaveBeenCalled();
      expect(screen.getByText('O Kloel escala.')).toBeInTheDocument();
      expect(screen.getByText('WhatsApp')).toBeInTheDocument();
    });
  });

  describe('thanos dust CSS', () => {
    it('does not contain the legacy fade-scale-blur exit keyframe', () => {
      expect(THANOS_STYLES).not.toContain('transform:translate3d(var(--x,0),-34px,0) scale(.62)');
      expect(THANOS_STYLES).not.toContain('filter:blur(1px)');
      expect(THANOS_STYLES).not.toContain('@keyframes thanosIconExit');
    });

    it('keeps icon spans visible during dusting so particles emerge from them', () => {
      expect(THANOS_STYLES).not.toContain('.thanos-icons--dusting span{visibility:hidden}');
      expect(THANOS_STYLES).not.toContain(
        '.thanos-icons--dusting span,.thanos-icons--exit span{visibility:hidden}',
      );
    });

    it('hides icon spans on exit after dusting completes', () => {
      expect(THANOS_STYLES).toContain('.thanos-icons--exit span{visibility:hidden}');
    });

    it('preserves the thanosIn entrance keyframe for reveal text', () => {
      expect(THANOS_STYLES).toContain('@keyframes thanosIn');
    });

    it('preserves reduced-motion override that hides icons entirely', () => {
      expect(THANOS_STYLES).toContain('@media(prefers-reduced-motion:reduce)');
      expect(THANOS_STYLES).toContain('.thanos-icons{display:none}');
    });

    it('preserves contain:layout paint for performance', () => {
      expect(THANOS_STYLES).toContain('contain:layout paint');
    });
  });
});
