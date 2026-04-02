'use client';

import { useState, useEffect, useRef } from 'react';
import { mutate } from 'swr';
import { apiFetch } from '@/lib/api';

const FONT_BODY = "var(--font-sora), 'Sora', sans-serif";
const FONT_MONO = "var(--font-jetbrains), 'JetBrains Mono', monospace";
const EMBER = '#E85D30';

const card: React.CSSProperties = {
  background: '#111113',
  border: '1px solid #222226',
  borderRadius: '6px',
  padding: '20px',
};

export function PlanAffiliateTab({
  planId,
  productId,
  priceInCents,
}: {
  planId: string;
  productId: string;
  priceInCents: number;
}) {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [commissionPercent, setCommissionPercent] = useState(50);
  const [cookieDays, setCookieDays] = useState(180);
  const [approvalMode, setApprovalMode] = useState<'auto' | 'manual'>('auto');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  useEffect(() => {
    apiFetch(`/products/${productId}`)
      .then((res: any) => {
        const p = res?.data || res;
        if (p) {
          setEnabled(p.affiliateEnabled ?? false);
          setCommissionPercent(p.commissionPercent ?? 30);
          setCookieDays(p.commissionCookieDays ?? 180);
          setApprovalMode(p.affiliateAutoApprove ? 'auto' : 'manual');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [productId]);

  const formatCents = (cents: number): string => {
    return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
  };

  const simulateCommission = (sales: number): string => {
    const commissionPerSale = (priceInCents * commissionPercent) / 100;
    return formatCents(commissionPerSale * sales);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch(`/products/${productId}`, {
        method: 'PUT',
        body: {
          affiliateEnabled: enabled,
          commissionPercent,
          commissionCookieDays: cookieDays,
          affiliateAutoApprove: approvalMode === 'auto',
        },
      });
      mutate((key: unknown) => typeof key === 'string' && key.startsWith('/products'));
      setSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error('Erro ao salvar config de afiliados:', e);
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#6E6E73', fontFamily: FONT_BODY }}>
        Carregando...
      </div>
    );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <h3
        style={{
          fontFamily: FONT_BODY,
          fontSize: '16px',
          fontWeight: 600,
          color: '#E0DDD8',
          margin: 0,
        }}
      >
        Programa de Afiliados
      </h3>

      {/* Enable toggle */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#E0DDD8', fontFamily: FONT_BODY }}>
              Aceitar afiliados
            </div>
            <div style={{ fontSize: 11, color: '#6E6E73', fontFamily: FONT_BODY, marginTop: 4 }}>
              Permitir que outros vendam este produto e recebam comissao
            </div>
          </div>
          <button
            type="button"
            onClick={() => setEnabled(!enabled)}
            style={{
              width: 44,
              height: 24,
              borderRadius: 12,
              background: enabled ? '#10B981' : '#222226',
              border: 'none',
              position: 'relative',
              cursor: 'pointer',
              transition: 'background .2s',
            }}
          >
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: 9,
                background: '#fff',
                position: 'absolute',
                top: 3,
                left: enabled ? 23 : 3,
                transition: 'left .2s',
                display: 'block',
              }}
            />
          </button>
        </div>
      </div>

      {enabled && (
        <>
          {/* Commission */}
          <div style={card}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: '#E0DDD8',
                fontFamily: FONT_BODY,
                marginBottom: 16,
              }}
            >
              Comissao
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <span
                  style={{
                    display: 'block',
                    fontSize: 10,
                    fontWeight: 600,
                    color: '#3A3A3F',
                    textTransform: 'uppercase' as const,
                    letterSpacing: '.08em',
                    marginBottom: 6,
                    fontFamily: FONT_BODY,
                  }}
                >
                  Percentual (%)
                </span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  aria-label="Percentual de comissão (%)"
                  value={commissionPercent}
                  onChange={(e) =>
                    setCommissionPercent(Math.min(100, Math.max(1, Number(e.target.value))))
                  }
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    background: '#19191C',
                    border: '1px solid #222226',
                    borderRadius: 6,
                    color: '#E0DDD8',
                    fontSize: 14,
                    fontFamily: FONT_MONO,
                    outline: 'none',
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <span
                  style={{
                    display: 'block',
                    fontSize: 10,
                    fontWeight: 600,
                    color: '#3A3A3F',
                    textTransform: 'uppercase' as const,
                    letterSpacing: '.08em',
                    marginBottom: 6,
                    fontFamily: FONT_BODY,
                  }}
                >
                  Cookie (dias)
                </span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  aria-label="Duração do cookie (dias)"
                  value={cookieDays}
                  onChange={(e) =>
                    setCookieDays(Math.min(365, Math.max(1, Number(e.target.value))))
                  }
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    background: '#19191C',
                    border: '1px solid #222226',
                    borderRadius: 6,
                    color: '#E0DDD8',
                    fontSize: 14,
                    fontFamily: FONT_MONO,
                    outline: 'none',
                  }}
                />
              </div>
            </div>
            {priceInCents > 0 && (
              <div
                style={{
                  marginTop: 16,
                  padding: 12,
                  background: '#19191C',
                  borderRadius: 6,
                  fontSize: 11,
                  color: '#6E6E73',
                  fontFamily: FONT_BODY,
                }}
              >
                Simulacao: 10 vendas = {simulateCommission(10)} | 100 vendas ={' '}
                {simulateCommission(100)}
              </div>
            )}
          </div>

          {/* Approval mode */}
          <div style={card}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: '#E0DDD8',
                fontFamily: FONT_BODY,
                marginBottom: 16,
              }}
            >
              Aprovacao
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              {(['auto', 'manual'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setApprovalMode(mode)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: approvalMode === mode ? 'rgba(232,93,48,.08)' : '#19191C',
                    border: approvalMode === mode ? `1px solid ${EMBER}` : '1px solid #222226',
                    borderRadius: 6,
                    color: approvalMode === mode ? EMBER : '#6E6E73',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: FONT_BODY,
                  }}
                >
                  {mode === 'auto' ? 'Automatica' : 'Manual'}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          width: '100%',
          padding: '14px',
          background: saving ? '#222226' : EMBER,
          border: 'none',
          borderRadius: 6,
          color: '#0A0A0C',
          fontSize: 14,
          fontWeight: 700,
          cursor: saving ? 'not-allowed' : 'pointer',
          fontFamily: FONT_BODY,
        }}
      >
        {saved ? 'Salvo!' : saving ? 'Salvando...' : 'Salvar configuracoes'}
      </button>
    </div>
  );
}
