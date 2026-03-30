import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      flex: 1, background: '#0A0A0C', padding: 40, minHeight: '60vh',
    }}>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 80, fontWeight: 700,
        color: '#E85D30', lineHeight: 1, marginBottom: 16,
      }}>
        404
      </div>
      <h2 style={{ fontFamily: "'Sora', sans-serif", fontSize: 20, fontWeight: 600, color: '#E0DDD8', marginBottom: 8 }}>
        Pagina nao encontrada
      </h2>
      <p style={{
        fontFamily: "'Sora', sans-serif", fontSize: 14, color: '#6E6E73',
        textAlign: 'center', maxWidth: 400, lineHeight: 1.6, marginBottom: 32,
      }}>
        A pagina que voce esta procurando nao existe ou foi movida.
      </p>
      <Link
        href="/dashboard"
        style={{
          fontFamily: "'Sora', sans-serif", fontSize: 13, fontWeight: 600,
          padding: '10px 24px', borderRadius: 6, border: '1px solid #222226',
          background: 'transparent', color: '#E0DDD8', textDecoration: 'none',
        }}
      >
        Voltar ao Dashboard
      </Link>
    </div>
  );
}
