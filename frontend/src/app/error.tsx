'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#0A0A0C',
        color: '#fff',
        fontFamily: 'Sora, sans-serif',
      }}
    >
      <h2 style={{ color: '#E85D30', marginBottom: 16 }}>Algo deu errado</h2>
      <p style={{ color: '#888', marginBottom: 24 }}>{error.message || 'Erro inesperado'}</p>
      <button
        onClick={reset}
        style={{
          background: '#E85D30',
          color: '#fff',
          border: 'none',
          padding: '12px 24px',
          borderRadius: 6,
          cursor: 'pointer',
          fontFamily: 'Sora, sans-serif',
          fontWeight: 600,
        }}
      >
        Tentar novamente
      </button>
    </div>
  );
}
