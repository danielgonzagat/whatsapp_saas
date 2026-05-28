'use client';

import Link from 'next/link';
import { CheckCircle2, MessageSquare } from 'lucide-react';

import { KloelBrandLockup } from '@/components/kloel/KloelBrand';
import { colors, typography } from '@/lib/design-tokens';
import { kloelT } from '@/lib/i18n/t';

interface OnboardingChatHeaderProps {
  messagesCount?: number | undefined;
  userName: string | null;
  userEmail: string | null;
}

/**
 * Page header for the conversational onboarding shell. Renders the
 * Kloel lockup, a `messagesCount` hint and the authenticated user's name
 * (or email fallback). Pure presentation — receives every value via props.
 */
export function OnboardingChatHeader({
  messagesCount,
  userName,
  userEmail,
}: OnboardingChatHeaderProps) {
  const showMessageCount = (messagesCount ?? 0) > 0;
  const identityLabel = userName || userEmail;
  return (
    <header
      style={{
        padding: '16px',
        borderBottom: `1px solid ${colors.border.void}`,
      }}
    >
      <div
        style={{
          maxWidth: '1024px',
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div>
          <Link href="/" style={{ color: 'inherit', textDecoration: 'none', cursor: 'pointer' }}>
            <KloelBrandLockup markSize={22} fontSize={18} fontWeight={600} />
          </Link>
          <p
            style={{
              fontFamily: typography.fontFamily.sans,
              fontSize: typography.fontSize.bodySmall[0],
              color: colors.text.muted,
              lineHeight: typography.fontSize.bodySmall[1].lineHeight,
            }}
          >
            {kloelT(`Configuração Inteligente`)}
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
          {showMessageCount && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontFamily: typography.fontFamily.sans,
                fontSize: typography.fontSize.bodySmall[0],
                color: colors.text.muted,
              }}
            >
              <MessageSquare style={{ width: 16, height: 16 }} aria-hidden="true" />
              {messagesCount} mensagens
            </div>
          )}
          {identityLabel ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontFamily: typography.fontFamily.sans,
                fontSize: typography.fontSize.bodySmall[0],
                color: colors.ember.primary,
              }}
            >
              <CheckCircle2 style={{ width: 16, height: 16 }} aria-hidden="true" />
              <span>{identityLabel}</span>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
