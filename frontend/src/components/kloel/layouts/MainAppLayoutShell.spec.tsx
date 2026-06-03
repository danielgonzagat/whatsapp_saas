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

// The canonical surface is the owner-authored KloelGraph prototype, mounted via
// KloelGraphClient. It is self-contained (renders its own full-screen graph, not
// the route children), so the mock is a childless marker — matching real behavior.
vi.mock('@/components/kloel/graph/KloelGraphClient', () => ({
  KloelGraphClient: () => <div data-testid="kloel-graph-app-shell" />,
}));

import { MainAppLayoutShell } from './MainAppLayoutShell';

afterEach(() => {
  cleanup();
  delete process.env.NEXT_PUBLIC_KLOEL_GRAPH_ENABLED;
  delete process.env.KLOEL_GRAPH_ENABLED;
});

describe('MainAppLayoutShell graph rollout', () => {
  it('mounts the KloelGraph prototype by default so the app is graph-first', () => {
    render(
      <MainAppLayoutShell>
        <div>Graph route</div>
      </MainAppLayoutShell>,
    );

    expect(screen.getByTestId('kloel-graph-app-shell')).toBeTruthy();
    expect(screen.queryByTestId('legacy-app-shell')).toBeNull();
  });

  it('keeps the legacy AppShell only for an explicit rollback flag', () => {
    process.env.NEXT_PUBLIC_KLOEL_GRAPH_ENABLED = 'false';

    render(
      <MainAppLayoutShell>
        <div>Legacy route</div>
      </MainAppLayoutShell>,
    );

    expect(screen.getByTestId('legacy-app-shell')).toHaveTextContent('Legacy route');
    expect(screen.queryByTestId('kloel-graph-app-shell')).toBeNull();
  });

  it('keeps mounting the KloelGraph prototype when the graph flag is explicitly enabled', () => {
    process.env.NEXT_PUBLIC_KLOEL_GRAPH_ENABLED = 'true';

    render(
      <MainAppLayoutShell>
        <div>Graph route</div>
      </MainAppLayoutShell>,
    );

    expect(screen.getByTestId('kloel-graph-app-shell')).toBeTruthy();
    expect(screen.queryByTestId('legacy-app-shell')).toBeNull();
  });
});
