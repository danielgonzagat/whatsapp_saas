'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors, typography, motion as dtMotion } from '@/lib/design-tokens';
import { KloelBrandLockup } from '@/components/kloel/KloelBrand';
import { ArrowRight, Bot, MessageSquare, Zap } from 'lucide-react';
import Link from 'next/link';

interface OnboardingChatHeroProps {
  loginUrl: string;
}

const sellingPoints = [
  {
    icon: Bot,
    titleKey: 'IA que conversa de verdade',
    descKey:
      'A Kloel entende seu negócio e configura tudo automaticamente enquanto vocês conversam.',
  },
  {
    icon: Zap,
    titleKey: 'Pronto em minutos',
    descKey:
      'Sem formulários longos. Conte sobre seu produto e a IA prepara seu checkout, catálogo e WhatsApp.',
  },
  {
    icon: MessageSquare,
    titleKey: 'Venda pelo WhatsApp',
    descKey:
      'Ao final da configuração, conecte seu WhatsApp e comece a vender com atendimento automático.',
  },
];

export function OnboardingChatHero({ loginUrl }: OnboardingChatHeroProps) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: colors.background.void,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 16px',
      }}
    >
      {/* Brand mark */}
      <div style={{ marginBottom: 48 }}>
        <Link
          href="/"
          style={{
            color: 'inherit',
            textDecoration: 'none',
            cursor: 'pointer',
            display: 'block',
          }}
        >
          <KloelBrandLockup markSize={32} fontSize={22} fontWeight={700} />
        </Link>
      </div>

      {/* Hero content */}
      <div
        style={{
          textAlign: 'center',
          maxWidth: 560,
          width: '100%',
          marginBottom: 56,
        }}
      >
        {/* Label */}
        <span
          style={{
            fontFamily: typography.fontFamily.mono,
            fontSize: typography.fontSize.tiny[0],
            fontWeight: typography.fontSize.tiny[1].fontWeight,
            color: colors.ember.primary,
            letterSpacing: typography.fontSize.tiny[1].letterSpacing,
            textTransform: 'uppercase',
          }}
        >
          {kloelT('Onboarding inteligente')}
        </span>

        {/* Headline */}
        <h1
          style={{
            fontFamily: typography.fontFamily.sans,
            fontSize: 'clamp(28px, 4vw, 36px)',
            fontWeight: 700,
            color: colors.text.silver,
            lineHeight: 1.12,
            margin: '12px 0 0',
            textWrap: 'balance',
          }}
        >
          {kloelT('Sua conta Kloel em uma conversa')}
        </h1>

        {/* Subheadline */}
        <p
          style={{
            fontFamily: typography.fontFamily.sans,
            fontSize: typography.fontSize.subheadline[0],
            color: colors.text.muted,
            lineHeight: typography.fontSize.subheadline[1].lineHeight,
            margin: '16px 0 0',
            textWrap: 'balance',
          }}
        >
          {kloelT(
            'Converse com a Kloel e ela configura seu checkout, catálogo de produtos e canal de vendas automaticamente.',
          )}
        </p>
      </div>

      {/* Selling points */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 24,
          maxWidth: 780,
          width: '100%',
          marginBottom: 56,
        }}
      >
        {sellingPoints.map((point) => {
          const Icon = point.icon;
          return (
            <div
              key={point.titleKey}
              style={{
                background: colors.background.surface,
                border: `1px solid ${colors.border.void}`,
                borderRadius: 12,
                padding: 24,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  background: colors.ember.bg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Icon
                  style={{ width: 20, height: 20, color: colors.ember.primary }}
                  aria-hidden="true"
                />
              </div>
              <h3
                style={{
                  fontFamily: typography.fontFamily.sans,
                  fontSize: typography.fontSize.h3[0],
                  fontWeight: typography.fontSize.h3[1].fontWeight,
                  color: colors.text.silver,
                  margin: 0,
                }}
              >
                {kloelT(point.titleKey)}
              </h3>
              <p
                style={{
                  fontFamily: typography.fontFamily.sans,
                  fontSize: typography.fontSize.bodySmall[0],
                  color: colors.text.muted,
                  lineHeight: typography.fontSize.bodySmall[1].lineHeight,
                  margin: 0,
                }}
              >
                {kloelT(point.descKey)}
              </p>
            </div>
          );
        })}
      </div>

      {/* CTA */}
      <Link
        href={loginUrl}
        style={{
          fontFamily: typography.fontFamily.sans,
          fontSize: typography.fontSize.body[0],
          fontWeight: typography.fontWeight.semibold,
          color: colors.text.silver,
          background: colors.ember.primary,
          border: 'none',
          borderRadius: 12,
          padding: '14px 32px',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          textDecoration: 'none',
          transition: `opacity ${dtMotion.duration.fast} ${dtMotion.easing.default}`,
        }}
        onMouseEnter={(e) => {
          (e.target as HTMLAnchorElement).style.opacity = '0.9';
        }}
        onMouseLeave={(e) => {
          (e.target as HTMLAnchorElement).style.opacity = '1';
        }}
      >
        {kloelT('Entrar para começar')}
        <ArrowRight style={{ width: 20, height: 20 }} aria-hidden="true" />
      </Link>

      {/* Footer note */}
      <p
        style={{
          fontFamily: typography.fontFamily.sans,
          fontSize: typography.fontSize.caption[0],
          color: colors.text.dim,
          marginTop: 24,
          marginBottom: 0,
          textAlign: 'center',
        }}
      >
        {kloelT('Já tem uma conta?')}{' '}
        <Link
          href={loginUrl}
          style={{
            color: colors.ember.primary,
            textDecoration: 'none',
            cursor: 'pointer',
          }}
        >
          {kloelT('Entrar')}
        </Link>
      </p>
    </div>
  );
}
