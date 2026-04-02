'use client';

import Link from 'next/link';
import React, { useState } from 'react';
import { Plus, Search, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { NAV, SIDEBAR_WIDTH_COLLAPSED, SIDEBAR_WIDTH_EXPANDED } from './sidebar-config';
import { useSidebarState } from './useSidebarState';
import { SidebarNav } from './SidebarNav';
import { SidebarUserMenu } from './SidebarUserMenu';
import { SidebarRecents } from './SidebarRecents';

// ============================================
// TYPES
// ============================================

interface KloelSidebarProps {
  activeView: string;
  onNavigate: (view: string, subView?: string) => void;
  onNewChat?: () => void;
  onSearch?: () => void;
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
        backgroundColor: hovered ? '#111113' : 'transparent',
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
            color: hovered ? '#E0DDD8' : '#6E6E73',
            transition: 'color 150ms ease',
          }}
        />
      </div>
      {expanded && (
        <span
          style={{
            fontFamily: "'Sora', sans-serif",
            fontSize: 13,
            color: hovered ? '#E0DDD8' : '#6E6E73',
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
        background: '#19191C',
      }}
    />
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function KloelSidebar({ activeView, onNavigate, onNewChat, onSearch }: KloelSidebarProps) {
  const { expanded, toggle, expandedNav, setExpandedNav } = useSidebarState();

  const [toggleHovered, setToggleHovered] = useState(false);

  const handleNavClick = (key: string, sub?: string) => {
    onNavigate(key, sub);
  };

  const handleToggleNav = (key: string) => {
    setExpandedNav(expandedNav === key ? null : key);
  };

  const ToggleIcon = expanded ? PanelLeftClose : PanelLeftOpen;

  return (
    <aside
      style={{
        width: expanded ? SIDEBAR_WIDTH_EXPANDED : SIDEBAR_WIDTH_COLLAPSED,
        height: '100vh',
        backgroundColor: '#0A0A0C',
        borderRight: '1px solid #19191C',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        zIndex: 10,
        transition: 'width 200ms ease',
        flexShrink: 0,
        position: 'relative',
      }}
    >
      {/* ======== TOP: Logo + Toggle ======== */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: expanded ? 'space-between' : 'center',
          padding: expanded ? '16px 16px 12px' : '16px 4px 12px',
          minHeight: 56,
          transition: 'padding 150ms ease',
        }}
      >
        {/* Logo — plain text, no gradient */}
        {expanded && (
          <Link
            href="/dashboard"
            style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: 16,
              fontWeight: 700,
              color: '#E0DDD8',
              userSelect: 'none',
              letterSpacing: '-0.01em',
              textDecoration: 'none',
              cursor: 'pointer',
            }}
          >
            Kloel
          </Link>
        )}

        {/* Toggle button */}
        <button
          onClick={toggle}
          onMouseEnter={() => setToggleHovered(true)}
          onMouseLeave={() => setToggleHovered(false)}
          title={expanded ? 'Recolher sidebar' : 'Expandir sidebar'}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            border: 'none',
            outline: 'none',
            cursor: 'pointer',
            borderRadius: 6,
            backgroundColor: toggleHovered ? '#111113' : 'transparent',
            transition: 'background-color 150ms ease',
            padding: 0,
          }}
        >
          <ToggleIcon
            size={16}
            style={{
              color: toggleHovered ? '#E0DDD8' : '#3A3A3F',
              transition: 'color 150ms ease',
            }}
          />
        </button>
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
          scrollbarColor: '#222226 transparent',
        }}
      >
        <SidebarNav
          expanded={expanded}
          nav={NAV}
          activeView={activeView}
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
        aside::-webkit-scrollbar {
          width: 4px;
        }
        aside::-webkit-scrollbar-track {
          background: transparent;
        }
        aside::-webkit-scrollbar-thumb {
          background: #222226;
          border-radius: 4px;
        }
        aside > div::-webkit-scrollbar {
          width: 4px;
        }
        aside > div::-webkit-scrollbar-track {
          background: transparent;
        }
        aside > div::-webkit-scrollbar-thumb {
          background: #222226;
          border-radius: 4px;
        }
      `}</style>
    </aside>
  );
}
