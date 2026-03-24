"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ShoppingBag, Users, CreditCard } from "lucide-react"

const ROLES = [
  {
    id: "subscriber",
    title: "Quero acessar minha assinatura",
    description: "Já sou cliente e quero acompanhar meus pedidos e assinaturas.",
    icon: CreditCard,
  },
  {
    id: "producer",
    title: "Sou produtor",
    description: "Quero vender meus produtos com a inteligência artificial do Kloel.",
    icon: ShoppingBag,
  },
  {
    id: "affiliate",
    title: "Sou Afiliado",
    description: "Quero promover produtos e ganhar comissões com vendas automatizadas.",
    icon: Users,
  },
] as const

export default function OnboardingPage() {
  const router = useRouter()
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleContinue = async () => {
    if (!selected) return
    setLoading(true)
    // TODO: Save role to workspace via API
    router.push("/")
  }

  return (
    <div className="flex min-h-screen">
      {/* LEFT — Selection */}
      <div className="flex w-full flex-col justify-center px-8 py-12 lg:w-1/2 lg:px-16">
        <div className="mx-auto w-full max-w-md">
          {/* Logo */}
          <span
            className="mb-12 block text-2xl font-bold"
            style={{
              fontFamily: 'var(--font-serif), "Libre Baskerville", Georgia, serif',
              color: "#0D9488",
            }}
          >
            Kloel
          </span>

          {/* Heading */}
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-gray-900">
            Antes de tudo...
          </h1>
          <p className="mb-8 max-w-sm text-[15px] text-gray-500">
            Queremos te conhecer melhor para personalizar sua experiência com o Kloel.
          </p>

          {/* Role Cards */}
          <div className="space-y-3">
            {ROLES.map((role) => {
              const Icon = role.icon
              const isSelected = selected === role.id
              return (
                <button
                  key={role.id}
                  onClick={() => setSelected(role.id)}
                  className="flex w-full items-center gap-4 rounded-xl border px-5 py-4 text-left transition-all"
                  style={{
                    borderColor: isSelected ? "#0D9488" : "#E5E7EB",
                    backgroundColor: isSelected ? "#0D948808" : "#FFFFFF",
                    boxShadow: isSelected ? "0 0 0 2px #0D948830" : "none",
                  }}
                >
                  <div
                    className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl"
                    style={{
                      backgroundColor: isSelected ? "#0D948815" : "#F3F4F6",
                    }}
                  >
                    <Icon
                      className="h-6 w-6"
                      style={{ color: isSelected ? "#0D9488" : "#6B7280" }}
                    />
                  </div>
                  <div>
                    <p className="text-[15px] font-semibold text-gray-900">
                      {role.title}
                    </p>
                    <p className="text-[13px] text-gray-500">{role.description}</p>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Continue Button */}
          <button
            onClick={handleContinue}
            disabled={!selected || loading}
            className="mt-8 w-full rounded-xl py-3.5 text-[15px] font-semibold text-white transition-all disabled:opacity-40"
            style={{ backgroundColor: "#0D9488" }}
          >
            {loading ? "Entrando..." : "CONTINUAR"}
          </button>

          {/* Login Link */}
          <p className="mt-4 text-center text-sm text-gray-500">
            Já tem uma conta?{" "}
            <a href="/login" className="font-semibold" style={{ color: "#0D9488" }}>
              Acesse já
            </a>
          </p>

          {/* Footer */}
          <div className="mt-12 flex gap-4 text-xs text-gray-400">
            <a href="/terms">Central de ajuda</a>
            <span>•</span>
            <a href="/terms">Termos e condições</a>
          </div>
        </div>
      </div>

      {/* RIGHT — Hero */}
      <div
        className="hidden items-center justify-center lg:flex lg:w-1/2"
        style={{
          background: "linear-gradient(135deg, #F0FDFA 0%, #CCFBF1 50%, #99F6E4 100%)",
        }}
      >
        <div className="max-w-sm px-8 text-center">
          {/* Accent bar */}
          <div
            className="mx-auto mb-8 h-1 w-16 rounded-full"
            style={{ backgroundColor: "#0D9488" }}
          />
          <h2
            className="mb-4 text-3xl font-bold leading-tight text-gray-900"
            style={{ fontFamily: 'var(--font-serif), "Libre Baskerville", Georgia, serif' }}
          >
            A melhor plataforma de Marketing Artificial
          </h2>
          <p className="text-[15px] text-gray-600">
            Kloel é muito mais que uma plataforma de marketing digital. É onde a inteligência
            artificial se adapta ao seu negócio para vender, atender e converter automaticamente.
          </p>
        </div>
      </div>
    </div>
  )
}
