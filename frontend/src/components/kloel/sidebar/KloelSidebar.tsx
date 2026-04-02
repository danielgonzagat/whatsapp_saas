'use client';

import Link from 'next/link';
import React, { useState } from 'react';
import { Plus, Search, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { NAV, SIDEBAR_WIDTH_COLLAPSED, SIDEBAR_WIDTH_EXPANDED } from './sidebar-config';
import { SidebarNav } from './SidebarNav';
import { SidebarUserMenu } from './SidebarUserMenu';
import { SidebarRecents } from './SidebarRecents';
import { KloelMushroomMark } from '../KloelBrand';

// ============================================
// TYPES
// ============================================

interface KloelSidebarProps {
  activeView: string;
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

export function KloelSidebar({
  activeView,
  onNavigate,
  onNewChat,
  onSearch,
  expanded,
  onToggle,
}: KloelSidebarProps) {
  const [expandedNav, setExpandedNav] = useState<string | null>(null);

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
        backgroundColor: '#0A0A0C',
        borderRight: '1px solid #19191C',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'visible',
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
          padding: expanded ? '12px 12px 8px' : '12px 6px 8px',
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
              justifyContent: 'center',
              width: 32,
              height: 32,
              borderRadius: 8,
              textDecoration: 'none',
            }}
            aria-label="Kloel"
          >
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 24,
                height: 24,
              }}
            >
              <KloelMushroomMark size={18} traceColor="#FFFFFF" />
            </span>
          </Link>
        ) : (
          <button
            onClick={onToggle}
            className="kloel-sidebar-brand-button"
            title="Abrir sidebar"
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 48,
              height: 40,
              border: 'none',
              outline: 'none',
              cursor: 'pointer',
              borderRadius: 8,
              backgroundColor: 'transparent',
              transition: 'background-color 150ms ease',
              padding: 0,
            }}
          >
            <span
              className="kloel-sidebar-brand-mark"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 24,
                height: 24,
                transition: 'opacity 150ms ease',
                pointerEvents: 'none',
              }}
            >
              <KloelMushroomMark size={18} traceColor="#FFFFFF" />
            </span>
            <span
              className="kloel-sidebar-brand-toggle"
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: 0,
                transition: 'opacity 150ms ease',
                pointerEvents: 'none',
              }}
            >
              <PanelLeftOpen
                size={16}
                style={{
                  color: '#E0DDD8',
                  transition: 'color 150ms ease',
                }}
              />
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
            <PanelLeftClose
              size={16}
              style={{
                color: '#3A3A3F',
                transition: 'color 150ms ease',
              }}
            />
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
        .kloel-sidebar-brand-button .kloel-sidebar-brand-mark {
          opacity: 1;
        }

        .kloel-sidebar-brand-button .kloel-sidebar-brand-toggle {
          opacity: 0;
        }

        @media (hover: hover) and (pointer: fine) {
          .kloel-sidebar-brand-button:hover,
          .kloel-sidebar-collapse-button:hover {
            background: #111113;
          }

          .kloel-sidebar-brand-button:hover .kloel-sidebar-brand-mark {
            opacity: 0;
          }

          .kloel-sidebar-brand-button:hover .kloel-sidebar-brand-toggle {
            opacity: 1;
          }

          .kloel-sidebar-collapse-button:hover svg {
            color: #E0DDD8;
          }
        }

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
