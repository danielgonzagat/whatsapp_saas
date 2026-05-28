'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';

const sora = "var(--font-sora), 'Sora', sans-serif";
const jetbrains = "var(--font-jetbrains), 'JetBrains Mono', monospace";

interface AuthHeaderProps {
  mode: 'login' | 'register';
  affiliateInviteToken?: string;
  affiliateInviteWorkspaceName?: string;
}

export function AuthHeader({
  mode,
  affiliateInviteToken,
  affiliateInviteWorkspaceName,
}: AuthHeaderProps) {
  return (
    <div
      style={{
        marginBottom: 36,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 12,
      }}
    >
      <span
        style={{
          fontFamily: jetbrains,
          fontSize: 11,
          fontWeight: 500,
          color: colors.ember.primary,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
        }}
      >
        {mode === 'login' ? kloelT('Acesso seguro') : kloelT('Nova conta')}
      </span>
      <h1
        style={{
          fontFamily: sora,
          fontSize: 'clamp(28px, 4vw, 34px)',
          fontWeight: 700,
          color: colors.text.silver,
          lineHeight: 1.12,
          margin: 0,
          textWrap: 'balance' as const,
        }}
      >
        {mode === 'login' ? kloelT('Entrar') : kloelT('Criar conta')}
      </h1>
      <p
        style={{
          fontFamily: sora,
          fontSize: 14,
          color: colors.text.muted,
          lineHeight: 1.6,
          margin: 0,
          maxWidth: 340,
          textWrap: 'balance' as const,
        }}
      >
        {mode === 'login'
          ? kloelT('Acesse sua conta.')
          : kloelT(
              'Crie sua conta e comece a usar a inteligencia comercial autonoma.',
            )}
      </p>
      {mode === 'register' && affiliateInviteToken ? (
        <p
          style={{
            fontFamily: jetbrains,
            fontSize: 11,
            color: colors.ember.primary,
            lineHeight: 1.6,
            margin: 0,
            maxWidth: 360,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          {affiliateInviteWorkspaceName
            ? kloelT(
                `Convite de afiliado para ${affiliateInviteWorkspaceName}`,
              )
            : kloelT('Convite de afiliado detectado')}
        </p>
      ) : null}
    </div>
  );
}
