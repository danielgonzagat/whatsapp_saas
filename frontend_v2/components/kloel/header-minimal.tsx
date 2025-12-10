"use client"

import { useState } from "react"
import { Settings, FlaskConical, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TestKloelModal } from "./test-kloel-modal"
import { useAuth } from "./auth/auth-provider"

interface HeaderMinimalProps {
  isWhatsAppConnected: boolean
  onOpenSettings: () => void
  subscriptionStatus?: "none" | "trial" | "active" | "expired" | "suspended"
  trialDaysLeft?: number
}

export function HeaderMinimal({
  isWhatsAppConnected,
  onOpenSettings,
  subscriptionStatus = "none",
  trialDaysLeft = 7,
}: HeaderMinimalProps) {
  const [showTestModal, setShowTestModal] = useState(false)
  const { isAuthenticated, userName, openAuthModal, signOut } = useAuth()

  return (
    <>
      <header className="fixed left-0 right-0 top-0 z-50 bg-[#F8F8F8]/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-3">
            {isAuthenticated && (
              <button
                onClick={onOpenSettings}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-sm transition-all hover:border-gray-300 hover:shadow-md hover:text-gray-900"
              >
                <Settings className="h-4 w-4" />
              </button>
            )}

            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-900 text-sm font-bold text-white shadow-sm">
              K
            </div>
            <span className="text-lg font-semibold tracking-tight text-gray-900">KLOEL</span>

            {isAuthenticated && subscriptionStatus === "trial" && (
              <div className="ml-2 hidden items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 md:flex">
                <span className="text-xs font-medium text-blue-700">Plano Basic – {trialDaysLeft} dias restantes</span>
              </div>
            )}

            {isAuthenticated && subscriptionStatus === "active" && (
              <div className="ml-2 hidden items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 md:flex">
                <span className="text-xs font-medium text-green-700">Plano Basic</span>
              </div>
            )}

            {isAuthenticated && isWhatsAppConnected && (
              <div className="ml-2 flex items-center gap-2 rounded-full bg-green-50 px-3 py-1">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                </span>
                <span className="text-xs font-medium text-green-700">WhatsApp conectado</span>
              </div>
            )}
          </div>

          {/* Auth Buttons */}
          <div className="flex items-center gap-2">
            {isAuthenticated &&
              (subscriptionStatus === "trial" || subscriptionStatus === "active") &&
              isWhatsAppConnected && (
                <Button
                  variant="ghost"
                  onClick={() => setShowTestModal(true)}
                  className="hidden text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 md:flex"
                >
                  <FlaskConical className="mr-1.5 h-4 w-4" />
                  Testar Kloel
                </Button>
              )}

            {!isAuthenticated ? (
              <>
                <Button
                  variant="ghost"
                  onClick={() => openAuthModal("login")}
                  className="text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                >
                  Entrar
                </Button>
                <Button
                  onClick={() => openAuthModal("signup")}
                  className="rounded-full bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800"
                >
                  Cadastrar-se
                </Button>
              </>
            ) : (
              <>
                {/* User info and sign out */}
                <div className="hidden items-center gap-2 md:flex">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-600">
                    {userName?.charAt(0).toUpperCase() || "U"}
                  </div>
                  <span className="text-sm font-medium text-gray-700">{userName || "Usuario"}</span>
                </div>
                <Button
                  variant="ghost"
                  onClick={signOut}
                  className="text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                >
                  <LogOut className="mr-1.5 h-4 w-4" />
                  <span className="hidden md:inline">Sair</span>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <TestKloelModal isOpen={showTestModal} onClose={() => setShowTestModal(false)} />
    </>
  )
}
