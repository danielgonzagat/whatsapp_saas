'use client';

import { kloelT } from '@/lib/i18n/t';
import { useCRMMutations, useContact } from '@/hooks/useCRM';
import { neuroCrmApi } from '@/lib/api/crm';
import { colors } from '@/lib/design-tokens';
import {
  Brain,
  Briefcase,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  Tag,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import { type KeyboardEvent, useCallback, useState } from 'react';

/* ── Types ── */
interface Deal {
  _id?: string;
  id?: string;
  title?: string;
  value?: number;
  stage?: string;
  currency?: string;
}

interface Contact {
  id?: string;
  name?: string;
  phone?: string;
  email?: string;
  tags?: string[];
  leadScore?: number;
  sentiment?: 'positive' | 'neutral' | 'negative';
  deals?: Deal[];
}

interface ContactDetailDrawerProps {
  phone: string | null;
  onClose: () => void;
}

/* ── Design tokens ── */
const C = {
  bg: colors.background.void,
  surface: colors.background.surface,
  elevated: colors.background.elevated,
  border: colors.border.space,
  accent: colors.ember.primary,
  text: colors.text.silver,
  muted: colors.text.muted,
  sora: "'Sora', sans-serif",
  mono: "'JetBrains Mono', monospace",
} as const;

const sentimentColors: Record<string, { bg: string; text: string }> = {
  positive: { bg: 'rgba(52,199,89,0.15)', text: '#34C759' }, // PULSE_VISUAL_OK: platform sentiment green
  neutral: { bg: 'rgba(110,110,115,0.15)', text: '#8E8E93' }, // PULSE_VISUAL_OK: platform sentiment gray
  negative: { bg: 'rgba(255,69,58,0.15)', text: '#FF453A' }, // PULSE_VISUAL_OK: platform sentiment red
};

function LoadingStrip({
  width = '100%',
  height = 12,
  marginBottom = 0,
}: {
  width?: string | number;
  height?: string | number;
  marginBottom?: number;
}) {
  return (
    <div
      style={{
        width,
        height,
        marginBottom,
        borderRadius: 6,
        background:
          'linear-gradient(90deg, rgba(25,25,28,0.98) 0%, rgba(41,41,46,1) 50%, rgba(25,25,28,0.98) 100%)',
      }}
    />
  );
}

function ContactDetailLoadingBody() {
  return (
    <>
      <Section title={kloelT(`Informacoes`)}>
        <LoadingStrip width="72%" height={13} marginBottom={10} />
        <LoadingStrip width="58%" height={13} />
      </Section>

      <Section title={kloelT(`Tags`)}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <LoadingStrip width={88} height={26} />
          <LoadingStrip width={106} height={26} />
          <LoadingStrip width={74} height={26} />
        </div>
        <LoadingStrip width="100%" height={34} />
      </Section>

      <Section title={kloelT(`Score & Sentimento`)}>
        <LoadingStrip width="100%" height={10} marginBottom={12} />
        <LoadingStrip width="100%" height={8} marginBottom={12} />
        <LoadingStrip width="48%" height={20} />
      </Section>

      <Section title={kloelT(`Neuro IA`)}>
        <LoadingStrip width={132} height={34} marginBottom={12} />
        <LoadingStrip width="100%" height={58} />
      </Section>

      <Section title={kloelT(`Deals`)}>
        {[0, 1].map((index) => (
          <div
            key={`deal-skeleton-${index}`}
            style={{
              background: C.elevated,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: '10px 12px',
              marginBottom: 8,
            }}
          >
            <LoadingStrip width={index === 0 ? '62%' : '48%'} height={13} marginBottom={8} />
            <LoadingStrip width="32%" height={11} />
          </div>
        ))}
      </Section>
    </>
  );
}

/* ── Component ── */
import { ContactDetailDrawer } from "./ContactDetailDrawer";
