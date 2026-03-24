'use client';

import { ReactNode, useState } from 'react';

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
        padding: 28,
        overflowY: 'auto',
        flex: 1,
        background: '#0A0A0C',
      }}
    >
      {/* Content */}
      <div
        style={{
          maxWidth: 940,
        }}
      >
        {/* Back button */}
        {back && (
          <button
            onClick={back}
            style={{
              background: 'none',
              border: 'none',
              color: '#6E6E73',
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
                stroke="#6E6E73"
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
            alignItems: 'center',
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
              background: '#111113',
              border: '1px solid #222226',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
              flexShrink: 0,
              color: '#6E6E73',
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
                color: '#E0DDD8',
                margin: 0,
              }}
            >
              {title}
            </h1>
            <p
              style={{
                fontFamily: "'Sora', sans-serif",
                fontSize: 12,
                color: '#3A3A3F',
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
        border: `1px solid ${active ? '#E85D30' : hovered ? '#333338' : '#222226'}`,
        borderRadius: 6,
        fontFamily: "'Sora', sans-serif",
        fontSize: 12,
        color: active ? '#E85D30' : '#6E6E73',
        background: active ? 'rgba(232, 93, 48, 0.06)' : 'transparent',
        cursor: 'pointer',
        transition: 'all 150ms ease',
      }}
    >
      {label}
    </button>
  );
}

export default SectionPage;
