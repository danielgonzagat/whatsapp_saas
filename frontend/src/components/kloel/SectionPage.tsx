'use client';

import { ReactNode, useState } from 'react';
import { colors, typography, motion } from '@/lib/design-tokens';
import { StarField } from './cosmos/StarField';

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

  return (
    <div
      style={{
        padding: 32,
        overflowY: 'auto',
        flex: 1,
        position: 'relative',
      }}
    >
      {/* Star background */}
      <StarField density={35} />

      {/* Content */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: 900,
        }}
      >
        {/* Back button */}
        {back && (
          <button
            onClick={back}
            style={{
              background: 'none',
              border: 'none',
              color: colors.accent.webb,
              fontFamily: typography.fontFamily.sans,
              fontSize: 12,
              cursor: 'pointer',
              padding: 0,
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M7.5 2.5L4 6l3.5 3.5"
                stroke={colors.accent.webb}
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Back
          </button>
        )}

        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            marginBottom: 24,
          }}
        >
          {/* Icon box */}
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: colors.background.nebula,
              border: `1px solid ${colors.border.space}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
              flexShrink: 0,
            }}
          >
            {icon}
          </div>

          <div>
            <h1
              style={{
                fontFamily: typography.fontFamily.display,
                fontSize: 22,
                fontWeight: 600,
                color: colors.text.starlight,
                margin: 0,
                letterSpacing: '0.02em',
              }}
            >
              {title}
            </h1>
            <p
              style={{
                fontFamily: typography.fontFamily.sans,
                fontSize: 13,
                color: colors.text.dust,
                margin: '4px 0 0 0',
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
        border: `1px solid ${active ? colors.accent.webb : hovered ? colors.border.glow : colors.border.space}`,
        borderRadius: 20,
        fontFamily: typography.fontFamily.sans,
        fontSize: 12,
        color: active ? colors.accent.webb : colors.text.moonlight,
        background: active ? 'rgba(78, 122, 224, 0.08)' : 'transparent',
        cursor: 'pointer',
        transition: `all ${motion.duration.normal} ${motion.easing.gravity}`,
      }}
    >
      {label}
    </button>
  );
}

export default SectionPage;
