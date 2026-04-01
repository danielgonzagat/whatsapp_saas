"use client"

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react"
import { authApi, tokenStorage, billingApi, resolveWorkspaceFromAuthPayload, whatsappApi } from "@/lib/api"
import { KloelLoadingScreen } from "@/components/kloel/loading-screen"
import {
  clearGuestWorkspaceClaimCandidate,
  getGuestWorkspaceClaimCandidate,
  rememberGuestWorkspaceClaimCandidate,
} from "@/lib/anonymous-session"

interface User {
  id: string
  email: string
  name: string
}

interface Workspace {
  id: string
  name: string
}

interface Subscription {
  status: "none" | "trial" | "active" | "expired" | "suspended"
  trialDaysLeft: number
  creditsBalance: number
  plan?: string
}

interface AuthState {
  isAuthenticated: boolean
  isLoading: boolean
  justSignedUp: boolean
  hasCompletedOnboarding: boolean
  user: User | null
  workspace: Workspace | null
  subscription: Subscription
}

interface AuthContextType extends AuthState {
  userName: string | null
  userEmail: string | null
  signUp: (email: string, name: string, password: string) => Promise<{ success: boolean; error?: string }>
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  signInWithGoogle: (credential: string) => Promise<{ success: boolean; error?: string }>
  signOut: () => Promise<void>
  completeOnboarding: () => void
  dismissOnboardingForSession: () => void
  refreshSubscription: () => Promise<void>
  openAuthModal: (mode?: "signup" | "login") => void
  closeAuthModal: () => void
  authModalOpen: boolean
  authModalMode: "signup" | "login"
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const ONBOARDING_KEY = "kloel_onboarding_completed"

/** Decode JWT payload without verification — used to hydrate user name instantly on mount */
function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const base64 = token.split('.')[1];
    if (!base64) return null;
    return JSON.parse(atob(base64));
  } catch { return null; }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    justSignedUp: false,
    hasCompletedOnboarding: false,
    user: null,
    workspace: null,
    subscription: { status: "none", trialDaysLeft: 0, creditsBalance: 0 },
  });

  // Hydrate from JWT on client mount — avoids SSR/client mismatch (React #418)
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const token = localStorage.getItem('kloel_access_token');
    if (token) {
      const payload = decodeJwtPayload(token);
      if (payload?.sub && payload?.email) {
        setAuthState({
          isAuthenticated: true,
          isLoading: true,
          justSignedUp: false,
          hasCompletedOnboarding: localStorage.getItem(ONBOARDING_KEY) === "true",
          user: { id: payload.sub, email: payload.email, name: payload.name || '' },
          workspace: payload.workspaceId ? { id: payload.workspaceId, name: '' } : null,
          subscription: { status: "none", trialDaysLeft: 0, creditsBalance: 0 },
        });
      }
    }
  }, [])

  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [authModalMode, setAuthModalMode] = useState<"signup" | "login">("signup")

  const claimGuestWhatsAppSession = useCallback(async (targetWorkspaceId?: string | null) => {
    const normalizedTargetWorkspaceId = String(targetWorkspaceId || "").trim()
    if (!normalizedTargetWorkspaceId) return

    const sourceWorkspaceId = getGuestWorkspaceClaimCandidate()
    if (!sourceWorkspaceId || sourceWorkspaceId === normalizedTargetWorkspaceId) {
      return
    }

    try {
      const result = await whatsappApi.claimSession(sourceWorkspaceId)
      if (!result.error && result.data?.success !== false) {
        clearGuestWorkspaceClaimCandidate()
      }
    } catch (error) {
      console.error("Failed to claim guest WhatsApp session for authenticated workspace:", error)
    }
  }, [])

  const checkAuthStatus = useCallback(async () => {
    const token = tokenStorage.getToken()
    
    if (!token) {
      setAuthState(prev => ({ ...prev, isLoading: false }))
      return
    }

    try {
      const res = await authApi.getMe()
      
      if (res.error || !res.data?.user) {
        tokenStorage.clear()
        setAuthState(prev => ({ ...prev, isLoading: false }))
        return
      }

      const { user } = res.data
      const workspace = resolveWorkspaceFromAuthPayload(res.data)

      if (workspace?.id) {
        tokenStorage.setWorkspaceId(workspace.id)
        await claimGuestWhatsAppSession(workspace.id)
      }

      // Check onboarding status
      const onboardingCompleted = localStorage.getItem(ONBOARDING_KEY) === "true"

      // Load subscription
      let subscription: Subscription = {
        status: "none",
        trialDaysLeft: 0,
        creditsBalance: 0,
      }

      if (workspace?.id) {
        const subRes = await billingApi.getSubscription()
        if (subRes.data) {
          subscription = {
            status: subRes.data.status || "none",
            trialDaysLeft: subRes.data.trialDaysLeft || 0,
            creditsBalance: subRes.data.creditsBalance || 0,
            plan: subRes.data.plan,
          }
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
          name: user.name || user.email.split("@")[0],
        },
        workspace: workspace
          ? { id: workspace.id, name: workspace.name || "Workspace" }
          : null,
        subscription,
      })
    } catch {
      tokenStorage.clear()
      setAuthState(prev => ({ ...prev, isLoading: false }))
    }
  }, [claimGuestWhatsAppSession])

  useEffect(() => {
    checkAuthStatus()
  }, [checkAuthStatus])

  const refreshSubscription = useCallback(async () => {
    if (!authState.workspace?.id) return

    const res = await billingApi.getSubscription()
    if (res.data) {
      setAuthState(prev => ({
        ...prev,
        subscription: {
          status: res.data!.status || "none",
          trialDaysLeft: res.data!.trialDaysLeft || 0,
          creditsBalance: res.data!.creditsBalance || 0,
          plan: res.data!.plan,
        },
      }))
    }
  }, [authState.workspace?.id])

  const hydrateFromAuthResponse = useCallback(async (
    payload: any,
    options?: { justSignedUp?: boolean; fallbackEmail?: string; fallbackName?: string },
  ) => {
    const user = payload?.user
    if (!user) {
      return { success: false as const, error: "Resposta de autenticação inválida." }
    }

    const workspace = resolveWorkspaceFromAuthPayload(payload)

    if (workspace?.id) {
      tokenStorage.setWorkspaceId(workspace.id)
      await claimGuestWhatsAppSession(workspace.id)
    }

    const onboardingCompleted = localStorage.getItem(ONBOARDING_KEY) === "true"

    let subscription: Subscription = {
      status: "none",
      trialDaysLeft: 0,
      creditsBalance: 0,
    }

    if (workspace?.id) {
      const subRes = await billingApi.getSubscription()
      if (subRes.data) {
        subscription = {
          status: subRes.data.status || "none",
          trialDaysLeft: subRes.data.trialDaysLeft || 0,
          creditsBalance: subRes.data.creditsBalance || 0,
          plan: subRes.data.plan,
        }
      }
    }

    const justSignedUp =
      options?.justSignedUp === true || payload?.isNewUser === true

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
          options?.fallbackEmail?.split("@")[0] ||
          user.email.split("@")[0],
      },
      workspace: workspace
        ? { id: workspace.id, name: workspace.name || "Workspace" }
        : null,
      subscription,
    })

    return { success: true as const }
  }, [claimGuestWhatsAppSession])

  const rememberWorkspaceClaimCandidateForAuthUpgrade = useCallback(() => {
    if (authState.isAuthenticated) return

    const existingWorkspaceId = tokenStorage.getWorkspaceId()
    if (!existingWorkspaceId) return

    rememberGuestWorkspaceClaimCandidate(existingWorkspaceId)
  }, [authState.isAuthenticated])

  const signUp = async (email: string, name: string, password: string) => {
    rememberWorkspaceClaimCandidateForAuthUpgrade()
    const res = await authApi.signUp(email, name, password)

    if (res.error) {
      if (res.status === 409) {
        return { success: false, error: "E-mail já cadastrado. Faça login." }
      }
      if (res.status === 429) {
        return { success: false, error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." }
      }
      if (res.status === 503) {
        return { success: false, error: "Serviço indisponível no momento. Tente novamente em instantes." }
      }
      return { success: false, error: res.error }
    }

    if (res.data?.user) {
      return hydrateFromAuthResponse(res.data, {
        justSignedUp: true,
        fallbackEmail: email,
        fallbackName: name,
      })
    }

    return { success: false, error: "Signup failed" }
  }

  const signIn = async (email: string, password: string) => {
    rememberWorkspaceClaimCandidateForAuthUpgrade()
    const res = await authApi.signIn(email, password)

    if (res.error) {
      if (res.status === 429) {
        return { success: false, error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." }
      }
      if (res.status === 503) {
        return { success: false, error: "Serviço indisponível no momento. Tente novamente em instantes." }
      }
      return { success: false, error: res.error }
    }

    if (res.data?.user) {
      return hydrateFromAuthResponse(res.data, {
        fallbackEmail: email,
      })
    }

    return { success: false, error: "Login failed" }
  }

  const signInWithGoogle = async (credential: string) => {
    rememberWorkspaceClaimCandidateForAuthUpgrade()
    const res = await authApi.signInWithGoogle(credential)

    if (res.error) {
      if (res.status === 429) {
        return { success: false, error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." }
      }
      if (res.status === 503) {
        return {
          success: false,
          error:
            res.error ||
            "Login com Google indisponível no momento. Tente novamente em instantes.",
        }
      }
      return { success: false, error: res.error }
    }

    if (res.data?.user) {
      return hydrateFromAuthResponse(res.data, {
        fallbackEmail: res.data.user.email,
        fallbackName: res.data.user.name,
      })
    }

    return { success: false, error: "Falha ao autenticar com Google." }
  }

  const signOut = async () => {
    await authApi.signOut()

    setAuthState({
      isAuthenticated: false,
      isLoading: false,
      justSignedUp: false,
      hasCompletedOnboarding: false,
      user: null,
      workspace: null,
      subscription: {
        status: "none",
        trialDaysLeft: 0,
        creditsBalance: 0,
      },
    })
  }

  const completeOnboarding = () => {
    localStorage.setItem(ONBOARDING_KEY, "true")
    setAuthState(prev => ({
      ...prev,
      hasCompletedOnboarding: true,
      justSignedUp: false,
    }))
  }

  const dismissOnboardingForSession = () => {
    setAuthState(prev => ({
      ...prev,
      justSignedUp: false,
    }))
  }

  const openAuthModal = (mode: "signup" | "login" = "signup") => {
    setAuthModalMode(mode)
    setAuthModalOpen(true)
  }

  const closeAuthModal = () => {
    setAuthModalOpen(false)
  }

  // Loading state — only show loading screen if no token exists
  if (authState.isLoading) {
    const hasToken = typeof window !== 'undefined' && localStorage.getItem('kloel_access_token');
    if (!hasToken) {
      return <KloelLoadingScreen />
    }
    // If token exists, fall through to render children while auth validates
  }

  return (
    <AuthContext.Provider
      value={{
        ...authState,
        userName: authState.user?.name || null,
        userEmail: authState.user?.email || null,
        signUp,
        signIn,
        signInWithGoogle,
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
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
