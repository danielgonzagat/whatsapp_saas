"use client"

import { FileText, Package, ShieldCheck, HelpCircle, MessageSquare, CreditCard } from "lucide-react"

interface KloelStatusCardProps {
  filesProcessed: number
  productsConfigured: number
  rulesLearned: number
  faqFilled: number
  voiceToneDefined: boolean
  checkoutConfigured: boolean
}

export function KloelStatusCard({
  filesProcessed = 0,
  productsConfigured = 0,
  rulesLearned = 0,
  faqFilled = 0,
  voiceToneDefined = false,
  checkoutConfigured = false,
}: KloelStatusCardProps) {
  // Calculate preparation percentage
  const totalItems = 6
  let completedItems = 0
  if (filesProcessed > 0) completedItems++
  if (productsConfigured > 0) completedItems++
  if (rulesLearned > 0) completedItems++
  if (faqFilled > 0) completedItems++
  if (voiceToneDefined) completedItems++
  if (checkoutConfigured) completedItems++

  const preparationPercent = Math.round((completedItems / totalItems) * 100)

  // Ring SVG calculation
  const radius = 40
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (preparationPercent / 100) * circumference

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h4 className="text-lg font-semibold text-gray-900">Status do Kloel</h4>
          <p className="mt-1 text-sm text-gray-500">Nivel de preparacao da sua inteligencia comercial</p>
        </div>

        {/* Apple Fitness Ring Style */}
        <div className="relative flex h-24 w-24 items-center justify-center">
          <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r={radius} fill="none" stroke="#F3F4F6" strokeWidth="8" />
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={preparationPercent >= 80 ? "#22C55E" : preparationPercent >= 50 ? "#F59E0B" : "#EF4444"}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              className="transition-all duration-700 ease-out"
            />
          </svg>
          <div className="absolute flex flex-col items-center">
            <span className="text-2xl font-bold text-gray-900">{preparationPercent}%</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
          <FileText className="h-4 w-4 text-gray-500" />
          <div>
            <p className="text-xs text-gray-500">Arquivos processados</p>
            <p className="font-semibold text-gray-900">{filesProcessed}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
          <Package className="h-4 w-4 text-gray-500" />
          <div>
            <p className="text-xs text-gray-500">Produtos configurados</p>
            <p className="font-semibold text-gray-900">{productsConfigured}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
          <ShieldCheck className="h-4 w-4 text-gray-500" />
          <div>
            <p className="text-xs text-gray-500">Regras aprendidas</p>
            <p className="font-semibold text-gray-900">{rulesLearned}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
          <HelpCircle className="h-4 w-4 text-gray-500" />
          <div>
            <p className="text-xs text-gray-500">FAQ preenchido</p>
            <p className="font-semibold text-gray-900">{faqFilled}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
          <MessageSquare className="h-4 w-4 text-gray-500" />
          <div>
            <p className="text-xs text-gray-500">Tom de voz</p>
            <p className={`font-semibold ${voiceToneDefined ? "text-green-600" : "text-gray-400"}`}>
              {voiceToneDefined ? "Definido" : "Nao definido"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
          <CreditCard className="h-4 w-4 text-gray-500" />
          <div>
            <p className="text-xs text-gray-500">Checkout</p>
            <p className={`font-semibold ${checkoutConfigured ? "text-green-600" : "text-gray-400"}`}>
              {checkoutConfigured ? "Configurado" : "Nao configurado"}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
