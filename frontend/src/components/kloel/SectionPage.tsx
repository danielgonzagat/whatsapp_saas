'use client';

import { ReactNode, useState } from 'react';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import { KLOEL_THEME } from '@/lib/kloel-theme';

interface SectionPageProps {
  title: string;
  icon: string;
  description: string;
  back?: () => void;
  tags?: string[];
  children: ReactNode;
}

export function SectionPage({ title, icon, description, back, tags, children }: SectionPageProps) {
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const { isMobile } = useResponsiveViewport();

  return (
    <div
      style={{
        padding: isMobile ? 16 : 28,
        overflowY: 'auto',
        flex: 1,
        background: KLOEL_THEME.bgPrimary,
      }}
    >
      {/* Content */}
      <div
        style={{
          maxWidth: 940,
          margin: '0 auto',
        }}
      >
        {/* Back button */}
        {back && (
          <button
            onClick={back}
            style={{
              background: 'none',
              border: 'none',
              color: KLOEL_THEME.textSecondary,
              fontFamily: "'Sora', sans-serif",
              fontSize: 12,
              cursor: 'pointer',
              padding: 0,
              marginBottom: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M7.5 2.5L4 6l3.5 3.5"
                stroke={KLOEL_THEME.textSecondary}
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Voltar
          </button>
        )}

        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: isMobile ? 'flex-start' : 'center',
            flexDirection: isMobile ? 'column' : 'row',
            gap: 12,
            marginBottom: 24,
          }}
        >
          {/* Icon box */}
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 6,
              background: KLOEL_THEME.bgCard,
              border: `1px solid ${KLOEL_THEME.borderPrimary}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
              flexShrink: 0,
              color: KLOEL_THEME.textSecondary,
              boxShadow: KLOEL_THEME.shadowSm,
            }}
          >
            {icon}
          </div>

          <div>
            <h1
              style={{
                fontFamily: "'Sora', sans-serif",
                fontSize: 18,
                fontWeight: 600,
                color: KLOEL_THEME.textPrimary,
                margin: 0,
              }}
            >
              {title}
            </h1>
            <p
              style={{
                fontFamily: "'Sora', sans-serif",
                fontSize: 12,
                color: KLOEL_THEME.textTertiary,
                margin: '2px 0 0 0',
              }}
            >
              {description}
            </p>
          </div>
        </div>

        {/* Tags */}
        {tags && tags.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              marginBottom: 20,
            }}
          >
            {tags.map((tag) => (
              <TagButton
                key={tag}
                label={tag}
                active={activeTag === tag}
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              />
            ))}
          </div>
        )}

        {children}
      </div>
    </div>
  );
}

function TagButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '6px 14px',
        border: `1px solid ${active ? KLOEL_THEME.accent : hovered ? KLOEL_THEME.borderSecondary : KLOEL_THEME.borderPrimary}`,
        borderRadius: 6,
        fontFamily: "'Sora', sans-serif",
        fontSize: 12,
        color: active ? KLOEL_THEME.accent : KLOEL_THEME.textSecondary,
        background: active ? KLOEL_THEME.accentLight : 'transparent',
        cursor: 'pointer',
        transition: 'all 150ms ease',
      }}
    >
      {label}
    </button>
  );
}

export default SectionPage;
