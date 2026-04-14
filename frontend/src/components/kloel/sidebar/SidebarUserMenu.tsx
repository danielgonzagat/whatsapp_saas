'use client';

import { useAuth } from '@/components/kloel/auth/auth-provider';
import { ThemeToggle } from '@/components/kloel/theme/ThemeToggle';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { buildMarketingUrl } from '@/lib/subdomains';
import { ChevronUp, Globe, LogOut, Settings } from 'lucide-react';
import { useRouter } from 'next/navigation';
import React, { useState, useRef, useEffect, useMemo } from 'react';

const S_RE = /\s+/;

// ============================================
// TYPES
// ============================================

interface SidebarUserMenuProps {
  expanded: boolean;
}

interface MenuItem {
  icon: React.ElementType;
  label: string;
  key: string;
  dividerAfter?: boolean;
}

// ============================================
// MENU ITEMS
// ============================================

const MENU_ITEMS: MenuItem[] = [
  { icon: Settings, label: 'Configuracoes', key: 'settings' },
  { icon: Globe, label: 'Idioma', key: 'language', dividerAfter: true },
  { icon: LogOut, label: 'Sair', key: 'logout' },
];

// ============================================
// COMPONENT
// ============================================

export function SidebarUserMenu({ expanded }: SidebarUserMenuProps) {
  const { userName, userEmail, signOut } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [avatarHovered, setAvatarHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const displayName = userName || 'Usuario';
  const displayEmail = userEmail || '';
  const initials = useMemo(() => {
    if (!userName) return 'U';
    const parts = userName.trim().split(S_RE);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0][0].toUpperCase();
  }, [userName]);
  // Close popup on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        borderTop: `1px solid ${KLOEL_THEME.borderSubtle}`,
        padding: expanded ? '12px 12px' : '12px 4px',
        transition: 'padding 150ms ease',
      }}
    >
      {/* Popup Menu — ONLY allowed shadow */}
      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: expanded ? '100%' : 0,
            left: expanded ? 8 : 'calc(100% + 8px)',
            width: expanded ? 'calc(100% - 16px)' : 240,
            backgroundColor: KLOEL_THEME.bgCard,
            border: `1px solid ${KLOEL_THEME.borderPrimary}`,
            borderRadius: 6,
            boxShadow: KLOEL_THEME.shadowLg,
            zIndex: 100,
            padding: '6px 0',
            marginBottom: 8,
            animation: 'fadeIn 150ms ease forwards',
            overflow: 'hidden',
          }}
        >
          {/* Email header */}
          <div
            style={{
              padding: '10px 16px 8px',
              borderBottom: `1px solid ${KLOEL_THEME.borderSubtle}`,
              marginBottom: 4,
            }}
          >
            <span
              style={{
                fontFamily: "'Sora', sans-serif",
                fontSize: 12,
                color: KLOEL_THEME.textTertiary,
              }}
            >
              {displayEmail}
            </span>
          </div>

          <div
            style={{
              padding: '10px 16px 12px',
              borderBottom: `1px solid ${KLOEL_THEME.borderSubtle}`,
              marginBottom: 4,
            }}
          >
            <ThemeToggle />
          </div>

          {/* Menu items */}
          {MENU_ITEMS.map((item) => {
            const Icon = item.icon;
            const isHovered = hoveredItem === item.key;

            return (
              <React.Fragment key={item.key}>
                <button
                  onClick={async () => {
                    if (item.key === 'logout') {
                      setOpen(false);
                      await signOut();
                      window.location.assign(buildMarketingUrl('/', window.location.host));
                      return;
                    } else if (item.key === 'settings') {
                      router.push('/settings');
                    } else if (item.key === 'language') {
                      router.push('/settings?section=idiomas');
                    } else if (item.key === 'help') {
                      router.push('/settings?section=ajuda');
                    } else if (item.key === 'upgrade') {
                      router.push('/pricing');
                    } else if (item.key === 'apps') {
                      router.push('/settings?section=apps');
                    } else if (item.key === 'gift') {
                      router.push('/settings?section=presentear');
                    } else if (item.key === 'learn-more') {
                      router.push('/settings?section=saiba-mais');
                    }
                    setOpen(false);
                  }}
                  onMouseEnter={() => setHoveredItem(item.key)}
                  onMouseLeave={() => setHoveredItem(null)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '10px 16px',
                    border: 'none',
                    outline: 'none',
                    cursor: 'pointer',
                    backgroundColor: isHovered ? KLOEL_THEME.bgHover : 'transparent',
                    transition: 'background-color 150ms ease',
                  }}
                >
                  <Icon
                    size={16}
                    style={{
                      color: isHovered ? KLOEL_THEME.textPrimary : KLOEL_THEME.textSecondary,
                      flexShrink: 0,
                      transition: 'color 150ms ease',
                    }}
                  />
                  <span
                    style={{
                      fontFamily: "'Sora', sans-serif",
                      fontSize: 13,
                      color: isHovered ? KLOEL_THEME.textPrimary : KLOEL_THEME.textSecondary,
                      transition: 'color 150ms ease',
                    }}
                  >
                    {item.label}
                  </span>
                </button>

                {/* Divider */}
                {item.dividerAfter && (
                  <div
                    style={{
                      height: 1,
                      backgroundColor: KLOEL_THEME.borderSubtle,
                      margin: '4px 12px',
                    }}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* User trigger button */}
      <button
        onClick={() => setOpen(!open)}
        onMouseEnter={() => setAvatarHovered(true)}
        onMouseLeave={() => setAvatarHovered(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          padding: expanded ? '6px 8px' : '6px 0',
          border: 'none',
          outline: 'none',
          cursor: 'pointer',
          borderRadius: 6,
          backgroundColor: avatarHovered ? KLOEL_THEME.bgHover : 'transparent',
          justifyContent: expanded ? 'flex-start' : 'center',
          transition: 'background-color 150ms ease',
        }}
      >
        {/* Avatar — 28x28 square, radius 6px, Ember bg */}
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            background: KLOEL_THEME.accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: 11,
              fontWeight: 700,
              color: KLOEL_THEME.textOnAccent,
              lineHeight: 1,
            }}
          >
            {initials}
          </span>
        </div>

        {/* Name + Plan (only when expanded) */}
        {expanded && (
          <div
            style={{
              flex: 1,
              alignItems: 'flex-start',
              overflow: 'hidden',
            }}
          >
            <span
              style={{
                fontFamily: "'Sora', sans-serif",
                fontSize: 13,
                fontWeight: 600,
                color: KLOEL_THEME.textPrimary,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                width: '100%',
                textAlign: 'left',
              }}
            >
              {displayName}
            </span>
          </div>
        )}

        {/* Chevron (only when expanded) */}
        {expanded && (
          <ChevronUp
            size={14}
            style={{
              color: KLOEL_THEME.textTertiary,
              flexShrink: 0,
              transform: open ? 'rotate(0deg)' : 'rotate(180deg)',
              transition: 'transform 150ms ease',
            }}
          />
        )}
      </button>
    </div>
  );
}
