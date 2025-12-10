"use client"

import type { ReactNode } from "react"
import { Lock, Crown } from "lucide-react"

interface ActionButtonProps {
  icon: ReactNode
  label: string
  onClick: () => void
  requiresAuth?: boolean
  requiresSubscription?: boolean
}

export function ActionButton({ 
  icon, 
  label, 
  onClick, 
  requiresAuth = false,
  requiresSubscription = false,
}: ActionButtonProps) {
  // Determinar qual indicador mostrar
  const showLock = requiresAuth
  const showCrown = !requiresAuth && requiresSubscription

  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium shadow-sm transition-all 
        hover:shadow-md active:scale-[0.98]
        ${showLock || showCrown 
          ? 'border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300 hover:bg-gray-100' 
          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
        }
      `}
    >
      {icon}
      <span>{label}</span>
      {showLock && <Lock className="h-3.5 w-3.5 text-gray-400" />}
      {showCrown && <Crown className="h-3.5 w-3.5 text-amber-500" />}
    </button>
  )
}
