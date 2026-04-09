'use client';

import type { CSSProperties } from 'react';

const shellStyle: CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '32px 20px',
  background: '#0A0A0C',
  color: '#E0DDD8',
  fontFamily: "var(--font-sora), 'Sora', sans-serif",
};

const cardStyle: CSSProperties = {
  width: '100%',
  maxWidth: 520,
  borderRadius: 12,
  border: '1px solid rgba(232, 93, 48, 0.18)',
  background: 'rgba(17, 17, 20, 0.96)',
  boxShadow: '0 24px 64px rgba(0, 0, 0, 0.34)',
  padding: '32px 28px',
};

const titleStyle: CSSProperties = {
  fontSize: 26,
  lineHeight: 1.1,
  letterSpacing: '-0.03em',
  margin: 0,
};

const textStyle: CSSProperties = {
  fontSize: 14,
  lineHeight: 1.7,
  color: '#ADADB0',
  margin: '14px 0 24px',
};

const buttonRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 10,
};

const primaryButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 164,
  padding: '12px 18px',
  borderRadius: 8,
  border: 'none',
  background: '#E85D30',
  color: '#FFFFFF',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const secondaryButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  background: 'transparent',
  color: '#E0DDD8',
  border: '1px solid rgba(224, 221, 216, 0.16)',
};

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body style={shellStyle}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>O Kloel encontrou uma falha inesperada.</h1>
          <p style={textStyle}>
            Recarregue esta tela ou volte para o painel. Se o problema continuar, verifique esta
            operação novamente em alguns instantes.
          </p>
          {process.env.NODE_ENV === 'development' && error?.message ? (
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontSize: 12,
                lineHeight: 1.6,
                color: '#9B9BA0',
                margin: '0 0 20px',
              }}
            >
              {error.message}
            </pre>
          ) : null}
          <div style={buttonRowStyle}>
            <button type="button" style={primaryButtonStyle} onClick={() => reset()}>
              Tentar novamente
            </button>
            <button
              type="button"
              style={secondaryButtonStyle}
              onClick={() => window.location.assign('/dashboard')}
            >
              Ir para o painel
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
