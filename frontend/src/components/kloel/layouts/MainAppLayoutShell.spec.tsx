import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/script', () => ({
  default: () => null,
}));

vi.mock('@/components/kloel/PulseFrontendHeartbeat', () => ({
  PulseFrontendHeartbeat: () => null,
}));

vi.mock('@/components/kloel/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => (
    <div data-testid="legacy-app-shell">{children}</div>
  ),
}));

vi.mock('@/components/kloel/graph/KloelGraphShell', () => ({
  KloelGraphShell: ({ children }: { children: ReactNode }) => (
    <div data-testid="kloel-graph-app-shell">{children}</div>
  ),
}));

import { MainAppLayoutShell } from './MainAppLayoutShell';

afterEach(() => {
  cleanup();
  delete process.env.NEXT_PUBLIC_KLOEL_GRAPH_ENABLED;
});

describe('MainAppLayoutShell graph rollout', () => {
  it('keeps the legacy AppShell when the graph flag is disabled', () => {
    render(
      <MainAppLayoutShell>
        <div>Legacy route</div>
      </MainAppLayoutShell>,
    );

    expect(screen.getByTestId('legacy-app-shell')).toHaveTextContent('Legacy route');
    expect(screen.queryByTestId('kloel-graph-app-shell')).toBeNull();
  });

  it('mounts the KloelGraph shell when the graph flag is enabled', () => {
    process.env.NEXT_PUBLIC_KLOEL_GRAPH_ENABLED = 'true';

    render(
      <MainAppLayoutShell>
        <div>Graph route</div>
      </MainAppLayoutShell>,
    );

    expect(screen.getByTestId('kloel-graph-app-shell')).toHaveTextContent('Graph route');
    expect(screen.queryByTestId('legacy-app-shell')).toBeNull();
  });
});
