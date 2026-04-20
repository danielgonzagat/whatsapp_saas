'use client';

import { kloelError } from '@/lib/i18n/t';
import {
  clearGuestWorkspaceClaimCandidate,
  getGuestWorkspaceClaimCandidate,
  rememberGuestWorkspaceClaimCandidate,
} from '@/lib/anonymous-session';
import {
  authApi,
  billingApi,
  resolveWorkspaceFromAuthPayload,
  tokenStorage,
  whatsappApi,
} from '@/lib/api';
import {
  decodeKloelJwtPayload,
  isAnonymousKloelPayload,
  isAnonymousKloelToken,
} from '@/lib/auth-identity';
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

interface User {
  id: string;
  email: string;
  name: string;
}

interface Workspace {
  id: string;
  name: string;
}

interface Subscription {
  status: 'none' | 'trial' | 'active' | 'expired' | 'suspended';
  trialDaysLeft: number;
  creditsBalance: number;
  plan?: string;
}

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  justSignedUp: boolean;
  hasCompletedOnboarding: boolean;
  user: User | null;
  workspace: Workspace | null;
  subscription: Subscription;
}

interface AuthContextType extends AuthState {
  userName: string | null;
  userEmail: string | null;
  signUp: (
    email: string,
    name: string,
    password: string,
  ) => Promise<{ success: boolean; error?: string }>;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signInWithGoogle: (credential: string) => Promise<{ success: boolean; error?: string }>;
  signInWithFacebook: (
    accessToken: string,
    userId?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  requestMagicLink: (
    email: string,
    redirectTo?: string,
  ) => Promise<{ success: boolean; error?: string; message?: string }>;
  signOut: () => Promise<void>;
  completeOnboarding: () => void;
  dismissOnboardingForSession: () => void;
  refreshSubscription: () => Promise<void>;
  openAuthModal: (mode?: 'signup' | 'login') => void;
  closeAuthModal: () => void;
  authModalOpen: boolean;
  authModalMode: 'signup' | 'login';
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ONBOARDING_KEY = 'kloel_onboarding_completed';

function isUnauthorizedStatus(status?: number): boolean {
  return status === 401 || status === 403;
}

function logAuthBootstrapIssue(message: string, detail?: unknown) {
  if (process.env.NODE_ENV !== 'development') {
    return;
  }
  console.warn(message, detail);
}

/** Auth provider. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    justSignedUp: false,
    hasCompletedOnboarding: false,
    user: null,
    workspace: null,
    subscription: { status: 'none', trialDaysLeft: 0, creditsBalance: 0 },
  });

  // Hydrate from JWT on client mount — avoids SSR/client mismatch (React #418)
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) {
      return;
    }
    hydratedRef.current = true;
    const token = tokenStorage.getToken();
    if (token) {
      const payload = decodeKloelJwtPayload(token);
      if (payload?.sub && payload?.email && !isAnonymousKloelPayload(payload)) {
        tokenStorage.ensureAuthCookie();
        setAuthState({
          isAuthenticated: true,
          isLoading: true,
          justSignedUp: false,
          hasCompletedOnboarding: localStorage.getItem(ONBOARDING_KEY) === 'true',
          user: { id: payload.sub, email: payload.email, name: payload.name || '' },
          workspace: (() => {
            const storedWorkspaceId = tokenStorage.getWorkspaceId();
            if (storedWorkspaceId) {
              return { id: storedWorkspaceId, name: '' };
            }
            if (payload.workspaceId) {
              return { id: payload.workspaceId, name: '' };
            }
            return null;
          })(),
          subscription: { status: 'none', trialDaysLeft: 0, creditsBalance: 0 },
        });
      }
    }
  }, []);

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'signup' | 'login'>('signup');

  const claimGuestWhatsAppSession = useCallback(async (targetWorkspaceId?: string | null) => {
    const normalizedTargetWorkspaceId = String(targetWorkspaceId || '').trim();
    if (!normalizedTargetWorkspaceId) {
      return;
    }

    const sourceWorkspaceId = getGuestWorkspaceClaimCandidate();
    if (!sourceWorkspaceId || sourceWorkspaceId === normalizedTargetWorkspaceId) {
      return;
    }

    try {
      const result = await whatsappApi.claimSession(sourceWorkspaceId);
      if (!result.error && result.data?.success !== false) {
        clearGuestWorkspaceClaimCandidate();
      }
    } catch (error) {
      console.error('Failed to claim guest WhatsApp session for authenticated workspace:', error);
    }
  }, []);

  const checkAuthStatus = useCallback(async () => {
    const token = tokenStorage.getToken();

    if (!token) {
      setAuthState((prev) => ({ ...prev, isLoading: false }));
      return;
    }

    if (isAnonymousKloelToken(token)) {
      setAuthState({
        isAuthenticated: false,
        isLoading: false,
        justSignedUp: false,
        hasCompletedOnboarding: false,
        user: null,
        workspace: null,
        subscription: { status: 'none', trialDaysLeft: 0, creditsBalance: 0 },
      });
      return;
    }

    tokenStorage.ensureAuthCookie();

    try {
      const res = await authApi.getMe();

      if (isUnauthorizedStatus(res.status)) {
        tokenStorage.clear();
        setAuthState({
          isAuthenticated: false,
          isLoading: false,
          justSignedUp: false,
          hasCompletedOnboarding: false,
          user: null,
          workspace: null,
          subscription: { status: 'none', trialDaysLeft: 0, creditsBalance: 0 },
        });
        return;
      }

      if (res.error || !res.data?.user) {
        logAuthBootstrapIssue(
          'Auth bootstrap failed without unauthorized status:',
          res.error || 'missing-user',
        );
        setAuthState((prev) => ({
          ...prev,
          isLoading: false,
          isAuthenticated: true,
        }));
        return;
      }

      const { user } = res.data;
      const workspace = resolveWorkspaceFromAuthPayload(res.data);

      if (workspace?.id) {
        tokenStorage.setWorkspaceId(workspace.id);
        await claimGuestWhatsAppSession(workspace.id);
      }

      // Check onboarding status
      const onboardingCompleted = localStorage.getItem(ONBOARDING_KEY) === 'true';

      // Load subscription
      let subscription: Subscription = {
        status: 'none',
        trialDaysLeft: 0,
        creditsBalance: 0,
      };

      if (workspace?.id) {
        try {
          const subRes = await billingApi.getSubscription();
          if (subRes.data) {
            subscription = {
              status: subRes.data.status || 'none',
              trialDaysLeft: subRes.data.trialDaysLeft || 0,
              creditsBalance: subRes.data.creditsBalance || 0,
              plan: subRes.data.plan,
            };
          }
        } catch (error) {
          logAuthBootstrapIssue('Failed to load subscription during auth bootstrap:', error);
        }
      }

      setAuthState({
        isAuthenticated: true,
        isLoading: false,
        justSignedUp: false,
        hasCompletedOnboarding: onboardingCompleted,
        user: {
          id: user.id,
          email: user.email,
          name: user.name || user.email.split('@')[0],
        },
        workspace: workspace ? { id: workspace.id, name: workspace.name || 'Workspace' } : null,
        subscription,
      });
    } catch (error) {
      logAuthBootstrapIssue('Auth bootstrap threw unexpectedly:', error);
      setAuthState((prev) => ({
        ...prev,
        isLoading: false,
        isAuthenticated: true,
      }));
    }
  }, [claimGuestWhatsAppSession]);

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  const refreshSubscription = useCallback(async () => {
    if (!authState.workspace?.id) {
      return;
    }

    const res = await billingApi.getSubscription();
    const subscriptionData = res.data;
    if (subscriptionData) {
      setAuthState((prev) => ({
        ...prev,
        subscription: {
          status: subscriptionData.status || 'none',
          trialDaysLeft: subscriptionData.trialDaysLeft || 0,
          creditsBalance: subscriptionData.creditsBalance || 0,
          plan: subscriptionData.plan,
        },
      }));
    }
  }, [authState.workspace?.id]);

  const hydrateFromAuthResponse = useCallback(
    async (
      payload: unknown,
      options?: { justSignedUp?: boolean; fallbackEmail?: string; fallbackName?: string },
    ) => {
      const envelope = payload as
        | { user?: { id: string; email: string; name?: string }; isNewUser?: boolean }
        | null
        | undefined;
      const user = envelope?.user;
      if (!user) {
        return { success: false as const, error: 'Resposta de autenticação inválida.' };
      }

      const workspace = resolveWorkspaceFromAuthPayload(
        envelope as Record<string, unknown> | null | undefined,
      );

      if (workspace?.id) {
        tokenStorage.setWorkspaceId(workspace.id);
        await claimGuestWhatsAppSession(workspace.id);
      }

      tokenStorage.ensureAuthCookie();

      const onboardingCompleted = localStorage.getItem(ONBOARDING_KEY) === 'true';

      let subscription: Subscription = {
        status: 'none',
        trialDaysLeft: 0,
        creditsBalance: 0,
      };

      if (workspace?.id) {
        const subRes = await billingApi.getSubscription();
        if (subRes.data) {
          subscription = {
            status: subRes.data.status || 'none',
            trialDaysLeft: subRes.data.trialDaysLeft || 0,
            creditsBalance: subRes.data.creditsBalance || 0,
            plan: subRes.data.plan,
          };
        }
      }

      const justSignedUp = options?.justSignedUp === true || envelope?.isNewUser === true;

      setAuthState({
        isAuthenticated: true,
        isLoading: false,
        justSignedUp,
        hasCompletedOnboarding: justSignedUp ? false : onboardingCompleted,
        user: {
          id: user.id,
          email: user.email,
          name:
            user.name ||
            options?.fallbackName ||
            options?.fallbackEmail?.split('@')[0] ||
            user.email.split('@')[0],
        },
        workspace: workspace ? { id: workspace.id, name: workspace.name || 'Workspace' } : null,
        subscription,
      });

      return { success: true as const };
    },
    [claimGuestWhatsAppSession],
  );

  const rememberWorkspaceClaimCandidateForAuthUpgrade = useCallback(() => {
    if (authState.isAuthenticated) {
      return;
    }

    const existingWorkspaceId = tokenStorage.getWorkspaceId();
    if (!existingWorkspaceId) {
      return;
    }

    rememberGuestWorkspaceClaimCandidate(existingWorkspaceId);
  }, [authState.isAuthenticated]);

  const signUp = async (email: string, name: string, password: string) => {
    rememberWorkspaceClaimCandidateForAuthUpgrade();
    const res = await authApi.signUp(email, name, password);

    if (res.error) {
      if (res.status === 409) {
        return { success: false, error: 'E-mail já cadastrado. Faça login.' };
      }
      if (res.status === 429) {
        return {
          success: false,
          error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
        };
      }
      if (res.status === 503) {
        return {
          success: false,
          error: 'Serviço indisponível no momento. Tente novamente em instantes.',
        };
      }
      return { success: false, error: res.error };
    }

    if (res.data?.user) {
      return hydrateFromAuthResponse(res.data, {
        justSignedUp: true,
        fallbackEmail: email,
        fallbackName: name,
      });
    }

    return { success: false, error: 'Signup failed' };
  };

  const signIn = async (email: string, password: string) => {
    rememberWorkspaceClaimCandidateForAuthUpgrade();
    const res = await authApi.signIn(email, password);

    if (res.error) {
      if (res.status === 429) {
        return {
          success: false,
          error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
        };
      }
      if (res.status === 503) {
        return {
          success: false,
          error: 'Serviço indisponível no momento. Tente novamente em instantes.',
        };
      }
      return { success: false, error: res.error };
    }

    if (res.data?.user) {
      return hydrateFromAuthResponse(res.data, {
        fallbackEmail: email,
      });
    }

    return { success: false, error: 'Login failed' };
  };

  const signInWithGoogle = async (credential: string) => {
    rememberWorkspaceClaimCandidateForAuthUpgrade();
    const res = await authApi.signInWithGoogle(credential);

    if (res.error) {
      if (res.status === 429) {
        return {
          success: false,
          error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
        };
      }
      if (res.status === 503) {
        return {
          success: false,
          error:
            res.error || 'Login com Google indisponível no momento. Tente novamente em instantes.',
        };
      }
      return { success: false, error: res.error };
    }

    if (res.data?.user) {
      return hydrateFromAuthResponse(res.data, {
        fallbackEmail: res.data.user.email,
        fallbackName: res.data.user.name ?? undefined,
      });
    }

    return { success: false, error: 'Falha ao autenticar com Google.' };
  };

  const signInWithFacebook = async (accessToken: string, userId?: string) => {
    rememberWorkspaceClaimCandidateForAuthUpgrade();
    const res = await authApi.signInWithFacebook(accessToken, userId);

    if (res.error) {
      if (res.status === 429) {
        return {
          success: false,
          error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
        };
      }
      if (res.status === 503) {
        return {
          success: false,
          error:
            res.error ||
            'Login com Facebook indisponível no momento. Tente novamente em instantes.',
        };
      }
      return { success: false, error: res.error };
    }

    if (res.data?.user) {
      return hydrateFromAuthResponse(res.data, {
        fallbackEmail: res.data.user.email,
        fallbackName: res.data.user.name ?? undefined,
      });
    }

    return { success: false, error: 'Falha ao autenticar com Facebook.' };
  };

  const requestMagicLink = async (email: string, redirectTo?: string) => {
    rememberWorkspaceClaimCandidateForAuthUpgrade();
    const res = await authApi.requestMagicLink(email, redirectTo);

    if (res.error) {
      if (res.status === 429) {
        return {
          success: false,
          error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
          message: res.error,
        };
      }
      if (res.status === 503) {
        return {
          success: false,
          error: 'Serviço indisponível no momento. Tente novamente em instantes.',
          message: res.error,
        };
      }
      return { success: false, error: res.error, message: res.error };
    }

    return {
      success: true,
      message: res.data?.message || 'Se o email for válido, o link de acesso foi enviado.',
    };
  };

  const signOut = async () => {
    await authApi.signOut();

    setAuthState({
      isAuthenticated: false,
      isLoading: false,
      justSignedUp: false,
      hasCompletedOnboarding: false,
      user: null,
      workspace: null,
      subscription: {
        status: 'none',
        trialDaysLeft: 0,
        creditsBalance: 0,
      },
    });
  };

  const completeOnboarding = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    setAuthState((prev) => ({
      ...prev,
      hasCompletedOnboarding: true,
      justSignedUp: false,
    }));
  };

  const dismissOnboardingForSession = () => {
    setAuthState((prev) => ({
      ...prev,
      justSignedUp: false,
    }));
  };

  const openAuthModal = (mode: 'signup' | 'login' = 'signup') => {
    setAuthModalMode(mode);
    setAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setAuthModalOpen(false);
  };

  return (
    <AuthContext.Provider
      value={{
        ...authState,
        userName: authState.user?.name || null,
        userEmail: authState.user?.email || null,
        signUp,
        signIn,
        signInWithGoogle,
        signInWithFacebook,
        requestMagicLink,
        signOut,
        completeOnboarding,
        dismissOnboardingForSession,
        refreshSubscription,
        openAuthModal,
        closeAuthModal,
        authModalOpen,
        authModalMode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/** Use auth. */
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw kloelError('useAuth must be used within an AuthProvider');
  }
  return context;
}
