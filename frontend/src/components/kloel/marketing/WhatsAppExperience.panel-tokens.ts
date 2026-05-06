'use client';

import { KLOEL_THEME } from '@/lib/kloel-theme';
import { UI } from '@/lib/ui-tokens';
import type * as React from 'react';

export const E = UI.accent;
export const V = KLOEL_THEME.bgPrimary;
export const G = UI.success;
export const S = KLOEL_THEME.textSecondary;
export const D = KLOEL_THEME.textPlaceholder;
export const C = KLOEL_THEME.bgCard;
export const B = KLOEL_THEME.borderPrimary;
export const F = "'Sora', system-ui, sans-serif";
export const M = "'JetBrains Mono', monospace";

export const selectInputStyle: React.CSSProperties = {
  width: '100%',
  background: KLOEL_THEME.bgSecondary,
  border: `1px solid ${B}`,
  borderRadius: UI.radiusSm,
  padding: '8px 10px',
  color: KLOEL_THEME.textPrimary,
  fontSize: 12,
  fontFamily: F,
  outline: 'none',
};

export interface EffectiveConnection {
  connected: boolean;
  status: string;
  phoneNumber: string;
  pushName: string;
  phoneNumberId: string;
}

export interface ChannelRealData {
  messages: number;
  leads: number;
  sales: number;
  status: string;
}
