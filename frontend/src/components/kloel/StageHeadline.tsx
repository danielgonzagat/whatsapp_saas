'use client';

import { ReactNode } from 'react';
import { colors } from '@/lib/design-tokens';

// ============================================
// TYPES
// ============================================

export interface StageHeadlineProps {
  /** Main headline - should be an operational invitation */
  headline: string;
  /** Optional highlighted word/phrase (will be colored in brand green) */
  highlight?: string;
  /** Subheadline - short promise that reduces anxiety */
  subheadline?: string;
  /** Additional content below subheadline */
  children?: ReactNode;
  /** Size variant */
  size?: 'xl' | 'l' | 'dock';
  /** Additional class */
  className?: string;
}

// ============================================
// SIZE STYLES
// ============================================

const SIZE_STYLES = {
  xl: {
    headline: 'text-4xl md:text-5xl',
    subheadline: 'text-lg md:text-xl',
    spacing: 'mb-4',
  },
  l: {
    headline: 'text-3xl md:text-4xl',
    subheadline: 'text-base md:text-lg',
    spacing: 'mb-3',
  },
  dock: {
    headline: 'text-2xl md:text-3xl',
    subheadline: 'text-sm md:text-base',
    spacing: 'mb-2',
  },
};

// ============================================
// COMPONENT
// ============================================

/**
 * StageHeadline - The operational invitation at the center of each page
 * 
 * Blueprint rules:
 * - Always in form of operational invitation
 * - Examples: "Como posso ajudar seu negócio hoje?"
 *            "O que você quer que eu faça no seu WhatsApp agora?"
 *            "Vamos encher seu funil de leads?"
 * 
 * Subheadline should be a short, reassuring promise:
 * - "Peça em linguagem natural. Eu configuro e executo por você."
 * - "Eu cuido disso. Você só aprova."
 */
export function StageHeadline({
  headline,
  highlight,
  subheadline,
  children,
  size = 'l',
  className,
}: StageHeadlineProps) {
  const styles = SIZE_STYLES[size];

  // If highlight is provided, split the headline
  const renderHeadline = () => {
    if (!highlight) {
      return headline;
    }

    const parts = headline.split(highlight);
    if (parts.length === 1) {
      return headline;
    }

    return (
      <>
        {parts[0]}
        <span style={{ color: colors.brand.green }}>{highlight}</span>
        {parts[1]}
      </>
    );
  };

  return (
    <div className={className}>
      {/* Headline */}
      <h1
        className={`font-bold ${styles.headline} ${styles.spacing}`}
        style={{ color: colors.text.primary }}
      >
        {renderHeadline()}
      </h1>

      {/* Subheadline */}
      {subheadline && (
        <p
          className={`${styles.subheadline} mb-8`}
          style={{ color: colors.text.secondary }}
        >
          {subheadline}
        </p>
      )}

      {/* Additional content */}
      {children}
    </div>
  );
}

// ============================================
// PRESET HEADLINES (per Blueprint)
// ============================================

export const STAGE_HEADLINES = {
  dashboard: {
    headline: 'Como posso ajudar o seu negócio hoje?',
    highlight: 'negócio',
    subheadline: 'Peça e eu configuro, opero e otimizo suas vendas no WhatsApp.',
  },
  whatsapp: {
    headline: 'O que você quer que eu faça no seu WhatsApp agora?',
    highlight: 'WhatsApp',
    subheadline: 'Eu cuido da conexão, mensagens e automações. Você só aprova.',
  },
  leads: {
    headline: 'Vamos alimentar seu funil de leads?',
    highlight: 'funil',
    subheadline: 'Importe, segmente e ative leads. Eu faço o trabalho pesado.',
  },
  products: {
    headline: 'Ensine seus produtos para eu vender por você.',
    highlight: 'vender',
    subheadline: 'Anexe catálogo, descreva ofertas. Eu memorizo e recomendo.',
  },
  sales: {
    headline: 'Quer que eu aumente suas vendas esta semana?',
    highlight: 'vendas',
    subheadline: 'Analiso padrões, sugiro campanhas e otimizo automaticamente.',
  },
  integrations: {
    headline: 'O que você quer conectar?',
    highlight: 'conectar',
    subheadline: 'Pagamentos, CRM, email. Eu integro e sincronizo tudo.',
  },
  flows: {
    headline: 'Vamos criar um fluxo de automação?',
    highlight: 'automação',
    subheadline: 'Descreva o que quer. Eu construo e executo o fluxo.',
  },
  campaigns: {
    headline: 'Que campanha vamos lançar hoje?',
    highlight: 'lançar',
    subheadline: 'Diga o objetivo. Eu crio, programo e disparo.',
  },
  autopilot: {
    headline: 'Deixe o Autopilot cuidar das vendas.',
    highlight: 'Autopilot',
    subheadline: 'Eu respondo, qualifica e converto. Você só acompanha.',
  },
} as const;
