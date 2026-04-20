'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'kloel_sidebar_expanded';

function getInitialExpanded(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      return stored === 'true';
    }
  } catch {}
  return false;
}

/** Sidebar state shape. */
export interface SidebarState {
  /** Expanded property. */
  expanded: boolean;
  /** Set expanded property. */
  setExpanded: (v: boolean) => void;
  /** Toggle property. */
  toggle: () => void;
  /** Mobile open property. */
  mobileOpen: boolean;
  /** Set mobile open property. */
  setMobileOpen: (v: boolean) => void;
  /** Expanded nav property. */
  expandedNav: string | null;
  /** Set expanded nav property. */
  setExpandedNav: (v: string | null) => void;
}

/** Use sidebar state. */
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
    if (!mobileOpen) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileOpen(false);
      }
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
