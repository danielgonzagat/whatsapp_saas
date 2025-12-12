"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"

interface AuthState {
  isAuthenticated: boolean
  justSignedUp: boolean
  hasCompletedOnboarding: boolean
  userEmail: string | null
  userName: string | null
}

interface AuthContextType extends AuthState {
  signUp: (email: string, name: string, password: string) => void
  signIn: (email: string, password: string) => void
  signOut: () => void
  completeOnboarding: () => void
  dismissOnboardingForSession: () => void
  openAuthModal: (mode?: "signup" | "login") => void
  closeAuthModal: () => void
  authModalOpen: boolean
  authModalMode: "signup" | "login"
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const AUTH_STORAGE_KEY = "kloel_auth_state"

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    justSignedUp: false,
    hasCompletedOnboarding: false,
    userEmail: null,
    userName: null,
  })
  const [isHydrated, setIsHydrated] = useState(false)

  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [authModalMode, setAuthModalMode] = useState<"signup" | "login">("signup")

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY)
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        setAuthState({
          isAuthenticated: parsed.isAuthenticated ?? false,
          justSignedUp: false, // Always reset justSignedUp on page load
          hasCompletedOnboarding: parsed.hasCompletedOnboarding ?? false,
          userEmail: parsed.userEmail ?? null,
          userName: parsed.userName ?? null,
        })
      } catch {
        // Invalid stored data, use defaults
      }
    }
    setIsHydrated(true)
  }, [])

  // Persist to localStorage on changes
  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({
          isAuthenticated: authState.isAuthenticated,
          hasCompletedOnboarding: authState.hasCompletedOnboarding,
          userEmail: authState.userEmail,
          userName: authState.userName,
        }),
      )
    }
  }, [authState, isHydrated])

  const signUp = (email: string, name: string, _password: string) => {
    setAuthState({
      isAuthenticated: true,
      justSignedUp: true,
      hasCompletedOnboarding: false,
      userEmail: email,
      userName: name,
    })
  }

  const signIn = (email: string, _password: string) => {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY)
    let hasCompletedOnboarding = false
    let userName: string | null = null

    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        hasCompletedOnboarding = parsed.hasCompletedOnboarding ?? false
        userName = parsed.userName ?? null
      } catch {
        // Invalid stored data
      }
    }

    setAuthState({
      isAuthenticated: true,
      justSignedUp: false,
      hasCompletedOnboarding,
      userEmail: email,
      userName,
    })
  }

  const signOut = () => {
    setAuthState({
      isAuthenticated: false,
      justSignedUp: false,
      hasCompletedOnboarding: authState.hasCompletedOnboarding,
      userEmail: null,
      userName: null,
    })
  }

  const completeOnboarding = () => {
    setAuthState((prev) => ({
      ...prev,
      hasCompletedOnboarding: true,
      justSignedUp: false,
    }))
  }

  const dismissOnboardingForSession = () => {
    setAuthState((prev) => ({
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

  // Don't render children until hydrated to avoid hydration mismatch
  if (!isHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8F8F8]">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 animate-pulse rounded-lg bg-gray-200" />
          <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
        </div>
      </div>
    )
  }

  return (
    <AuthContext.Provider
      value={{
        ...authState,
        signUp,
        signIn,
        signOut,
        completeOnboarding,
        dismissOnboardingForSession,
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
