'use client';

import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { NAV, SIDEBAR_WIDTH_COLLAPSED, SIDEBAR_WIDTH_EXPANDED } from './sidebar-config';
import { SidebarNav } from './SidebarNav';
import { SidebarUserMenu } from './SidebarUserMenu';
import { SidebarRecents } from './SidebarRecents';
import { KloelWordmark } from '../KloelBrand';
import { SidebarToggleIcon } from './SidebarToggleIcon';
import { KLOEL_THEME } from '@/lib/kloel-theme';

// ============================================
// TYPES
// ============================================

interface KloelSidebarProps {
  activeView: string;
  activeSubView?: string | null;
  onNavigate: (view: string, subView?: string) => void;
  onNewChat?: () => void;
  onSearch?: () => void;
  expanded: boolean;
  onToggle: () => void;
}

// ============================================
// SBtn — Quick-action button helper
// ============================================

function SBtn({
  icon: Icon,
  label,
  expanded,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  expanded: boolean;
  onClick?: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={!expanded ? label : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: expanded ? 10 : 0,
        width: '100%',
        padding: expanded ? '8px 10px' : '8px 0',
        justifyContent: expanded ? 'flex-start' : 'center',
        border: 'none',
        outline: 'none',
        cursor: 'pointer',
        borderRadius: 6,
        backgroundColor: hovered ? KLOEL_THEME.bgHover : 'transparent',
        transition: 'background-color 150ms ease',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: expanded ? 24 : 48,
          height: 24,
          flexShrink: 0,
          transition: 'width 150ms ease',
        }}
      >
        <Icon
          size={18}
          style={{
            color: hovered ? KLOEL_THEME.textPrimary : KLOEL_THEME.textSecondary,
            transition: 'color 150ms ease',
          }}
        />
      </div>
      {expanded && (
        <span
          style={{
            fontFamily: "'Sora', sans-serif",
            fontSize: 13,
            color: hovered ? KLOEL_THEME.textPrimary : KLOEL_THEME.textSecondary,
            whiteSpace: 'nowrap',
            transition: 'color 150ms ease',
          }}
        >
          {label}
        </span>
      )}
    </button>
  );
}

// ============================================
// DIVIDER — simple line
// ============================================

function MonitorDivider() {
  return (
    <div
      style={{
        height: 1,
        margin: '8px 12px',
        background: KLOEL_THEME.borderSubtle,
      }}
    />
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function KloelSidebar({
  activeView,
  activeSubView,
  onNavigate,
  onNewChat,
  onSearch,
  expanded,
  onToggle,
}: KloelSidebarProps) {
  const [expandedNav, setExpandedNav] = useState<string | null>(null);

  useEffect(() => {
    if (!expanded) {
      setExpandedNav(null);
      return;
    }

    const activeParent = activeSubView?.split(':')[0];
    if (activeParent && NAV.some((item) => item.key === activeParent && item.sub.length > 0)) {
      setExpandedNav(activeParent);
      return;
    }

    if (activeView && NAV.some((item) => item.key === activeView && item.sub.length > 0)) {
      setExpandedNav(activeView);
    }
  }, [activeSubView, activeView, expanded]);

  const handleNavClick = (key: string, sub?: string) => {
    onNavigate(key, sub);
  };

  const handleToggleNav = (key: string) => {
    setExpandedNav(expandedNav === key ? null : key);
  };
  return (
    <aside
      style={{
        width: expanded ? SIDEBAR_WIDTH_EXPANDED : SIDEBAR_WIDTH_COLLAPSED,
        height: '100vh',
        backgroundColor: KLOEL_THEME.bgSidebar,
        borderRight: `1px solid ${KLOEL_THEME.borderSubtle}`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'visible',
        zIndex: 10,
        transition: 'width 200ms ease',
        flexShrink: 0,
        position: 'relative',
      }}
    >
      {/* ======== TOP: Brand + Toggle ======== */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: expanded ? 'space-between' : 'center',
          padding: expanded ? '12px 6px 8px' : '12px 0 8px',
          minHeight: 52,
          transition: 'padding 150ms ease',
        }}
      >
        {expanded ? (
          <Link
            href="/dashboard"
            style={{
              display: 'flex',
              alignItems: 'center',
              minWidth: 0,
              height: 36,
              paddingLeft: 10,
              textDecoration: 'none',
            }}
            aria-label="Kloel"
          >
            <KloelWordmark color={KLOEL_THEME.textPrimary} fontSize={16} fontWeight={600} />
          </Link>
        ) : (
          <button
            onClick={onToggle}
            title="Abrir sidebar"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              height: 40,
              padding: '8px 0',
              border: 'none',
              outline: 'none',
              cursor: 'pointer',
              borderRadius: 6,
              backgroundColor: 'transparent',
              transition: 'background-color 150ms ease',
            }}
          >
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 48,
                height: 24,
              }}
            >
              <SidebarToggleIcon color={KLOEL_THEME.textSecondary} size={18} />
            </span>
          </button>
        )}

        {expanded && (
          <button
            onClick={onToggle}
            className="kloel-sidebar-collapse-button"
            title="Recolher sidebar"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              border: 'none',
              outline: 'none',
              cursor: 'pointer',
              borderRadius: 8,
              backgroundColor: 'transparent',
              transition: 'background-color 150ms ease',
              padding: 0,
            }}
          >
            <SidebarToggleIcon color={KLOEL_THEME.textTertiary} size={16} />
          </button>
        )}
      </div>

      {/* ======== QUICK ACTIONS ======== */}
      <div
        style={{
          padding: '0 6px',
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
        }}
      >
        <SBtn icon={Plus} label="Novo chat" expanded={expanded} onClick={onNewChat} />
        <SBtn icon={Search} label="Buscar" expanded={expanded} onClick={onSearch} />
      </div>

      {/* ======== DIVIDER ======== */}
      <MonitorDivider />

      {/* ======== NAVIGATION ======== */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          paddingBottom: 8,
          scrollbarWidth: 'thin',
          scrollbarColor: `${KLOEL_THEME.borderPrimary} transparent`,
        }}
      >
        <SidebarNav
          expanded={expanded}
          nav={NAV}
          activeView={activeView}
          activeSubView={activeSubView}
          expandedNav={expandedNav}
          onNavClick={handleNavClick}
          onToggleNav={handleToggleNav}
        />

        {/* ======== RECENTS ======== */}
        <SidebarRecents expanded={expanded} />
      </div>

      {/* ======== FOOTER: User Menu ======== */}
      <SidebarUserMenu expanded={expanded} />

      {/* Custom scrollbar styles */}
      <style>{`
        @media (hover: hover) and (pointer: fine) {
          button[title="Abrir sidebar"]:hover,
          .kloel-sidebar-collapse-button:hover {
            background: ${KLOEL_THEME.bgHover};
          }

          .kloel-sidebar-collapse-button:hover svg {
            color: ${KLOEL_THEME.textPrimary};
          }
        }

        aside::-webkit-scrollbar {
          width: 4px;
        }
        aside::-webkit-scrollbar-track {
          background: transparent;
        }
        aside::-webkit-scrollbar-thumb {
          background: ${KLOEL_THEME.borderPrimary};
          border-radius: 4px;
        }
        aside > div::-webkit-scrollbar {
          width: 4px;
        }
        aside > div::-webkit-scrollbar-track {
          background: transparent;
        }
        aside > div::-webkit-scrollbar-thumb {
          background: ${KLOEL_THEME.borderPrimary};
          border-radius: 4px;
        }
      `}</style>
    </aside>
  );
}
