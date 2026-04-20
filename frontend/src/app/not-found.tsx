import { kloelT } from '@/lib/i18n/t';
import Link from 'next/link';
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
  maxWidth: 480,
  borderRadius: 12,
  border: '1px solid rgba(232, 93, 48, 0.18)',
  background: 'rgba(17, 17, 20, 0.96)',
  boxShadow: '0 24px 64px rgba(0, 0, 0, 0.34)',
  padding: '32px 28px',
  textAlign: 'center',
};

const eyebrowStyle: CSSProperties = {
  fontSize: 11,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: '#9B9BA0',
  marginBottom: 12,
};

const titleStyle: CSSProperties = {
  fontSize: 28,
  lineHeight: 1.08,
  letterSpacing: '-0.03em',
  margin: 0,
};

const bodyStyle: CSSProperties = {
  fontSize: 14,
  lineHeight: 1.7,
  color: '#ADADB0',
  margin: '14px 0 24px',
};

const ctaStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 168,
  padding: '12px 18px',
  borderRadius: 8,
  border: 'none',
  background: '#E85D30',
  color: '#FFFFFF',
  textDecoration: 'none',
  fontSize: 13,
  fontWeight: 600,
};

/** Not found. */
export default function NotFound() {
  return (
    <div style={shellStyle}>
      <div style={cardStyle}>
        <div style={eyebrowStyle}>{kloelT(`Erro 404`)}</div>
        <h1 style={titleStyle}>{kloelT(`Esta rota não existe mais no Kloel.`)}</h1>
        <p style={bodyStyle}>
          
          {kloelT(`O endereço pode ter mudado, ou esse conteúdo não está disponível nesta conta.`)}
        </p>
        <Link href="/dashboard" style={ctaStyle}>
          
          {kloelT(`Voltar ao painel`)}
        </Link>
      </div>
    </div>
  );
}
