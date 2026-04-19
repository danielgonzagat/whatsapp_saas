import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KloelChatBubble } from './KloelChatBubble';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={typeof href === 'string' ? href : '#'} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/api', () => ({
  tokenStorage: {
    getToken: () => null,
    getWorkspaceId: () => null,
  },
}));

vi.mock('@/lib/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/http')>();
  return {
    ...actual,
    API_BASE: 'http://localhost:3001',
    apiUrl: (path: string) => path,
  };
});

vi.mock('@/lib/kloel-conversations', () => ({
  loadKloelThreadMessages: vi.fn(),
  sendAuthenticatedKloelMessage: vi.fn(),
}));

vi.mock('@/lib/kloel-dashboard-context', () => ({
  buildDashboardContextMetadata: vi.fn(),
  buildDashboardHref: vi.fn(() => '/dashboard'),
}));

describe('KloelChatBubble visitor sync chat', () => {
  const fetchMock = vi.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    sessionStorage.clear();
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    sessionStorage.clear();
    global.fetch = originalFetch;
  });

  it('uses /chat/visitor/sync with the persisted visitor session id', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        reply: 'Posso te ajudar com isso.',
        sessionId: 'visitor_server_session',
      }),
    });

    const { container } = render(
      <KloelChatBubble enabled delay={0} productName="Kloel Pro" planId="plan_123" />,
    );

    await waitFor(() => {
      expect(container.querySelector('button')).not.toBeNull();
    });

    fireEvent.click(container.querySelector('button')!);
    fireEvent.change(screen.getByPlaceholderText('Digite sua duvida...'), {
      target: { value: 'Quero saber mais' },
    });
    fireEvent.keyDown(screen.getByPlaceholderText('Digite sua duvida...'), {
      key: 'Enter',
      code: 'Enter',
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(requestInit.body));

    expect(requestUrl).toBe('/chat/visitor/sync');
    expect(String(requestInit.headers && (requestInit.headers as Record<string, string>)['X-Session-Id'])).toMatch(
      /^visitor_\d+_[a-f0-9-]+$/i,
    );
    expect(payload).toMatchObject({
      message: 'Quero saber mais',
      sessionId: expect.stringMatching(/^visitor_\d+_[a-f0-9-]+$/i),
    });

    await waitFor(() => {
      expect(screen.getByText('Posso te ajudar com isso.')).toBeInTheDocument();
    });

    expect(
      sessionStorage.getItem('kloel:checkout-chat:plan_123:visitor-session'),
    ).toBe('visitor_server_session');
  });
});
