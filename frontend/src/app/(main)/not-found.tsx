import Link from 'next/link';
import { KloelMushroomVisual, KloelWordmark } from '@/components/kloel/KloelBrand';

const sora = "var(--font-sora), 'Sora', sans-serif";
const jetbrains = "var(--font-jetbrains), 'JetBrains Mono', monospace";

export default function NotFound() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        background:
          'radial-gradient(circle at top, rgba(232, 93, 48, 0.12), transparent 36%), #0A0A0C',
        padding: 40,
        minHeight: '60vh',
        textAlign: 'center',
      }}
    >
      <div style={{ marginBottom: 24 }}>
        <KloelMushroomVisual size={84} traceColor="#FFFFFF" spores="static" />
      </div>
      <div style={{ marginBottom: 10 }}>
        <KloelWordmark color="#E0DDD8" fontSize={18} fontWeight={600} />
      </div>
      <div
        style={{
          fontFamily: jetbrains,
          fontSize: 56,
          fontWeight: 700,
          color: '#E85D30',
          lineHeight: 1,
          marginBottom: 10,
        }}
      >
        404
      </div>
      <h2
        style={{
          fontFamily: sora,
          fontSize: 22,
          fontWeight: 600,
          color: '#E0DDD8',
          margin: 0,
        }}
      >
        Esta rota nao floresceu
      </h2>
      <p
        style={{
          fontFamily: sora,
          fontSize: 14,
          color: '#6E6E73',
          textAlign: 'center',
          maxWidth: 420,
          lineHeight: 1.6,
          margin: '10px 0 28px',
        }}
      >
        A pagina que voce procura nao existe mais ou foi movida para outra trilha da plataforma.
      </p>
      <Link
        href="/"
        style={{
          fontFamily: sora,
          fontSize: 13,
          fontWeight: 600,
          padding: '10px 24px',
          borderRadius: 8,
          border: '1px solid #222226',
          background: 'transparent',
          color: '#E0DDD8',
          textDecoration: 'none',
        }}
      >
        Voltar ao dashboard
      </Link>
    </div>
  );
}
