'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'kloel_sidebar_expanded';

function getInitialExpanded(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) return stored === 'true';
  } catch {}
  return false;
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
  const [expanded, setExpandedRaw] = useState<boolean>(false);
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
