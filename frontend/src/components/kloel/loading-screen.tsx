'use client';

export default function KloelLoading() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        background: '#0A0A0C',
        color: '#E0DDD8',
        fontFamily: "'Sora', sans-serif",
      }}
    >
      <div
        style={{
          fontSize: 20,
          fontWeight: 700,
          letterSpacing: '-0.03em',
        }}
      >
        Kloel
      </div>
      <div
        style={{
          fontSize: 10,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          color: '#6E6E73',
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        Iniciando sistema
      </div>
    </div>
  );
}

export { KloelLoading as KloelLoadingScreen };
