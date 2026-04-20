'use client';

import { apiFetch } from '@/lib/api';
import { useEffect, useRef, useState } from 'react';
import { mutate } from 'swr';

const SORA = "var(--font-sora), 'Sora', sans-serif";
const V = {
  s: 'var(--bg-space, #111113)',
  e: 'var(--bg-nebula, #19191C)',
  b: 'var(--border-space, #222226)',
  em: '#E85D30',
  t: 'var(--text-starlight, #E0DDD8)',
  t2: 'var(--text-moonlight, #6E6E73)',
  t3: 'var(--text-dust, #3A3A3F)',
  ta: 'var(--app-text-on-accent, #0A0A0C)',
  g: '#10B981',
};

function Toggle({
  label,
  checked,
  onChange,
  desc,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  desc?: string;
}) {
  return (
    <div
      onClick={() => onChange(!checked)}
      role="switch"
      tabIndex={0}
      aria-checked={checked}
      aria-label={label}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 0',
        borderBottom: `1px solid ${V.b}08`,
        cursor: 'pointer',
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          (e.currentTarget as HTMLElement).click();
        }
      }}
    >
      <div>
        <span style={{ fontSize: 12, color: V.t2, fontFamily: SORA }}>{label}</span>
        {desc && (
          <span style={{ display: 'block', fontSize: 10, color: V.t3, marginTop: 2 }}>{desc}</span>
        )}
      </div>
      <div
        style={{
          width: 36,
          height: 20,
          borderRadius: 10,
          background: checked ? V.g : V.b,
          position: 'relative',
          transition: 'background .2s',
        }}
      >
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: 8,
            background: '#fff',
            position: 'absolute',
            top: 2,
            left: checked ? 18 : 2,
            transition: 'left .2s',
          }}
        />
      </div>
    </div>
  );
}

export function ProductAfterPayTab({ productId }: { productId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (savedTimer.current) {
        clearTimeout(savedTimer.current);
      }
    },
    [],
  );
  const [duplicateAddress, setDuplicateAddress] = useState(false);
  const [affiliateCharge, setAffiliateCharge] = useState(false);
  const [chargeValue, setChargeValue] = useState('');
  const [shippingProvider, setShippingProvider] = useState('');

  useEffect(() => {
    interface ProductAfterPayPayload {
      afterPayDuplicateAddress?: boolean;
      afterPayAffiliateCharge?: boolean;
      afterPayChargeValue?: number;
      afterPayShippingProvider?: string;
    }
    apiFetch<ProductAfterPayPayload>(`/products/${productId}`)
      .then((res) => {
        const p = res?.data;
        if (p) {
          setDuplicateAddress(p.afterPayDuplicateAddress ?? false);
          setAffiliateCharge(p.afterPayAffiliateCharge ?? false);
          setChargeValue(p.afterPayChargeValue ? String(p.afterPayChargeValue) : '');
          setShippingProvider(p.afterPayShippingProvider ?? '');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [productId]);

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch(`/products/${productId}`, {
        method: 'PUT',
        body: {
          afterPayDuplicateAddress: duplicateAddress,
          afterPayAffiliateCharge: affiliateCharge,
          afterPayChargeValue: chargeValue ? Number.parseFloat(chargeValue) : null,
          afterPayShippingProvider: shippingProvider || null,
        },
      });
      mutate((key: unknown) => typeof key === 'string' && key.startsWith('/products'));
      setSaved(true);
      if (savedTimer.current) {
        clearTimeout(savedTimer.current);
      }
      savedTimer.current = setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error('Erro ao salvar AfterPay config:', e);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: V.t2, fontFamily: SORA }}>
        Carregando...
      </div>
    );
  }

  return (
    <div>
      <h2
        style={{ fontSize: 16, fontWeight: 600, color: V.t, margin: '0 0 20px', fontFamily: SORA }}
      >
        Configuracoes After Pay
      </h2>

      <div
        style={{
          background: V.s,
          border: `1px solid ${V.b}`,
          borderRadius: 6,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <h3
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: V.t,
            margin: '0 0 12px',
            fontFamily: SORA,
          }}
        >
          Configuracoes de Venda
        </h3>
        <Toggle
          label="Permitir endereco duplicado na venda pos-paga?"
          checked={duplicateAddress}
          onChange={setDuplicateAddress}
        />
      </div>

      <div
        style={{
          background: V.s,
          border: `1px solid ${V.b}`,
          borderRadius: 6,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <h3
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: V.t,
            margin: '0 0 12px',
            fontFamily: SORA,
          }}
        >
          Configuracoes de Afiliados
        </h3>
        <Toggle
          label="Cobranca do afiliado por pedido frustrado?"
          checked={affiliateCharge}
          onChange={setAffiliateCharge}
        />
        <div style={{ marginTop: 12 }}>
          <span
            style={{
              display: 'block',
              fontSize: 10,
              fontWeight: 600,
              color: V.t3,
              letterSpacing: '.08em',
              textTransform: 'uppercase' as const,
              marginBottom: 6,
              fontFamily: SORA,
            }}
          >
            Valor cobranca (R$)
          </span>
          <input
            value={chargeValue}
            onChange={(e) => setChargeValue(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px',
              background: V.e,
              border: `1px solid ${V.b}`,
              borderRadius: 6,
              color: V.t,
              fontSize: 13,
              fontFamily: SORA,
              outline: 'none',
            }}
            placeholder="0,00"
          />
        </div>
      </div>

      <div style={{ background: V.s, border: `1px solid ${V.b}`, borderRadius: 6, padding: 16 }}>
        <h3
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: V.t,
            margin: '0 0 12px',
            fontFamily: SORA,
          }}
        >
          Configuracoes de Envio
        </h3>
        <div style={{ marginBottom: 12 }}>
          <span
            style={{
              display: 'block',
              fontSize: 10,
              fontWeight: 600,
              color: V.t3,
              letterSpacing: '.08em',
              textTransform: 'uppercase' as const,
              marginBottom: 6,
              fontFamily: SORA,
            }}
          >
            Provedor logistico
          </span>
          <select
            value={shippingProvider}
            onChange={(e) => setShippingProvider(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px',
              background: V.e,
              border: `1px solid ${V.b}`,
              borderRadius: 6,
              color: V.t,
              fontSize: 13,
              fontFamily: SORA,
              outline: 'none',
            }}
          >
            <option value="">Selecione um provedor</option>
            <option value="correios">Correios</option>
            <option value="jadlog">JadLog</option>
            <option value="melhor_envio">Melhor Envio</option>
          </select>
        </div>
      </div>

      <button
        type="button"
        onClick={save}
        disabled={saving}
        style={{
          width: '100%',
          marginTop: 16,
          padding: '12px',
          background: saving ? V.b : V.em,
          border: 'none',
          borderRadius: 6,
          color: V.ta,
          fontSize: 13,
          fontWeight: 700,
          cursor: saving ? 'not-allowed' : 'pointer',
          fontFamily: SORA,
        }}
      >
        {saved ? 'Salvo!' : saving ? 'Salvando...' : 'Salvar'}
      </button>
    </div>
  );
}
