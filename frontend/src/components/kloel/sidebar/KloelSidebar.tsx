'use client';

import React, { useState } from 'react';
import { Plus, Search, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { NAV } from './sidebar-config';
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
        borderRadius: 8,
        backgroundColor: hovered ? '#181828' : 'transparent',
        transition: 'background-color 200ms ease, padding 200ms ease',
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
          transition: 'width 200ms ease',
        }}
      >
        <Icon
          size={18}
          style={{
            color: hovered ? '#E8E6F0' : '#9896A8',
            transition: 'color 200ms ease',
          }}
        />
      </div>
      {expanded && (
        <span
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 13,
            color: hovered ? '#E8E6F0' : '#9896A8',
            whiteSpace: 'nowrap',
            transition: 'color 200ms ease',
          }}
        >
          {label}
        </span>
      )}
    </button>
  );
}

// ============================================
// COSMIC DIVIDER
// ============================================

function CosmicDivider() {
  return (
    <div
      style={{
        height: 1,
        margin: '8px 12px',
        background: 'linear-gradient(90deg, transparent, #1E1E34 30%, #2A2848 50%, #1E1E34 70%, transparent)',
      }}
    />
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function KloelSidebar({ activeView, onNavigate }: KloelSidebarProps) {
  const {
    expanded,
    toggle,
    expandedNav,
    setExpandedNav,
  } = useSidebarState();

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
        width: expanded ? 260 : 56,
        height: '100vh',
        backgroundColor: '#0A0A14',
        borderRight: '1px solid #16162A',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        zIndex: 10,
        transition: 'width 350ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
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
          transition: 'padding 200ms ease',
        }}
      >
        {/* Logo */}
        {expanded && (
          <span
            style={{
              fontFamily: "'Outfit', sans-serif",
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: '0.12em',
              background: 'linear-gradient(135deg, #E8E6F0, #9896A8)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              userSelect: 'none',
            }}
          >
            KLOEL
          </span>
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
            backgroundColor: toggleHovered ? '#181828' : 'transparent',
            transition: 'background-color 200ms ease',
            padding: 0,
          }}
        >
          <ToggleIcon
            size={16}
            style={{
              color: toggleHovered ? '#E8E6F0' : '#5C5A6E',
              transition: 'color 200ms ease',
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
        <SBtn icon={Plus} label="Novo chat" expanded={expanded} />
        <SBtn icon={Search} label="Buscar" expanded={expanded} />
      </div>

      {/* ======== COSMIC DIVIDER ======== */}
      <CosmicDivider />

      {/* ======== NAVIGATION ======== */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          paddingBottom: 8,
          /* Custom scrollbar */
          scrollbarWidth: 'thin',
          scrollbarColor: '#1E1E34 transparent',
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
          background: #1E1E34;
          border-radius: 4px;
        }
        aside > div::-webkit-scrollbar {
          width: 4px;
        }
        aside > div::-webkit-scrollbar-track {
          background: transparent;
        }
        aside > div::-webkit-scrollbar-thumb {
          background: #1E1E34;
          border-radius: 4px;
        }
      `}</style>
    </aside>
  );
}
