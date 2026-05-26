import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ConversationalOnboardingPage from './page';

// ── Mocks ──────────────────────────────────────────────

const mockRouterPush = vi.fn();
const mockSearchParamsGet = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
  useSearchParams: () => ({ get: mockSearchParamsGet }),
  usePathname: () => '/onboarding-chat',
}));

let mockAuthState: {
  isAuthenticated: boolean;
  isLoading: boolean;
  workspace: { id: string; name: string } | null;
  userName: string | null;
  userEmail: string | null;
} = {
  isAuthenticated: false,
  isLoading: false,
  workspace: null,
  userName: null,
  userEmail: null,
};

vi.mock('@/components/kloel/auth/auth-provider', () => ({
  useAuth: () => mockAuthState,
}));

vi.mock('@/lib/api', () => ({
  tokenStorage: {
    getToken: () => 'test-token',
  },
}));

vi.mock('@/lib/api/onboarding', () => ({
  onboardingApi: {
    getOnboardingStatus: vi.fn().mockResolvedValue({
      data: { completed: false, messagesCount: 1 },
    }),
  },
}));

vi.mock('swr', () => ({
  mutate: vi.fn(),
  default: vi.fn(),
}));

// ── Helpers ────────────────────────────────────────────

function setAuthenticated(workspaceId = 'ws-1', name = 'Test User') {
  mockAuthState = {
    isAuthenticated: true,
    isLoading: false,
    workspace: { id: workspaceId, name: 'Test WS' },
    userName: name,
    userEmail: 'test@example.com',
  };
}

function setUnauthenticated() {
  mockAuthState = {
    isAuthenticated: false,
    isLoading: false,
    workspace: null,
    userName: null,
    userEmail: null,
  };
}

describe('ConversationalOnboardingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setUnauthenticated();
    mockSearchParamsGet.mockReturnValue(null);
    // Default fetch: always succeeds with empty response
    (global.fetch as ReturnType<typeof vi.fn>) = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders OnboardingChatHero when user is unauthenticated', async () => {
    render(<ConversationalOnboardingPage />);

    // Wait for Suspense to resolve and auth to be checked
    await waitFor(() => {
      expect(screen.getByText('Sua conta Kloel em uma conversa')).toBeInTheDocument();
    });

    // CTA link should be present
    expect(screen.getByText('Entrar para começar')).toBeInTheDocument();

    // Selling points should be visible
    expect(screen.getByText('IA que conversa de verdade')).toBeInTheDocument();
    expect(screen.getByText('Pronto em minutos')).toBeInTheDocument();
    expect(screen.getByText('Venda pelo WhatsApp')).toBeInTheDocument();
  });

  it('triggers chat start flow when authenticated with workspace', async () => {
    // Mock fetch to return a welcome message
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ message: 'Olá! Vamos configurar sua conta?' }),
    });

    setAuthenticated('ws-123');

    render(<ConversationalOnboardingPage />);

    // Wait for the onboarding start call to resolve and the welcome message to appear
    await waitFor(
      () => {
        expect(screen.getByText('Olá! Vamos configurar sua conta?')).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    // Verify the user info is shown in header
    expect(screen.getByText('Test User')).toBeInTheDocument();
  });

  it('renders error boundary state on SSE stream failure', async () => {
    setAuthenticated('ws-456');

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ message: 'Vamos começar!' }),
    });

    render(<ConversationalOnboardingPage />);

    // Wait for start to resolve
    await waitFor(() => {
      expect(screen.getByText('Vamos começar!')).toBeInTheDocument();
    });

    // Now type a message and send — the SSE fetch will fail
    const input = screen.getByPlaceholderText('Digite sua mensagem...');
    fireEvent.change(input, { target: { value: 'test message' } });

    // Mock the fetch to reject for the send call
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('SSE connection failed'));

    // Find the send button (the one with Send icon)
    const buttons = screen.getAllByRole('button');
    // The last button should be the send button
    const sendBtn = buttons[buttons.length - 1];
    fireEvent.click(sendBtn);

    // After the error, the catch block adds an error message
    await waitFor(() => {
      expect(screen.getByText('Desculpe, tive um problema. Pode repetir?')).toBeInTheDocument();
    });
  });
});
