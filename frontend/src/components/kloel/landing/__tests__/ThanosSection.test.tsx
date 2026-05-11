import { cleanup, render, screen } from '@testing-library/react';
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

describe('ThanosSection', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
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

  describe('thanos dust CSS', () => {
    it('does not contain the legacy fade-scale-blur exit keyframe', () => {
      expect(THANOS_STYLES).not.toContain('transform:translate3d(var(--x,0),-34px,0) scale(.62)');
      expect(THANOS_STYLES).not.toContain('filter:blur(1px)');
      expect(THANOS_STYLES).not.toContain('@keyframes thanosIconExit');
    });

    it('keeps icon spans visible during dusting so particles emerge from them', () => {
      expect(THANOS_STYLES).not.toContain('.thanos-icons--dusting span{visibility:hidden}');
      expect(THANOS_STYLES).not.toContain('.thanos-icons--dusting span,.thanos-icons--exit span{visibility:hidden}');
    });

    it('hides icon spans on exit after dusting completes', () => {
      expect(THANOS_STYLES).toContain(
        '.thanos-icons--exit span{visibility:hidden}',
      );
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
