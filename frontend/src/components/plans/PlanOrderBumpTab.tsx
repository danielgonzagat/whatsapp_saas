'use client';

import { kloelT } from '@/lib/i18n/t';
import { useOrderBumps } from '@/hooks/useCheckoutPlans';
import { useState, useId } from 'react';
import { colors } from '@/lib/design-tokens';

/* ── Inline SVG Icons ── */
const GiftIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="20 12 20 22 4 22 4 12" />
    <rect x="2" y="7" width="20" height="5" />
    <line x1="12" y1="22" x2="12" y2="7" />
    <path d={kloelT(`M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z`)} />
    <path d={kloelT(`M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z`)} />
  </svg>
);

const EditIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={kloelT(`M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7`)} />
    <path d={kloelT(`M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z`)} />
  </svg>
);

const TrashIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="3 6 5 6 21 6" />
    <path
      d={kloelT(`M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2`)}
    />
  </svg>
);

const PlusIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

/* ── Design Tokens ── */
const _BG_VOID = 'colors.background.void';
const BG_SURFACE = 'colors.background.surface';
const BG_ELEVATED = 'colors.background.elevated';
const BORDER = 'colors.border.space';
const TEXT_PRIMARY = 'colors.text.silver';
const TEXT_MUTED = 'colors.text.muted';
const TEXT_DIM = 'colors.text.dim';
const EMBER = 'colors.ember.primary';
const GREEN = '#10B981';
const RED = '#EF4444';
const FONT_BODY = "'Sora', sans-serif";
const FONT_MONO = "'JetBrains Mono', monospace";

/* ── Types ── */
interface BumpFormData {
  productName: string;
  title: string;
  priceInCents: number;
  compareAtPrice: number;
  checkboxLabel: string;
  description: string;
  [key: string]: unknown;
}

const defaultForm: BumpFormData = {
  productName: '',
  title: '',
  priceInCents: 0,
  compareAtPrice: 0,
  checkboxLabel: 'Sim, eu quero!',
  description: '',
};

/* ── Styles ── */
const labelStyle: React.CSSProperties = {
  fontFamily: FONT_BODY,
  fontSize: '11px',
  fontWeight: 600,
  color: TEXT_DIM,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  marginBottom: '6px',
  display: 'block',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: BG_ELEVATED,
  border: `1px solid ${BORDER}`,
  color: TEXT_PRIMARY,
  borderRadius: '6px',
  padding: '10px 14px',
  fontSize: '14px',
  fontFamily: FONT_BODY,
  outline: 'none',
  boxSizing: 'border-box' as const,
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: '80px',
  resize: 'vertical' as const,
};

const cardStyle: React.CSSProperties = {
  background: BG_SURFACE,
  border: `1px solid ${BORDER}`,
  borderRadius: '6px',
  padding: '20px',
};
import "../../__companions__/PlanOrderBumpTab.companion";
