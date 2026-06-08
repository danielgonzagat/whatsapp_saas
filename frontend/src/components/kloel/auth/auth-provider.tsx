'use client';
import { kloelError } from '@/lib/i18n/t';
import {
  apiFetch,
  authApi,
  billingApi,
  resolveWorkspaceFromAuthPayload,
  tokenStorage,
} from '@/lib/api';
import {
  decodeKloelJwtPayload,
  hasAuthenticatedKloelToken,
  isAnonymousKloelToken,
} from '@/lib/auth-identity';
import { completeOnboardingProfile } from '@/lib/api/onboarding';
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  type AuthState,
  type Subscription,
  buildEmptyAuthState,
  buildEmptySubscription,
  isUnauthorizedStatus,
  mapAuthErrorStatusToMessage,
  mapSubscriptionResponse,
  pickUserDisplayName,
  projectWorkspace,
} from './auth-provider.helpers';

type AuthActionResult = {
  success: boolean;
  error?: string;
  mfaRequired?: boolean;
  mfaToken?: string;
  email?: string;
  name?: string | null;
};

interface AuthContextType extends AuthState {
  userName: string | null;
  userEmail: string | null;
  signUp: (
    email: string,
    name: string,
    password: string,
    options?: { workspaceName?: string; affiliateInviteToken?: string },
  ) => Promise<AuthActionResult>;
  signIn: (email: string, password: string) => Promise<AuthActionResult>;
  verifyMfaLogin: (mfaToken: string, code: string) => Promise<AuthActionResult>;
  signInWithGoogle: (credential: string) => Promise<AuthActionResult>;
  signInWithFacebook: (accessToken: string, userId?: string) => Promise<AuthActionResult>;
  requestMagicLink: (
    email: string,
    redirectTo?: string,
  ) => Promise<{ success: boolean; error?: string; message?: string }>;
  signOut: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  dismissOnboardingForSession: () => void;
  refreshSubscription: () => Promise<void>;
  openAuthModal: (mode?: 'signup' | 'login') => void;
  closeAuthModal: () => void;
  authModalOpen: boolean;
  authModalMode: 'signup' | 'login';
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);
function logAuthBootstrapIssue(message: string, detail?: unknown) {
  if (process.env.NODE_ENV !== 'development') {
    return;
  }
  console.warn(message, detail);
}
/** Auth provider. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>(() =>
    buildEmptyAuthState({ isLoading: true }),
  );
  // Hydrate from JWT on client mount — avoids SSR/client mismatch (React rgb(68, 17, 136))
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) {
      return;
    }
    hydratedRef.current = true;
    const token = tokenStorage.getToken();
    if (token) {
      const payload = decodeKloelJwtPayload(token);
      if (hasAuthenticatedKloelToken(token) && payload?.sub && payload?.email) {
        tokenStorage.ensureAuthCookie();
        const payloadSub = payload.sub;
        const payloadEmail = payload.email;
        const payloadName = payload.name || '';
        const payloadWorkspaceId = payload.workspaceId;
        queueMicrotask(() => {
          setAuthState({
            ...buildEmptyAuthState({ isLoading: true }),
            isAuthenticated: true,
            user: { id: payloadSub, email: payloadEmail, name: payloadName },
            workspace: (() => {
              const storedWorkspaceId = tokenStorage.getWorkspaceId();
              if (storedWorkspaceId) {
                return { id: storedWorkspaceId, name: '' };
              }
              if (payloadWorkspaceId) {
                return { id: payloadWorkspaceId, name: '' };
              }
              return null;
            })(),
          });
        });
      }
    }
  }, []);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'signup' | 'login'>('signup');
  const checkAuthStatus = useCallback(async () => {
    const token = tokenStorage.getToken();
    if (!token) {
      setAuthState((prev) => ({ ...prev, isLoading: false }));
      return;
    }
    if (isAnonymousKloelToken(token)) {
      setAuthState(buildEmptyAuthState());
      return;
    }
    tokenStorage.ensureAuthCookie();
    try {
      const res = await authApi.getMe();
      if (isUnauthorizedStatus(res.status)) {
        tokenStorage.clear();
        setAuthState(buildEmptyAuthState());
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
      }
      // Load subscription
      let subscription: Subscription = buildEmptySubscription();
      let onboardingCompleted = false;
      if (user?.id) {
        try {
          const meRes = await apiFetch<{ user?: { onboardingCompletedAt?: string | null } }>(
            '/auth/me',
          );
          onboardingCompleted = Boolean(meRes.data?.user?.onboardingCompletedAt);
        } catch (error) {
          logAuthBootstrapIssue('Failed to load onboarding status during auth bootstrap:', error);
        }
      }
      if (workspace?.id) {
        try {
          const subRes = await billingApi.getSubscription();
          const mapped = mapSubscriptionResponse(subRes.data);
          if (mapped) {
            subscription = mapped;
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
          name: pickUserDisplayName({ userName: user.name, userEmail: user.email }),
        },
        workspace: projectWorkspace(workspace),
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
  }, []);
  useEffect(() => {
    queueMicrotask(() => {
      void checkAuthStatus();
    });
  }, [checkAuthStatus]);
  const refreshSubscription = useCallback(async () => {
    if (!authState.workspace?.id) {
      return;
    }
    const res = await billingApi.getSubscription();
    const mapped = mapSubscriptionResponse(res.data);
    if (mapped) {
      setAuthState((prev) => ({
        ...prev,
        subscription: mapped,
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
      }
      tokenStorage.ensureAuthCookie();
      let subscription: Subscription = buildEmptySubscription();
      let onboardingCompleted = false;
      if (user?.id) {
        const meRes = await apiFetch<{ user?: { onboardingCompletedAt?: string | null } }>(
          '/auth/me',
        ).catch((error: unknown) => {
          logAuthBootstrapIssue('Failed to load onboarding status after auth response:', error);
          return null;
        });
        onboardingCompleted = Boolean(meRes?.data?.user?.onboardingCompletedAt);
      }
      if (workspace?.id) {
        const subRes = await billingApi.getSubscription();
        const mapped = mapSubscriptionResponse(subRes.data);
        if (mapped) {
          subscription = mapped;
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
          name: pickUserDisplayName({
            userName: user.name,
            userEmail: user.email,
            ...(options?.fallbackName !== undefined ? { fallbackName: options.fallbackName } : {}),
            ...(options?.fallbackEmail !== undefined
              ? { fallbackEmail: options.fallbackEmail }
              : {}),
          }),
        },
        workspace: projectWorkspace(workspace),
        subscription,
      });
      return { success: true as const };
    },
    [],
  );
  const signUp = async (
    email: string,
    name: string,
    password: string,
    options?: { workspaceName?: string; affiliateInviteToken?: string },
  ) => {
    const res = await authApi.signUp(email, name, password, options);
    if (res.error) {
      const mapped = mapAuthErrorStatusToMessage(res.status, 'signup', res.error);
      return { success: false, error: mapped ?? res.error };
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
    const res = await authApi.signIn(email, password);
    if (res.error) {
      const mapped = mapAuthErrorStatusToMessage(res.status, 'signin', res.error);
      return { success: false, error: mapped ?? res.error };
    }
    if (res.data?.state === 'mfa_required' && res.data.mfaToken) {
      return {
        success: true,
        mfaRequired: true,
        mfaToken: res.data.mfaToken,
        email: res.data.user?.email || email,
        name: res.data.user?.name ?? null,
      };
    }
    if (res.data?.user) {
      return hydrateFromAuthResponse(res.data, {
        fallbackEmail: email,
      });
    }
    return { success: false, error: 'Login failed' };
  };
  const verifyMfaLogin = async (mfaToken: string, code: string) => {
    const res = await authApi.verifyMfaLogin(mfaToken, code);
    if (res.error) {
      const mapped = mapAuthErrorStatusToMessage(res.status, 'signin', res.error);
      return { success: false, error: mapped ?? res.error };
    }
    if (res.data?.user) {
      return hydrateFromAuthResponse(res.data, {
        fallbackEmail: res.data.user.email,
        ...(res.data.user.name ? { fallbackName: res.data.user.name } : {}),
      });
    }
    return { success: false, error: 'Codigo 2FA invalido.' };
  };
  const signInWithGoogle = async (credential: string) => {
    const res = await authApi.signInWithGoogle(credential);
    if (res.error) {
      const mapped = mapAuthErrorStatusToMessage(res.status, 'google', res.error);
      return { success: false, error: mapped ?? res.error };
    }
    if (res.data?.user) {
      return hydrateFromAuthResponse(res.data, {
        fallbackEmail: res.data.user.email,
        ...(res.data.user.name ? { fallbackName: res.data.user.name } : {}),
      });
    }
    return { success: false, error: 'Falha ao autenticar com Google.' };
  };
  const signInWithFacebook = async (accessToken: string, userId?: string) => {
    const res = await authApi.signInWithFacebook(accessToken, userId);
    if (res.error) {
      const mapped = mapAuthErrorStatusToMessage(res.status, 'facebook', res.error);
      return { success: false, error: mapped ?? res.error };
    }
    if (res.data?.user) {
      return hydrateFromAuthResponse(res.data, {
        fallbackEmail: res.data.user.email,
        ...(res.data.user.name ? { fallbackName: res.data.user.name } : {}),
      });
    }
    return { success: false, error: 'Falha ao autenticar com Facebook.' };
  };
  const requestMagicLink = async (email: string, redirectTo?: string) => {
    const res = await authApi.requestMagicLink(email, redirectTo);
    if (res.error) {
      const mapped = mapAuthErrorStatusToMessage(res.status, 'magic-link', res.error);
      return { success: false, error: mapped ?? res.error, message: res.error };
    }
    return {
      success: true,
      message: res.data?.message || 'Se o email for válido, o link de acesso foi enviado.',
    };
  };
  const signOut = async () => {
    await authApi.signOut();
    setAuthState(buildEmptyAuthState());
  };
  const completeOnboarding = async () => {
    setAuthState((prev) => ({
      ...prev,
      hasCompletedOnboarding: true,
      justSignedUp: false,
    }));
    try {
      await apiFetch('/auth/me/onboarding-complete', { method: 'PUT' });
    } catch (error) {
      logAuthBootstrapIssue('Failed to persist onboarding completion:', error);
    }
    const workspaceId = authState.workspace?.id;
    if (!workspaceId) {
      return;
    }
    const result = await completeOnboardingProfile(workspaceId);
    if (result.error) {
      logAuthBootstrapIssue('Failed to persist onboarding profile:', result.error);
    }
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
        verifyMfaLogin,
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
