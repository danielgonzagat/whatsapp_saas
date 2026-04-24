'use client';

import { kloelT } from '@/lib/i18n/t';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import Image from 'next/image';
import type { SelectableProduct } from './WhatsAppExperience.helpers';
import { getProductIcon, formatMoney } from './WhatsAppExperience.helpers';
import {
  panelMiniStatStyle,
  panelMiniLabelStyle,
  panelMiniValueStyle,
} from './WhatsAppExperience.ui-atoms';

const E = '#E85D30';
const G = '#10B981';
const P = '#7F66FF';
const T = KLOEL_THEME.textPrimary;
const S = KLOEL_THEME.textSecondary;
const D = KLOEL_THEME.textPlaceholder;
const C = KLOEL_THEME.bgCard;
const U = KLOEL_THEME.bgSecondary;
const B = KLOEL_THEME.borderPrimary;
const V = KLOEL_THEME.bgPrimary;
const F = "'Sora', system-ui, sans-serif";
const M = "'JetBrains Mono', monospace";

export function NonWahaProviderHint() {
  return (
    <div
      style={{
        maxWidth: 420,
        margin: '0 auto',
        border: `1px solid ${B}`,
        borderRadius: 6,
        padding: '18px 20px',
        background: C,
        color: S,
        fontSize: 13,
        lineHeight: 1.7,
      }}
    >
      {kloelT(
        `O provider ativo deste workspace nao esta em WAHA. O QR Code so aparece quando o runtime do WhatsApp opera em`,
      )}{' '}
      <span style={{ color: E, fontWeight: 600 }}>WAHA</span>
      {kloelT(
        `. Atualize o provider do backend e recarregue esta tela para iniciar a conexao por QR.`,
      )}
    </div>
  );
}

export function ConnectedCelebration() {
  return (
    <div style={{ animation: 'celebrate .5s ease both' }}>
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: `${G}15`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px',
          fontSize: 28,
        }}
      >
        ✓
      </div>
      <p style={{ fontSize: 15, fontWeight: 600, color: G, fontFamily: F }}>
        {kloelT(`WhatsApp conectado com sucesso!`)}
      </p>
    </div>
  );
}

export function ActivatedScreen() {
  return (
    <div style={{ background: V, minHeight: '100%', color: T, fontFamily: F, borderRadius: 12 }}>
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes loading { from { transform: translateX(-100%); } to { transform: translateX(0); } }
        .fade-in { animation: fadeUp .5s ease both; }
      `}</style>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 24px' }}>
        <div className="fade-in" style={{ textAlign: 'center', paddingTop: 40 }}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>{kloelT(`Kloel`)}</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: G, marginBottom: 8, fontFamily: F }}>
            {kloelT(`IA Ativada!`)}
          </h2>
          <p style={{ fontSize: 13, color: S, marginBottom: 24, fontFamily: F }}>
            {kloelT(`Redirecionando para o painel do WhatsApp...`)}
          </p>
          <div
            style={{
              width: 200,
              height: 3,
              background: U,
              borderRadius: 2,
              margin: '0 auto',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                background: G,
                borderRadius: 2,
                animation: 'loading 1.5s ease forwards',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: C, border: `1px solid ${B}`, borderRadius: 6, padding: 16 }}>
      <div
        style={{
          fontFamily: F,
          fontSize: 10,
          color: D,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ fontFamily: M, fontSize: 13, color: T, wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}

export function FeedCard({ liveFeed }: { liveFeed: string[] }) {
  const items = liveFeed.length > 0 ? liveFeed : ['Aguardando mensagens do WhatsApp...'];
  return (
    <div style={{ background: C, border: `1px solid ${B}`, borderRadius: 6, padding: 16 }}>
      <div
        style={{
          fontFamily: F,
          fontSize: 11,
          color: D,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          marginBottom: 12,
        }}
      >
        {kloelT(`Feed de mensagens ao vivo`)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.slice(0, 18).map((message) => (
          <div
            key={message}
            style={{
              background: U,
              border: `1px solid ${B}`,
              borderRadius: 6,
              padding: 12,
              fontFamily: M,
              fontSize: 11,
              color: T,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {message}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProductPerformanceCard({
  product,
}: {
  product: SelectableProduct & { salesCount: number; revenue: number };
}) {
  const badge =
    product.type === 'affiliate'
      ? { background: '#7F66FF20', color: P, label: `AFILIADO ${product.affiliateComm ?? 0}%` }
      : { background: `${G}15`, color: G, label: 'PRODUTOR' };

  return (
    <div style={{ background: C, border: `1px solid ${B}`, borderRadius: 6, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 6,
            background: U,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            fontSize: 24,
          }}
        >
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={product.name}
              width={40}
              height={40}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            getProductIcon(product)
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T, marginBottom: 4 }}>
            {product.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: M, fontSize: 11, color: E, fontWeight: 700 }}>
              {formatMoney(product.price)}
            </span>
            <span
              style={{
                fontSize: 9,
                fontFamily: M,
                background: badge.background,
                color: badge.color,
                padding: '2px 6px',
                borderRadius: 3,
                fontWeight: 600,
              }}
            >
              {badge.label}
            </span>
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
        <div style={panelMiniStatStyle}>
          <div style={panelMiniLabelStyle}>{kloelT(`Vendas`)}</div>
          <div style={panelMiniValueStyle}>{product.salesCount}</div>
        </div>
        <div style={panelMiniStatStyle}>
          <div style={panelMiniLabelStyle}>{kloelT(`Receita`)}</div>
          <div style={panelMiniValueStyle}>{formatMoney(product.revenue)}</div>
        </div>
      </div>
    </div>
  );
}
