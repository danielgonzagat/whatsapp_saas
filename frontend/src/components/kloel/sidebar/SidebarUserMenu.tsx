'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Settings,
  Globe,
  HelpCircle,
  ArrowUpCircle,
  Download,
  Gift,
  Info,
  LogOut,
  ChevronUp,
} from 'lucide-react';
import { useAuth } from '@/components/kloel/auth/auth-provider';

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
  { icon: Settings, label: 'Configurações', key: 'settings' },
  { icon: Globe, label: 'Idioma', key: 'language' },
  { icon: HelpCircle, label: 'Ajuda', key: 'help', dividerAfter: true },
  { icon: ArrowUpCircle, label: 'Upgrade plano', key: 'upgrade' },
  { icon: Download, label: 'Apps', key: 'apps' },
  { icon: Gift, label: 'Presentear Kloel', key: 'gift' },
  { icon: Info, label: 'Saiba mais', key: 'learn-more', dividerAfter: true },
  { icon: LogOut, label: 'Sair', key: 'logout' },
];

// ============================================
// COMPONENT
// ============================================

export function SidebarUserMenu({ expanded }: SidebarUserMenuProps) {
  const { userName, userEmail, subscription } = useAuth();
  const [open, setOpen] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [avatarHovered, setAvatarHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const displayName = userName || 'Usuário';
  const displayEmail = userEmail || '';
  const initials = useMemo(() => {
    if (!userName) return 'U';
    const parts = userName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0][0].toUpperCase();
  }, [userName]);
  const planLabel = subscription?.plan || 'Plano Free';

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
        borderTop: '1px solid #16162A',
        padding: expanded ? '12px 12px' : '12px 4px',
        transition: 'padding 200ms ease',
      }}
    >
      {/* Popup Menu */}
      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: expanded ? 8 : -4,
            width: expanded ? 'calc(100% - 16px)' : 240,
            backgroundColor: '#10101C',
            border: '1px solid #1E1E34',
            borderRadius: 12,
            boxShadow: '0 -8px 32px rgba(0, 0, 0, 0.5), 0 -2px 8px rgba(0, 0, 0, 0.3)',
            zIndex: 100,
            padding: '6px 0',
            marginBottom: 8,
            animation: 'fadeSlideUp 200ms ease forwards',
          }}
        >
          {/* Email header */}
          <div
            style={{
              padding: '10px 16px 8px',
              borderBottom: '1px solid #1E1E34',
              marginBottom: 4,
            }}
          >
            <span
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 12,
                color: '#5C5A6E',
              }}
            >
              {displayEmail}
            </span>
          </div>

          {/* Menu items */}
          {MENU_ITEMS.map((item) => {
            const Icon = item.icon;
            const isHovered = hoveredItem === item.key;

            return (
              <React.Fragment key={item.key}>
                <button
                  onClick={() => {
                    setOpen(false);
                    // Handle menu action here
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
                    backgroundColor: isHovered ? '#181828' : 'transparent',
                    transition: 'background-color 150ms ease',
                  }}
                >
                  <Icon
                    size={16}
                    style={{
                      color: isHovered ? '#E8E6F0' : '#9896A8',
                      flexShrink: 0,
                      transition: 'color 150ms ease',
                    }}
                  />
                  <span
                    style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 13,
                      color: isHovered ? '#E8E6F0' : '#9896A8',
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
                      backgroundColor: '#1E1E34',
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
          borderRadius: 8,
          backgroundColor: avatarHovered ? '#181828' : 'transparent',
          justifyContent: expanded ? 'flex-start' : 'center',
          transition: 'background-color 200ms ease, padding 200ms ease',
        }}
      >
        {/* Avatar */}
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #4E7AE0, #7B5EA7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: "'Outfit', sans-serif",
              fontSize: 12,
              fontWeight: 700,
              color: '#FFFFFF',
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
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 1,
              overflow: 'hidden',
            }}
          >
            <span
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 13,
                fontWeight: 600,
                color: '#E8E6F0',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                width: '100%',
                textAlign: 'left',
              }}
            >
              {displayName}
            </span>
            <span
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 10,
                color: '#5C5A6E',
              }}
            >
              {planLabel}
            </span>
          </div>
        )}

        {/* Chevron (only when expanded) */}
        {expanded && (
          <ChevronUp
            size={14}
            style={{
              color: '#5C5A6E',
              flexShrink: 0,
              transform: open ? 'rotate(0deg)' : 'rotate(180deg)',
              transition: 'transform 200ms ease',
            }}
          />
        )}
      </button>

      {/* Keyframe animation (injected once) */}
      <style>{`
        @keyframes fadeSlideUp {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
