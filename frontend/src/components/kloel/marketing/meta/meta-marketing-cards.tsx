'use client';

import { KLOEL_THEME } from '@/lib/kloel-theme';
import {
  type MetaLiveFeedMessage,
  compactNumber,
  formatFeedTimestamp,
  formatStatusLabel,
} from './meta-marketing.helpers';

const SORA = "'Sora', sans-serif";
const MONO = "'JetBrains Mono', monospace";

export function StatusBadge({ status, connected }: { status?: string | null; connected?: boolean }) {
  const ok = connected || String(status || '').toLowerCase() === 'connected';

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        borderRadius: 999,
        padding: '8px 12px',
        fontFamily: MONO,
        fontSize: 11,
        color: ok ? '#10B981' : KLOEL_THEME.accent,
        background: ok ? 'rgba(16,185,129,0.12)' : `${KLOEL_THEME.accent}14`,
        border: `1px solid ${ok ? 'rgba(16,185,129,0.28)' : `${KLOEL_THEME.accent}33`}`,
      }}
    >
      {formatStatusLabel(status, connected)}
    </div>
  );
}

export function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: KLOEL_THEME.bgSecondary,
        border: `1px solid ${KLOEL_THEME.borderPrimary}`,
        borderRadius: 16,
        padding: 16,
      }}
    >
      <div
        style={{
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: KLOEL_THEME.textPlaceholder,
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 15, lineHeight: 1.5, color: KLOEL_THEME.textPrimary }}>{value}</div>
    </div>
  );
}

export function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        background: KLOEL_THEME.bgSecondary,
        border: `1px solid ${KLOEL_THEME.borderPrimary}`,
        borderRadius: 16,
        padding: 16,
      }}
    >
      <div style={{ color: KLOEL_THEME.textSecondary, fontSize: 12, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{compactNumber(value)}</div>
    </div>
  );
}

export function FeedCard({ messages }: { messages: MetaLiveFeedMessage[] }) {
  return (
    <div
      style={{
        background: KLOEL_THEME.bgSecondary,
        border: `1px solid ${KLOEL_THEME.borderPrimary}`,
        borderRadius: 16,
        padding: 16,
        minHeight: 240,
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Fluxo recente do canal</div>
      <div style={{ display: 'grid', gap: 10 }}>
        {messages.length > 0 ? (
          messages.slice(0, 6).map((message) => (
            <div
              key={`${message.id || message.createdAt || message.content}`}
              style={{
                borderRadius: 12,
                border: `1px solid ${KLOEL_THEME.borderPrimary}`,
                padding: 12,
                background: KLOEL_THEME.bgCard,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  marginBottom: 8,
                  fontSize: 11,
                  color: KLOEL_THEME.textSecondary,
                }}
              >
                <span>{message.contactName || 'Contato'}</span>
                <span>{formatFeedTimestamp(message.createdAt)}</span>
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                {String(message.content || 'Mensagem sem texto')}
              </div>
            </div>
          ))
        ) : (
          <div style={{ color: KLOEL_THEME.textSecondary, fontSize: 13 }}>
            Ainda não há mensagens recentes para este canal neste workspace.
          </div>
        )}
      </div>
    </div>
  );
}

export function ActionButton({
  children,
  secondary = false,
  disabled = false,
  onClick,
}: {
  children: string;
  secondary?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        border: secondary ? `1px solid ${KLOEL_THEME.borderPrimary}` : 'none',
        borderRadius: 12,
        padding: '11px 16px',
        cursor: disabled ? 'default' : 'pointer',
        fontFamily: SORA,
        fontSize: 13,
        fontWeight: 700,
        color: secondary ? KLOEL_THEME.textPrimary : KLOEL_THEME.bgPrimary,
        background: secondary ? 'transparent' : KLOEL_THEME.accent,
        opacity: disabled ? 0.65 : 1,
      }}
    >
      {children}
    </button>
  );
}
