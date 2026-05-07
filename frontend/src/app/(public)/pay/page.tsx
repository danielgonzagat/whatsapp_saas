import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { colors, typography } from '@/lib/design-tokens';

export const metadata: Metadata = {
  title: 'Pagamento | Kloel',
  description: 'Link de pagamento seguro da plataforma Kloel.',
  robots: { index: false, follow: false },
};

interface PayPageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function PayPage({ searchParams }: PayPageProps) {
  const params = await searchParams;
  const token = params.token;

  if (token && token.length > 0) {
    redirect(`/pay/${encodeURIComponent(token)}`);
  }

  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '40px 24px',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 440, width: '100%' }}>
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 6,
            background: colors.ember.bg,
            border: `1px solid ${colors.border.space}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 32px',
          }}
        >
          <span
            style={{
              fontFamily: typography.fontFamily.mono,
              fontSize: 32,
              color: colors.ember.primary,
              lineHeight: 1,
            }}
          >
            !
          </span>
        </div>

        <h1
          style={{
            fontFamily: typography.fontFamily.display,
            fontSize: 22,
            fontWeight: 600,
            color: colors.text.silver,
            margin: '0 0 12px',
            letterSpacing: '-0.01em',
          }}
        >
          Link de pagamento invalido ou expirado
        </h1>

        <p
          style={{
            fontFamily: typography.fontFamily.sans,
            fontSize: 14,
            color: colors.text.muted,
            lineHeight: 1.6,
            margin: '0 0 32px',
          }}
        >
          Este link de pagamento nao e valido. Solicite um novo link ao vendedor ou entre em contato
          com o suporte.
        </p>

        <Link
          href="/"
          style={{
            display: 'inline-block',
            background: colors.ember.primary,
            color: '#FFFFFF',
            fontFamily: typography.fontFamily.display,
            fontSize: 14,
            fontWeight: 600,
            padding: '12px 28px',
            borderRadius: 6,
            textDecoration: 'none',
            letterSpacing: '0.01em',
          }}
        >
          Voltar para o inicio
        </Link>

        <p
          style={{
            fontFamily: typography.fontFamily.sans,
            fontSize: 12,
            color: colors.text.dim,
            marginTop: 24,
          }}
        >
          Kloel Tecnologia LTDA
        </p>
      </div>
    </main>
  );
}
