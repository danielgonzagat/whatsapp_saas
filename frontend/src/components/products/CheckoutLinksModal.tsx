'use client';
import { useState, useCallback, useRef, useEffect } from 'react';

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
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function CheckoutLinksModal({ isOpen, onClose, planName, planSlug, referenceCode }: Props) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const links = [
    planSlug ? { label: 'URL publica', url: `${origin}/${planSlug}` } : null,
    referenceCode ? { label: 'URL por codigo', url: `${origin}/r/${referenceCode}` } : null,
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
        backgroundColor: 'rgba(0,0,0,0.6)',
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
          backgroundColor: '#0A0A0C',
          border: '1px solid #222226',
          borderRadius: 6,
          maxWidth: 520,
          width: '100%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
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
              color: '#E0DDD8',
              margin: 0,
            }}
          >
            Links publicos deste plano
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#6E6E73',
              padding: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 4,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = '#E0DDD8';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = '#6E6E73';
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
            color: '#6E6E73',
            marginBottom: 20,
          }}
        >
          Plano: <span style={{ color: '#E85D30' }}>{planName}</span>
        </div>

        {/* URL rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {links.map((link, index) => (
            <div key={index}>
              <div
                style={{
                  fontFamily: "'Sora', sans-serif",
                  fontSize: 10,
                  fontWeight: 600,
                  color: '#6E6E73',
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
                    backgroundColor: '#111113',
                    border: '1px solid #222226',
                    borderRadius: 6,
                    padding: '10px 14px',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 12,
                    color: '#E0DDD8',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap' as const,
                    userSelect: 'all' as const,
                  }}
                >
                  {link.url}
                </div>
                <button
                  onClick={() => handleCopy(link.url, index)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    backgroundColor: copiedIndex === index ? 'rgba(16,185,129,0.12)' : '#19191C',
                    border: '1px solid #222226',
                    borderRadius: 6,
                    padding: '10px 14px',
                    cursor: 'pointer',
                    color: copiedIndex === index ? '#10B981' : '#E0DDD8',
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
