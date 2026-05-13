import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SetupSteps } from './OfficialMarketingChannelPage/SetupSteps';

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

function renderSetupSteps(step = 0) {
  return render(
    <SetupSteps
      currentStep={step}
      setupLoaded={true}
      channel="whatsapp"
      onStepClick={vi.fn()}
    />,
  );
}

describe('SetupSteps responsive', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  describe('mobile viewport (below 640px)', () => {
    it('renders 2-column grid', () => {
      mockMatchMedia(true);
      const { container } = renderSetupSteps();

      const ol = container.querySelector('ol');
      expect(ol).not.toBeNull();
      const style = (ol as HTMLElement).style;
      expect(style.gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))');
    });

    it('digit "1" container is 32x32 and visible', () => {
      mockMatchMedia(true);
      renderSetupSteps();

      const digit = screen.getByText('1') as HTMLSpanElement;
      expect(digit).toBeDefined();
      expect(digit.style.width).toBe('32px');
      expect(digit.style.height).toBe('32px');
      expect(digit.style.flexShrink).toBe('0');
    });

    it('all four digit numbers render', () => {
      mockMatchMedia(true);
      renderSetupSteps();

      for (let i = 1; i <= 4; i++) {
        expect(screen.getByText(String(i))).toBeDefined();
      }
    });

    it('step labels use 14px font-size', () => {
      mockMatchMedia(true);
      renderSetupSteps();

      const stepLabel = screen.getByText('Conexão') as HTMLSpanElement;
      expect(stepLabel.style.fontSize).toBe('14px');
    });

    it('button minHeight is 72px', () => {
      mockMatchMedia(true);
      renderSetupSteps();

      const buttons = screen.getAllByRole('button');
      for (const btn of buttons) {
        expect(btn.style.minHeight).toBe('72px');
      }
    });

    it('li has no minWidth constraint', () => {
      mockMatchMedia(true);
      const { container } = renderSetupSteps();

      const li = container.querySelector('li');
      expect(li?.style.minWidth).toBe('0px');
    });
  });

  describe('desktop viewport (above 640px)', () => {
    it('renders 4-column grid', () => {
      mockMatchMedia(false);
      const { container } = renderSetupSteps();

      const ol = container.querySelector('ol');
      expect(ol).not.toBeNull();
      const style = (ol as HTMLElement).style;
      expect(style.gridTemplateColumns).toBe('repeat(4, minmax(0, 1fr))');
    });

    it('step labels use 16px font-size', () => {
      mockMatchMedia(false);
      renderSetupSteps();

      const stepLabel = screen.getByText('Conexão') as HTMLSpanElement;
      expect(stepLabel.style.fontSize).toBe('16px');
    });

    it('li has minWidth 170px', () => {
      mockMatchMedia(false);
      const { container } = renderSetupSteps();

      const li = container.querySelector('li');
      expect(li?.style.minWidth).toBe('170px');
    });
  });
});
