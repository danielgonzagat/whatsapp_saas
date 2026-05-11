'use client';
import { colors } from '@/lib/design-tokens';

import { kloelT } from '@/lib/i18n/t';
import { useState } from 'react';
import Icons from './ContaIcons';
import { SORA, EMBER } from './ContaConstants';
import { SectionCard } from './ContaShared';
import type { LanguageDef } from './ContaTypes';

const LANGUAGES: ReadonlyArray<LanguageDef> = [
  { key: 'pt-BR', label: 'Portugues (BR)', code: 'BR', disabled: false },
];

function LanguageOption({
  lang,
  isActive,
  onActivate,
}: {
  lang: LanguageDef;
  isActive: boolean;
  onActivate: () => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onActivate()}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '14px 18px',
        background: isActive
          ? 'var(--app-accent-light)'
          : 'var(--app-bg-card)',
        border: isActive ? `1px solid ${EMBER}` : '1px solid var(--app-border-primary)',
        borderRadius: 8,
        cursor: 'pointer',
        transition: 'all 150ms ease',
        textAlign: 'left' as const,
        fontFamily: SORA,
        width: '100%',
      }}
    >
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          border: isActive ? `2px solid ${EMBER}` : '2px solid var(--app-text-placeholder)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'border-color 150ms ease',
        }}
      >
        {isActive && <div style={{ width: 8, height: 8, borderRadius: '50%', background: EMBER }} />}
      </div>
      <span
        style={{
          fontSize: 10,
          lineHeight: '16px',
          letterSpacing: '0.08em',
          textTransform: 'uppercase' as const,
          color: colors.text.muted,
          minWidth: 24,
          flexShrink: 0,
        }}
      >
        {lang.code}
      </span>
      <span
        style={{
          fontSize: 13,
          fontWeight: isActive ? 600 : 400,
          color: isActive ? 'var(--app-text-primary)' : 'var(--app-text-secondary)',
          flex: 1,
        }}
      >
        {lang.label}
      </span>
      {isActive && (
        <span style={{ color: EMBER, flexShrink: 0 }}>{Icons.check(14)}</span>
      )}
    </button>
  );
}

export default function IdiomasSection() {
  const [language, setLanguage] = useState(() => {
    if (typeof window === 'undefined') {
      return 'pt-BR';
    }
    return localStorage.getItem('kloel:language') || 'pt-BR';
  });

  const handleChange = (value: string) => {
    setLanguage(value);
    localStorage.setItem('kloel:language', value);
  };

  return (
    <SectionCard
      title={kloelT(`Idiomas`)}
      subtitle={kloelT(`Selecione o idioma de preferencia da plataforma`)}
    >
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
        {LANGUAGES.map((lang) => (
          <LanguageOption
            key={lang.key}
            lang={lang}
            isActive={language === lang.key}
            onActivate={() => handleChange(lang.key)}
          />
        ))}
      </div>
      <div
        style={{
          marginTop: 16,
          background: 'rgba(59,130,246,.04)',
          border: '1px solid rgba(59,130,246,.15)',
          borderRadius: 6,
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
        }}
      >
        <span style={{ color: colors.semantic.info, marginTop: 2, flexShrink: 0 }}>{Icons.clock(16)}</span>
        <span style={{ fontSize: 11, color: 'var(--app-text-secondary)', fontFamily: SORA }}>
          {kloelT(`A traducao completa da plataforma esta em andamento. Algumas secoes podem permanecer em
          portugues temporariamente.`)}
        </span>
      </div>
    </SectionCard>
  );
}
