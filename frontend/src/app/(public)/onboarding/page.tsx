"use client"

import { useState, useEffect, useRef } from "react"
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

/* ═══ Orbital Ring SVG ═══ */
function OrbitalRing() {
  return (
    <svg
      width="300"
      height="300"
      viewBox="0 0 300 300"
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        opacity: 0.15,
      }}
    >
      <ellipse
        cx="150"
        cy="150"
        rx="140"
        ry="80"
        fill="none"
        stroke="#4E7AE0"
        strokeWidth="0.8"
        style={{ animation: 'orbit 90s linear infinite' }}
        transform="rotate(-20 150 150)"
      />
      <ellipse
        cx="150"
        cy="150"
        rx="100"
        ry="120"
        fill="none"
        stroke="#7B5EA7"
        strokeWidth="0.5"
        style={{ animation: 'orbit 120s linear infinite reverse' }}
        transform="rotate(30 150 150)"
      />
    </svg>
  )
}

/* ═══ Star Canvas for right panel ═══ */
function MiniStarField() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const d = window.devicePixelRatio || 1

    function draw() {
      if (!c || !ctx) return
      const w = c.offsetWidth
      const h = c.offsetHeight
      c.width = w * d
      c.height = h * d
      ctx.scale(d, d)
      ctx.clearRect(0, 0, w, h)

      for (let i = 0; i < 60; i++) {
        const px = ((42 * (i + 1) * 7919 + i * 3571) % 10000) / 10000 * w
        const py = ((42 * (i + 1) * 6271 + i * 2953) % 10000) / 10000 * h
        const sz = i % 15 === 0 ? 1.2 : (i % 3 === 0 ? 0.8 : 0.5)
        const a = i % 15 === 0 ? 0.1 : (i % 4 === 0 ? 0.06 : 0.03)
        const isBlue = i % 11 === 0
        ctx.beginPath()
        ctx.arc(px, py, sz, 0, Math.PI * 2)
        ctx.fillStyle = isBlue ? `rgba(78,122,224,${a + 0.04})` : `rgba(232,230,240,${a})`
        ctx.fill()
      }
    }

    draw()
    window.addEventListener('resize', draw)
    return () => window.removeEventListener('resize', draw)
  }, [])

  return (
    <canvas
      ref={ref}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    />
  )
}

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
    <div style={{ display: 'flex', minHeight: '100vh', background: '#06060C' }}>
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
              fontFamily: "'Outfit', sans-serif",
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: '0.12em',
              background: 'linear-gradient(135deg, #E8E6F0, #9896A8)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            KLOEL
          </span>

          {/* Heading */}
          <h1
            style={{
              fontFamily: "'Outfit', sans-serif",
              fontSize: 28,
              fontWeight: 600,
              color: '#E8E6F0',
              letterSpacing: '0.02em',
              marginBottom: 8,
            }}
          >
            Antes de tudo...
          </h1>
          <p
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 15,
              color: '#9896A8',
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
                    borderRadius: 12,
                    border: `1px solid ${isSelected ? '#4E7AE0' : '#1E1E34'}`,
                    background: isSelected ? 'rgba(78, 122, 224, 0.06)' : '#0A0A14',
                    boxShadow: isSelected ? '0 0 20px rgba(78, 122, 224, 0.1)' : 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 250ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                  }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      background: isSelected ? 'rgba(78, 122, 224, 0.12)' : '#10101C',
                      border: `1px solid ${isSelected ? 'rgba(78, 122, 224, 0.3)' : '#1E1E34'}`,
                    }}
                  >
                    <Icon
                      size={24}
                      style={{ color: isSelected ? '#4E7AE0' : '#5C5A6E' }}
                    />
                  </div>
                  <div>
                    <p
                      style={{
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: 15,
                        fontWeight: 600,
                        color: '#E8E6F0',
                        margin: 0,
                      }}
                    >
                      {role.title}
                    </p>
                    <p
                      style={{
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: 13,
                        color: '#5C5A6E',
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
              borderRadius: 12,
              border: 'none',
              background: selected ? '#4E7AE0' : '#181828',
              color: selected ? '#FFFFFF' : '#3A384A',
              fontSize: 15,
              fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
              cursor: selected ? 'pointer' : 'default',
              transition: 'all 250ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
              boxShadow: selected ? '0 0 20px rgba(78, 122, 224, 0.2)' : 'none',
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
              color: '#5C5A6E',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Já tem uma conta?{" "}
            <a
              href="/login"
              style={{ fontWeight: 600, color: '#4E7AE0', textDecoration: 'none' }}
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
              color: '#3A384A',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            <a href="/terms" style={{ color: '#3A384A', textDecoration: 'none' }}>Central de ajuda</a>
            <span>•</span>
            <a href="/terms" style={{ color: '#3A384A', textDecoration: 'none' }}>Termos e condições</a>
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
          background: '#06060C',
          overflow: 'hidden',
        }}
      >
        <MiniStarField />
        <OrbitalRing />

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
              background: 'linear-gradient(90deg, #4E7AE0, #7B5EA7)',
              margin: '0 auto 32px',
              boxShadow: '0 0 12px rgba(78, 122, 224, 0.2)',
            }}
          />
          <h2
            style={{
              fontFamily: "'Outfit', sans-serif",
              fontSize: 32,
              fontWeight: 700,
              color: '#E8E6F0',
              lineHeight: 1.15,
              marginBottom: 16,
              letterSpacing: '0.02em',
            }}
          >
            A melhor plataforma de Marketing Artificial
          </h2>
          <p
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 15,
              color: '#9896A8',
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
