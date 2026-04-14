'use client';

import { KLOEL_THEME } from '@/lib/kloel-theme';
import { ChevronRight } from 'lucide-react';
import React, { useState } from 'react';
import { type NavItem, getIconComponent } from './sidebar-config';

// ============================================
// TYPES
// ============================================

interface SidebarNavProps {
  expanded: boolean;
  nav: NavItem[];
  activeView: string;
  activeSubView?: string | null;
  expandedNav: string | null;
  onNavClick: (key: string, sub?: string) => void;
  onToggleNav: (key: string) => void;
}

// ============================================
// COMPONENT
// ============================================

export function SidebarNav({
  expanded,
  nav,
  activeView,
  activeSubView,
  expandedNav,
  onNavClick,
  onToggleNav,
}: SidebarNavProps) {
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [hoveredSub, setHoveredSub] = useState<string | null>(null);

  return (
    <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 6px' }}>
      {nav.map((item) => {
        const Icon = getIconComponent(item.icon);
        const isActive = activeView === item.key;
        const isExpanded = expandedNav === item.key;
        const activeSubParent = activeSubView?.split(':')[0];
        const parentHasActiveSub = activeSubParent === item.key;
        const isHovered = hoveredItem === item.key;
        const hasSubs = item.sub.length > 0;

        return (
          <div key={item.key} style={{ position: 'relative' }}>
            {/* Main nav button */}
            <button
              onClick={() => {
                if (hasSubs && expanded) {
                  onToggleNav(item.key);
                } else {
                  onNavClick(item.key);
                }
              }}
              onMouseEnter={() => setHoveredItem(item.key)}
              onMouseLeave={() => setHoveredItem(null)}
              title={!expanded ? item.label : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                border: 'none',
                outline: 'none',
                cursor: 'pointer',
                borderRadius: 6,
                padding: expanded ? '8px 10px' : '8px 0',
                justifyContent: expanded ? 'flex-start' : 'center',
                gap: expanded ? 10 : 0,
                backgroundColor: isHovered ? KLOEL_THEME.bgHover : 'transparent',
                transition: 'background-color 150ms ease',
                position: 'relative',
              }}
            >
              {/* Icon */}
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
                    color: isActive
                      ? KLOEL_THEME.accent
                      : isHovered
                        ? KLOEL_THEME.textPrimary
                        : KLOEL_THEME.textSecondary,
                    transition: 'color 150ms ease',
                  }}
                />
              </div>

              {/* Label (only when expanded) */}
              {expanded && (
                <span
                  style={{
                    fontFamily: "'Sora', sans-serif",
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 400,
                    color: isActive
                      ? KLOEL_THEME.accent
                      : isHovered
                        ? KLOEL_THEME.textPrimary
                        : KLOEL_THEME.textSecondary,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    flex: 1,
                    textAlign: 'left',
                    transition: 'color 150ms ease',
                  }}
                >
                  {item.label}
                </span>
              )}

              {/* Chevron for items with subs (only when expanded) */}
              {expanded && hasSubs && (
                <ChevronRight
                  size={14}
                  style={{
                    color: KLOEL_THEME.textTertiary,
                    flexShrink: 0,
                    transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 150ms ease',
                  }}
                />
              )}
            </button>

            {/* Sub-items (only when expanded and nav is expanded) */}
            {expanded && hasSubs && isExpanded && (
              <div
                style={{
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 0,
                  marginTop: 2,
                  paddingBottom: 4,
                }}
              >
                {item.sub.map((sub) => {
                  const subKey = `${item.key}:${sub}`;
                  const isSubHovered = hoveredSub === subKey;
                  const isSubActive = activeSubView === subKey;

                  return (
                    <button
                      key={sub}
                      onClick={() => onNavClick(item.key, sub)}
                      onMouseEnter={() => setHoveredSub(subKey)}
                      onMouseLeave={() => setHoveredSub(null)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        width: '100%',
                        border: 'none',
                        outline: 'none',
                        cursor: 'pointer',
                        borderRadius: 6,
                        padding: '7px 10px 7px 36px',
                        backgroundColor: isSubHovered ? KLOEL_THEME.bgHover : 'transparent',
                        transition: 'background-color 150ms ease',
                        position: 'relative',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "'Sora', sans-serif",
                          fontSize: 12,
                          color: isSubActive
                            ? KLOEL_THEME.accent
                            : isSubHovered
                              ? KLOEL_THEME.textPrimary
                              : KLOEL_THEME.textTertiary,
                          fontWeight: isSubActive ? 600 : 400,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          transition: 'color 150ms ease',
                        }}
                      >
                        {sub}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
