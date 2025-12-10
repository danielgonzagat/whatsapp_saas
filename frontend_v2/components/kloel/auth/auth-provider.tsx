"use client"

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
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

type SubscriptionStatus = "none" | "trial" | "active" | "expired" | "suspended"

interface Subscription {
  status: SubscriptionStatus
  trialDaysLeft: number
  creditsBalance: number
  plan?: string
}

// Helper to map backend status to frontend type
function mapSubscriptionStatus(status?: string): SubscriptionStatus {
  const statusMap: Record<string, SubscriptionStatus> = {
    FREE: "none",
    ACTIVE: "active",
    TRIAL: "trial",
    EXPIRED: "expired",
    SUSPENDED: "suspended",
    none: "none",
    trial: "trial",
    active: "active",
    expired: "expired",
    suspended: "suspended",
  }
  return statusMap[status || ""] || "none"
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
  signInWithGoogle: () => Promise<{ success: boolean; error?: string }>
  signOut: () => Promise<void>
  completeOnboarding: () => void
  dismissOnboardingForSession: () => void
  refreshSubscription: () => Promise<void>
  openAuthModal: (mode?: "signup" | "login") => void
  closeAuthModal: () => void
  authModalOpen: boolean
  authModalMode: "signup" | "login"
  openSubscriptionModal: () => void
  closeSubscriptionModal: () => void
  subscriptionModalOpen: boolean
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
  const [subscriptionModalOpen, setSubscriptionModalOpen] = useState(false)

  // Check auth status on mount
  useEffect(() => {
    checkAuthStatus()
  }, [])

  const checkAuthStatus = async () => {
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
            status: mapSubscriptionStatus(subRes.data.status),
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
  }

  const refreshSubscription = useCallback(async () => {
    if (!authState.workspace?.id) return

    const res = await billingApi.getSubscription()
    if (res.data) {
      setAuthState(prev => ({
        ...prev,
        subscription: {
          status: mapSubscriptionStatus(res.data!.status),
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
            status: mapSubscriptionStatus(subRes.data.status),
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

  // Google Sign-In using popup
  const signInWithGoogle = async (): Promise<{ success: boolean; error?: string }> => {
    // For now, show a message that Google login requires configuration
    // In production, integrate with Google Identity Services
    const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    
    if (!GOOGLE_CLIENT_ID) {
      return { 
        success: false, 
        error: "Google login não está configurado. Use email e senha." 
      }
    }

    // Open Google OAuth popup
    const width = 500
    const height = 600
    const left = window.screenX + (window.outerWidth - width) / 2
    const top = window.screenY + (window.outerHeight - height) / 2
    
    const redirectUri = `${window.location.origin}/auth/google/callback`
    const scope = encodeURIComponent("email profile openid")
    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`
    
    const popup = window.open(
      googleAuthUrl,
      "google-login",
      `width=${width},height=${height},left=${left},top=${top}`
    )

    if (!popup) {
      return { success: false, error: "Popup bloqueado. Permita popups para fazer login com Google." }
    }

    // Listen for callback message
    return new Promise((resolve) => {
      const handleMessage = async (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return
        if (event.data?.type !== "google-oauth-callback") return

        window.removeEventListener("message", handleMessage)
        popup.close()

        if (event.data.error) {
          resolve({ success: false, error: event.data.error })
          return
        }

        const { user } = event.data
        const res = await authApi.oauthLogin({
          provider: "google",
          providerId: user.id,
          email: user.email,
          name: user.name,
          image: user.picture,
        })

        if (res.error) {
          resolve({ success: false, error: res.error })
          return
        }

        if (res.data?.user) {
          const { user, workspaces } = res.data
          const workspace = workspaces?.[0] || null

          setAuthState({
            isAuthenticated: true,
            isLoading: false,
            justSignedUp: true,
            hasCompletedOnboarding: false,
            user: {
              id: user.id,
              email: user.email,
              name: user.name || user.email.split("@")[0],
            },
            workspace: workspace ? { id: workspace.id, name: workspace.name } : null,
            subscription: {
              status: "none",
              trialDaysLeft: 0,
              creditsBalance: 0,
            },
          })

          resolve({ success: true })
          return
        }

        resolve({ success: false, error: "Falha no login com Google" })
      }

      window.addEventListener("message", handleMessage)

      // Timeout after 2 minutes
      setTimeout(() => {
        window.removeEventListener("message", handleMessage)
        if (!popup.closed) popup.close()
        resolve({ success: false, error: "Tempo esgotado. Tente novamente." })
      }, 120000)
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

  const openSubscriptionModal = () => {
    setSubscriptionModalOpen(true)
  }

  const closeSubscriptionModal = () => {
    setSubscriptionModalOpen(false)
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
        signInWithGoogle,
        signOut,
        completeOnboarding,
        dismissOnboardingForSession,
        refreshSubscription,
        openAuthModal,
        closeAuthModal,
        authModalOpen,
        authModalMode,
        openSubscriptionModal,
        closeSubscriptionModal,
        subscriptionModalOpen,
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
