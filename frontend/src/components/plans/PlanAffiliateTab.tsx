'use client'

import { useState, useEffect } from 'react'

/* ── Design Tokens ── */
const BG_VOID = '#0A0A0C'
const BG_SURFACE = '#111113'
const BG_ELEVATED = '#19191C'
const BORDER = '#222226'
const TEXT_PRIMARY = '#E0DDD8'
const TEXT_MUTED = '#6E6E73'
const TEXT_DIM = '#3A3A3F'
const EMBER = '#E85D30'
const GREEN = '#10B981'
const FONT_BODY = "'Sora', sans-serif"
const FONT_MONO = "'JetBrains Mono', monospace"

/* ── Styles ── */
const labelStyle: React.CSSProperties = {
  fontFamily: FONT_BODY,
  fontSize: '11px',
  fontWeight: 600,
  color: TEXT_DIM,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  marginBottom: '6px',
  display: 'block',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: BG_ELEVATED,
  border: `1px solid ${BORDER}`,
  color: TEXT_PRIMARY,
  borderRadius: '6px',
  padding: '10px 14px',
  fontSize: '14px',
  fontFamily: FONT_BODY,
  outline: 'none',
  boxSizing: 'border-box' as const,
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: 'none' as const,
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236E6E73' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  paddingRight: '36px',
}

const cardStyle: React.CSSProperties = {
  background: BG_SURFACE,
  border: `1px solid ${BORDER}`,
  borderRadius: '6px',
  padding: '20px',
}

export function PlanAffiliateTab({ planId, priceInCents }: { planId: string; priceInCents: number }) {
  const [enabled, setEnabled] = useState(false)
  const [commissionPercent, setCommissionPercent] = useState(50)
  const [cookieDays, setCookieDays] = useState(180)
  const [approvalMode, setApprovalMode] = useState<'auto' | 'manual'>('auto')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  const formatCents = (cents: number): string => {
    return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`
  }

  const simulateCommission = (sales: number): string => {
    const commissionPerSale = (priceInCents * commissionPercent) / 100
    return formatCents(commissionPerSale * sales)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // Endpoint for plan affiliate config not yet available
      // Shell preserved — will connect when backend supports per-plan affiliate settings
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <h3 style={{
        fontFamily: FONT_BODY,
        fontSize: '18px',
        fontWeight: 600,
        color: TEXT_PRIMARY,
        letterSpacing: '-0.01em',
        margin: 0,
      }}>
        Programa de afiliacao
      </h3>

      {/* Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          type="button"
          onClick={() => setEnabled(!enabled)}
          style={{
            position: 'relative',
            display: 'inline-flex',
            alignItems: 'center',
            width: '44px',
            height: '24px',
            borderRadius: '6px',
            border: 'none',
            cursor: 'pointer',
            backgroundColor: enabled ? EMBER : BG_ELEVATED,
            transition: 'background-color 150ms ease',
            padding: 0,
            flexShrink: 0,
          }}
        >
          <span style={{
            display: 'block',
            width: '16px',
            height: '16px',
            borderRadius: '4px',
            backgroundColor: '#FFFFFF',
            transition: 'transform 150ms ease',
            transform: enabled ? 'translateX(24px)' : 'translateX(4px)',
          }} />
        </button>
        <span style={{
          fontFamily: FONT_BODY,
          fontSize: '14px',
          color: TEXT_PRIMARY,
        }}>
          Aceitar afiliados neste plano
        </span>
      </div>

      {/* Config fields (shown when enabled) */}
      {enabled && (
        <>
          <div style={{
            ...cardStyle,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: '16px',
          }}>
            {/* Commission % */}
            <div>
              <label style={labelStyle}>Comissao (%)</label>
              <input
                type="number"
                min={1}
                max={100}
                value={commissionPercent}
                onChange={(e) => setCommissionPercent(Math.min(100, Math.max(1, Number(e.target.value))))}
                style={{ ...inputStyle, fontFamily: FONT_MONO }}
              />
            </div>

            {/* Cookie days */}
            <div>
              <label style={labelStyle}>Cookie (dias)</label>
              <input
                type="number"
                min={1}
                max={365}
                value={cookieDays}
                onChange={(e) => setCookieDays(Math.min(365, Math.max(1, Number(e.target.value))))}
                style={{ ...inputStyle, fontFamily: FONT_MONO }}
              />
            </div>

            {/* Approval mode */}
            <div>
              <label style={labelStyle}>Modo de aprovacao</label>
              <select
                value={approvalMode}
                onChange={(e) => setApprovalMode(e.target.value as 'auto' | 'manual')}
                style={selectStyle}
              >
                <option value="auto">Automatico</option>
                <option value="manual">Manual</option>
              </select>
            </div>
          </div>

          {/* Simulator */}
          <div style={{
            background: BG_ELEVATED,
            border: `1px solid ${BORDER}`,
            borderRadius: '6px',
            padding: '24px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
              {/* Chart icon */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={EMBER} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
              <span style={{
                fontFamily: FONT_BODY,
                fontSize: '14px',
                fontWeight: 600,
                color: TEXT_PRIMARY,
              }}>
                Simulador de ganhos do afiliado
              </span>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: '16px',
            }}>
              {[10, 50, 100].map((sales) => (
                <div
                  key={sales}
                  style={{
                    background: BG_SURFACE,
                    border: `1px solid ${BORDER}`,
                    borderRadius: '6px',
                    padding: '16px',
                    textAlign: 'center' as const,
                  }}
                >
                  <p style={{
                    fontFamily: FONT_BODY,
                    fontSize: '12px',
                    color: TEXT_MUTED,
                    margin: '0 0 8px 0',
                    textTransform: 'uppercase' as const,
                    letterSpacing: '0.05em',
                  }}>
                    {sales} vendas
                  </p>
                  <p style={{
                    fontFamily: FONT_MONO,
                    fontSize: '20px',
                    fontWeight: 700,
                    color: GREEN,
                    margin: 0,
                  }}>
                    {simulateCommission(sales)}
                  </p>
                </div>
              ))}
            </div>

            <p style={{
              fontFamily: FONT_BODY,
              fontSize: '11px',
              color: TEXT_DIM,
              margin: '12px 0 0 0',
              textAlign: 'center' as const,
            }}>
              Preco do plano: {formatCents(priceInCents)} | Comissao: {commissionPercent}%
            </p>
          </div>
        </>
      )}

      {/* Save Button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingTop: '4px' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            background: EMBER,
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '6px',
            padding: '10px 24px',
            fontSize: '13px',
            fontWeight: 600,
            fontFamily: FONT_BODY,
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.6 : 1,
            transition: 'opacity 150ms ease',
          }}
        >
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
        {saved && (
          <span style={{
            fontFamily: FONT_BODY,
            fontSize: '13px',
            fontWeight: 500,
            color: GREEN,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Salvo
          </span>
        )}
      </div>
    </div>
  )
}
