'use client';
import { buildPayUrl, isValidCheckoutCode } from '@/lib/subdomains';
import { useCallback, useEffect, useRef, useState } from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  planName: string;
  planSlug: string;
  referenceCode: string;
}

function CopyIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

const VOID = 'var(--bg-void, #0A0A0C)';
const SURFACE = 'var(--bg-space, #111113)';
const ELEVATED = 'var(--bg-nebula, #19191C)';
const BORDER = 'var(--border-space, #222226)';
const TEXT = 'var(--text-starlight, #E0DDD8)';
const SECONDARY = 'var(--text-moonlight, #6E6E73)';
const OVERLAY = 'var(--cookie-overlay, rgba(0,0,0,0.6))';
const SHADOW = 'var(--cookie-shadow, 0 20px 60px rgba(0,0,0,0.5))';

export function CheckoutLinksModal({ isOpen, onClose, planName, planSlug, referenceCode }: Props) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  const currentHost = typeof window !== 'undefined' ? window.location.host : undefined;
  const publicUrl =
    referenceCode && isValidCheckoutCode(referenceCode)
      ? buildPayUrl(`/${referenceCode}`, currentHost)
      : planSlug
        ? buildPayUrl(`/${planSlug}`, currentHost)
        : '';
  const codeUrl =
    referenceCode && isValidCheckoutCode(referenceCode)
      ? buildPayUrl(`/${referenceCode}`, currentHost)
      : '';
  const links = [
    publicUrl ? { label: 'URL publica', url: publicUrl } : null,
    codeUrl && codeUrl !== publicUrl ? { label: 'URL por codigo', url: codeUrl } : null,
  ].filter(Boolean) as Array<{ label: string; url: string }>;

  const handleCopy = useCallback((url: string, index: number) => {
    navigator.clipboard.writeText(url);
    setCopiedIndex(index);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopiedIndex(null), 2000);
  }, []);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: OVERLAY,
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: VOID,
          border: `1px solid ${BORDER}`,
          borderRadius: 6,
          maxWidth: 520,
          width: '100%',
          boxShadow: SHADOW,
          padding: 28,
          position: 'relative',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 24,
          }}
        >
          <h2
            style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: 16,
              fontWeight: 600,
              color: TEXT,
              margin: 0,
            }}
          >
            Links publicos deste plano
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: SECONDARY,
              padding: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 4,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = TEXT;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = SECONDARY;
            }}
          >
            <CloseIcon />
          </button>
        </div>

        {/* Plan name subtitle */}
        <div
          style={{
            fontFamily: "'Sora', sans-serif",
            fontSize: 12,
            fontWeight: 500,
            color: SECONDARY,
            marginBottom: 20,
          }}
        >
          Plano: <span style={{ color: '#E85D30' }}>{planName}</span>
        </div>

        {/* URL rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {links.map((link, index) => (
            <div key={link.label}>
              <div
                style={{
                  fontFamily: "'Sora', sans-serif",
                  fontSize: 10,
                  fontWeight: 600,
                  color: SECONDARY,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase' as const,
                  marginBottom: 6,
                }}
              >
                {link.label}
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <div
                  style={{
                    flex: 1,
                    backgroundColor: SURFACE,
                    border: `1px solid ${BORDER}`,
                    borderRadius: 6,
                    padding: '10px 14px',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 12,
                    color: TEXT,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap' as const,
                    userSelect: 'all' as const,
                  }}
                >
                  {link.url}
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(link.url, index)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    backgroundColor: copiedIndex === index ? 'rgba(16,185,129,0.12)' : ELEVATED,
                    border: `1px solid ${BORDER}`,
                    borderRadius: 6,
                    padding: '10px 14px',
                    cursor: 'pointer',
                    color: copiedIndex === index ? '#10B981' : TEXT,
                    fontFamily: "'Sora', sans-serif",
                    fontSize: 12,
                    fontWeight: 500,
                    whiteSpace: 'nowrap' as const,
                    minWidth: 90,
                    justifyContent: 'center',
                  }}
                >
                  {copiedIndex === index ? (
                    <>
                      <CheckIcon />
                      Copiado
                    </>
                  ) : (
                    <>
                      <CopyIcon />
                      Copiar
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
