'use client';

import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { NavItem, getIconComponent } from './sidebar-config';

// ============================================
// TYPES
// ============================================

interface SidebarNavProps {
  expanded: boolean;
  nav: NavItem[];
  activeView: string;
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
        const isHovered = hoveredItem === item.key;
        const hasSubs = item.sub.length > 0;

        return (
          <div key={item.key} style={{ position: 'relative' }}>
            {/* Active indicator bar — Ember */}
            {isActive && (
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 2,
                  height: 20,
                  backgroundColor: '#E85D30',
                  borderRadius: 1,
                  boxShadow: 'none',
                  zIndex: 1,
                }}
              />
            )}

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
                backgroundColor: isActive ? 'rgba(232,93,48,0.06)' : isHovered ? '#111113' : 'transparent',
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
                    color: isActive ? '#E0DDD8' : isHovered ? '#E0DDD8' : '#6E6E73',
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
                    color: isActive ? '#E0DDD8' : isHovered ? '#E0DDD8' : '#6E6E73',
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
                    color: '#3A3A3F',
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
                  const isSubActive = activeView === subKey;

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
                        backgroundColor: isSubActive
                          ? 'rgba(232,93,48,0.06)'
                          : isSubHovered
                            ? '#111113'
                            : 'transparent',
                        transition: 'background-color 150ms ease',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "'Sora', sans-serif",
                          fontSize: 12,
                          color: isSubActive
                            ? '#E0DDD8'
                            : isSubHovered
                              ? '#E0DDD8'
                              : '#3A3A3F',
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
