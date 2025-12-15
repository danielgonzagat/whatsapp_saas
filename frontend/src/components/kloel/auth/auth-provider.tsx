"use client"

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
import { useSession } from "next-auth/react"
import { authApi, tokenStorage, billingApi } from "@/lib/api"

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
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

  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [authModalMode, setAuthModalMode] = useState<"signup" | "login">("signup")

  // NextAuth session - for Google OAuth
  const { data: session, status: sessionStatus } = useSession()

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

      const { user, workspaces } = res.data
      const workspace = workspaces?.[0] || null

      if (workspace?.id) {
        tokenStorage.setWorkspaceId(workspace.id)
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
        workspace: workspace ? { id: workspace.id, name: workspace.name } : null,
        subscription,
      })
    } catch {
      tokenStorage.clear()
      setAuthState(prev => ({ ...prev, isLoading: false }))
    }
  }, [])

  // Sync NextAuth session with tokenStorage
  useEffect(() => {
    if (sessionStatus === "authenticated" && session?.user) {
      const user = session.user as any

      // If we have accessToken from OAuth, sync it
      if (user.accessToken) {
        tokenStorage.setToken(user.accessToken)
      }
      if (user.workspaceId) {
        tokenStorage.setWorkspaceId(user.workspaceId)
      }

      // Update auth state from NextAuth session
      const onboardingCompleted = localStorage.getItem(ONBOARDING_KEY) === "true"

      setAuthState(prev => ({
        ...prev,
        isAuthenticated: true,
        isLoading: false,
        justSignedUp: !onboardingCompleted,
        hasCompletedOnboarding: onboardingCompleted,
        user: {
          id: user.id || user.email,
          email: user.email || "",
          name: user.name || user.email?.split("@")[0] || "",
        },
        workspace: user.workspaceId ? { id: user.workspaceId, name: "Workspace" } : prev.workspace,
      }))

      // Load subscription if we have a workspace
      if (user.workspaceId) {
        billingApi
          .getSubscription()
          .then(res => {
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
          })
          .catch(() => {})
      }

      return
    }

    if (sessionStatus === "unauthenticated") {
      // If NextAuth says unauthenticated, check local token
      checkAuthStatus()
    }
  }, [session, sessionStatus, checkAuthStatus])

  // Check auth status on mount (for local auth)
  useEffect(() => {
    // Only check local if NextAuth is not loading
    if (sessionStatus !== "loading") {
      checkAuthStatus()
    }
  }, [sessionStatus, checkAuthStatus])

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

  const signUp = async (email: string, name: string, password: string) => {
    const res = await authApi.signUp(email, name, password)

    if (res.error) {
      if (res.status === 409) {
        return { success: false, error: "E-mail já cadastrado. Faça login." }
      }
      if (res.status === 503) {
        return { success: false, error: "Serviço indisponível no momento. Tente novamente em instantes." }
      }
      return { success: false, error: res.error }
    }

    if (res.data?.user) {
      const { user, workspace } = res.data

      setAuthState(prev => ({
        ...prev,
        isAuthenticated: true,
        isLoading: false,
        justSignedUp: true,
        hasCompletedOnboarding: false,
        user: {
          id: user.id,
          email: user.email,
          name: user.name || name,
        },
        workspace: workspace ? { id: workspace.id, name: workspace.name } : null,
        subscription: {
          status: "none",
          trialDaysLeft: 0,
          creditsBalance: 0,
        },
      }))

      return { success: true }
    }

    return { success: false, error: "Signup failed" }
  }

  const signIn = async (email: string, password: string) => {
    const res = await authApi.signIn(email, password)

    if (res.error) {
      if (res.status === 503) {
        return { success: false, error: "Serviço indisponível no momento. Tente novamente em instantes." }
      }
      return { success: false, error: res.error }
    }

    if (res.data?.user) {
      const { user, workspaces } = res.data
      const workspace = workspaces?.[0] || null

      const onboardingCompleted = localStorage.getItem(ONBOARDING_KEY) === "true"

      // Load subscription
      let subscription: Subscription = {
        status: "none",
        trialDaysLeft: 0,
        creditsBalance: 0,
      }

      if (workspace?.id) {
        tokenStorage.setWorkspaceId(workspace.id)
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
          name: user.name || email.split("@")[0],
        },
        workspace: workspace ? { id: workspace.id, name: workspace.name } : null,
        subscription,
      })

      return { success: true }
    }

    return { success: false, error: "Login failed" }
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

  // Loading state
  if (authState.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8F8F8]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-900 text-sm font-bold text-white">
            K
          </div>
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
        </div>
      </div>
    )
  }

  return (
    <AuthContext.Provider
      value={{
        ...authState,
        userName: authState.user?.name || null,
        userEmail: authState.user?.email || null,
        signUp,
        signIn,
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
