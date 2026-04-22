'use client';

import { KLOEL_THEME } from '@/lib/kloel-theme';
import { usePathname, useRouter } from 'next/navigation';
import { startTransition, type ReactNode } from 'react';
import { MARKETING_META_TABS } from './meta-marketing.helpers';

const SORA = "'Sora', sans-serif";
const MONO = "'JetBrains Mono', monospace";

export function MetaMarketingShell({
  title,
  eyebrow,
  description,
  banner,
  children,
}: {
  title: string;
  eyebrow: string;
  description: string;
  banner?: string | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: 24,
        color: KLOEL_THEME.textPrimary,
        fontFamily: SORA,
      }}
    >
      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            gap: 4,
            overflowX: 'auto',
            paddingBottom: 8,
            marginBottom: 24,
          }}
        >
          {MARKETING_META_TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <button
                type="button"
                key={tab.href}
                onClick={() => {
                  if (pathname === tab.href) return;
                  startTransition(() => {
                    router.push(tab.href);
                  });
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: 10,
                  padding: '10px 14px',
                  background: active ? `${KLOEL_THEME.accent}18` : 'transparent',
                  color: active ? KLOEL_THEME.accent : KLOEL_THEME.textSecondary,
                  fontFamily: SORA,
                  fontSize: 12,
                  whiteSpace: 'nowrap',
                }}
              >
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: MONO,
                    fontSize: 10,
                    background: active ? `${KLOEL_THEME.accent}20` : KLOEL_THEME.bgSecondary,
                  }}
                >
                  {tab.icon}
                </span>
                {tab.label}
              </button>
            );
          })}
        </div>

        {banner ? (
          <div
            style={{
              marginBottom: 20,
              borderRadius: 14,
              border: `1px solid ${KLOEL_THEME.accent}33`,
              background: `${KLOEL_THEME.accent}14`,
              color: KLOEL_THEME.textPrimary,
              padding: '14px 16px',
              fontSize: 13,
            }}
          >
            {banner}
          </div>
        ) : null}

        <div
          style={{
            display: 'grid',
            gap: 18,
            background: KLOEL_THEME.bgCard,
            border: `1px solid ${KLOEL_THEME.borderPrimary}`,
            borderRadius: 20,
            padding: 24,
          }}
        >
          <div style={{ display: 'grid', gap: 8 }}>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 11,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: KLOEL_THEME.accent,
              }}
            >
              {eyebrow}
            </div>
            <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.1 }}>{title}</h1>
            <p
              style={{
                margin: 0,
                maxWidth: 780,
                fontSize: 14,
                lineHeight: 1.7,
                color: KLOEL_THEME.textSecondary,
              }}
            >
              {description}
            </p>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
