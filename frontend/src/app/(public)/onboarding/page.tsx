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
    router.push("/")
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0A0A0C' }}>
      {/* LEFT — Selection */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '48px 32px',
        }}
        className="lg:w-1/2 lg:px-16"
      >
        <div style={{ maxWidth: 420, margin: '0 auto', width: '100%' }}>
          {/* Logo */}
          <span
            style={{
              display: 'block',
              marginBottom: 48,
              fontFamily: "'Sora', sans-serif",
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: '0.12em',
              color: '#E0DDD8',
            }}
          >
            KLOEL
          </span>

          {/* Heading */}
          <h1
            style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: 28,
              fontWeight: 600,
              color: '#E0DDD8',
              letterSpacing: '0.02em',
              marginBottom: 8,
            }}
          >
            Antes de tudo...
          </h1>
          <p
            style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: 15,
              color: '#6E6E73',
              marginBottom: 32,
              maxWidth: 360,
            }}
          >
            Queremos te conhecer melhor para personalizar sua experiência com o Kloel.
          </p>

          {/* Role Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {ROLES.map((role) => {
              const Icon = role.icon
              const isSelected = selected === role.id
              return (
                <button
                  key={role.id}
                  onClick={() => setSelected(role.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    width: '100%',
                    padding: '16px 20px',
                    borderRadius: 6,
                    border: `1px solid ${isSelected ? '#E85D30' : '#222226'}`,
                    background: isSelected ? 'rgba(232, 93, 48, 0.06)' : '#111113',
                    boxShadow: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 250ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                  }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 6,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      background: isSelected ? 'rgba(232, 93, 48, 0.12)' : '#19191C',
                      border: `1px solid ${isSelected ? 'rgba(232, 93, 48, 0.3)' : '#222226'}`,
                    }}
                  >
                    <Icon
                      size={24}
                      style={{ color: isSelected ? '#E85D30' : '#6E6E73' }}
                    />
                  </div>
                  <div>
                    <p
                      style={{
                        fontFamily: "'Sora', sans-serif",
                        fontSize: 15,
                        fontWeight: 600,
                        color: '#E0DDD8',
                        margin: 0,
                      }}
                    >
                      {role.title}
                    </p>
                    <p
                      style={{
                        fontFamily: "'Sora', sans-serif",
                        fontSize: 13,
                        color: '#6E6E73',
                        margin: '2px 0 0',
                      }}
                    >
                      {role.description}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Continue Button */}
          <button
            onClick={handleContinue}
            disabled={!selected || loading}
            style={{
              marginTop: 32,
              width: '100%',
              padding: '14px 0',
              borderRadius: 6,
              border: 'none',
              background: selected ? '#E85D30' : '#19191C',
              color: selected ? '#FFFFFF' : '#3A3A3F',
              fontSize: 15,
              fontWeight: 600,
              fontFamily: "'Sora', sans-serif",
              cursor: selected ? 'pointer' : 'default',
              transition: 'all 250ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
              boxShadow: 'none',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Entrando..." : "CONTINUAR"}
          </button>

          {/* Login Link */}
          <p
            style={{
              marginTop: 16,
              textAlign: 'center',
              fontSize: 14,
              color: '#6E6E73',
              fontFamily: "'Sora', sans-serif",
            }}
          >
            Já tem uma conta?{" "}
            <a
              href="/login"
              style={{ fontWeight: 600, color: '#E85D30', textDecoration: 'none' }}
            >
              Acesse já
            </a>
          </p>

          {/* Footer */}
          <div
            style={{
              marginTop: 48,
              display: 'flex',
              gap: 16,
              fontSize: 12,
              color: '#3A3A3F',
              fontFamily: "'Sora', sans-serif",
            }}
          >
            <a href="/terms" style={{ color: '#3A3A3F', textDecoration: 'none' }}>Central de ajuda</a>
            <span>•</span>
            <a href="/terms" style={{ color: '#3A3A3F', textDecoration: 'none' }}>Termos e condições</a>
          </div>
        </div>
      </div>

      {/* RIGHT — Cosmos Hero */}
      <div
        className="hidden lg:flex lg:w-1/2"
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0A0A0C',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            maxWidth: 380,
            padding: '0 32px',
            textAlign: 'center',
          }}
        >
          {/* Accent bar */}
          <div
            style={{
              width: 64,
              height: 3,
              borderRadius: 99,
              background: '#E85D30',
              margin: '0 auto 32px',
            }}
          />
          <h2
            style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: 32,
              fontWeight: 700,
              color: '#E0DDD8',
              lineHeight: 1.15,
              marginBottom: 16,
              letterSpacing: '0.02em',
            }}
          >
            A melhor plataforma de Marketing Artificial
          </h2>
          <p
            style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: 15,
              color: '#6E6E73',
              lineHeight: 1.6,
            }}
          >
            Kloel é muito mais que uma plataforma de marketing digital. É onde a inteligência
            artificial se adapta ao seu negócio para vender, atender e converter automaticamente.
          </p>
        </div>
      </div>
    </div>
  )
}
