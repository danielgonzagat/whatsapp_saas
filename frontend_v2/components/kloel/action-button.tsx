"use client"

import type { ReactNode } from "react"

interface ActionButtonProps {
  icon: ReactNode
  label: string
  onClick: () => void
}

export function ActionButton({ icon, label, onClick }: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-all hover:border-gray-300 hover:bg-gray-50 hover:shadow-md active:scale-[0.98]"
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}
