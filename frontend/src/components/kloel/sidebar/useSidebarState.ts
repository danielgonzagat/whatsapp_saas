'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'kloel_sidebar_expanded';
const BREAKPOINT = 1280;

function getInitialExpanded(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) return stored === 'true';
  } catch {}
  return window.innerWidth >= BREAKPOINT;
}

export interface SidebarState {
  expanded: boolean;
  setExpanded: (v: boolean) => void;
  toggle: () => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
  expandedNav: string | null;
  setExpandedNav: (v: string | null) => void;
}

export function useSidebarState(): SidebarState {
  const [expanded, setExpandedRaw] = useState<boolean>(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expandedNav, setExpandedNav] = useState<string | null>(null);

  useEffect(() => {
    setExpandedRaw(getInitialExpanded());
  }, []);

  // Persist expanded state to localStorage
  const setExpanded = useCallback((v: boolean) => {
    setExpandedRaw(v);
    try {
      localStorage.setItem(STORAGE_KEY, String(v));
    } catch {}
  }, []);

  const toggle = useCallback(() => {
    setExpanded(!expanded);
  }, [expanded, setExpanded]);

  // Responsive: collapse on small screens, expand on large
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mql = window.matchMedia(`(min-width: ${BREAKPOINT}px)`);

    const handler = (e: MediaQueryListEvent) => {
      // Only auto-adjust if user hasn't manually set preference recently
      // We respect localStorage but respond to major viewport changes
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === null) {
        setExpandedRaw(e.matches);
      }
    };

    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  // Close mobile sidebar on escape
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  return {
    expanded,
    setExpanded,
    toggle,
    mobileOpen,
    setMobileOpen,
    expandedNav,
    setExpandedNav,
  };
}
