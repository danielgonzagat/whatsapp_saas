'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import Icons from './ContaIcons';
import { SORA, EMBER } from './ContaConstants';
import type { SettingsSectionKey } from './ContaTypes';

const SECTIONS: Array<{
  key: SettingsSectionKey;
  label: string;
  icon: (s: number) => React.ReactNode;
  statusKey: string | null;
}> = [
  { key: 'pessoal', label: 'Dados pessoais', icon: Icons.user, statusKey: 'profile' },
  { key: 'fiscal', label: 'Dados fiscais', icon: Icons.building, statusKey: 'fiscal' },
  { key: 'documentos', label: 'Documentos', icon: Icons.doc, statusKey: 'documents' },
  { key: 'bancario', label: 'Dados bancarios', icon: Icons.bank, statusKey: 'bank' },
  { key: 'idiomas', label: 'Idiomas', icon: Icons.language, statusKey: null },
  { key: 'sair', label: 'Sair', icon: Icons.logout, statusKey: null },
];

interface ContaSidebarProps {
  section: SettingsSectionKey;
  sectionStatus: (name: string) => string;
  onSelectSection: (next: SettingsSectionKey) => void;
}

export function ContaSidebar({ section, sectionStatus, onSelectSection }: ContaSidebarProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 2 }}>
      {SECTIONS.map((sec) => {
        const active = section === sec.key;
        const done = sec.statusKey ? sectionStatus(sec.statusKey) === 'approved' : false;
        return (
          <button
            type="button"
            key={sec.key}
            onClick={() => onSelectSection(sec.key)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 14px',
              background: active ? 'var(--app-bg-card)' : 'transparent',
              border: active ? '1px solid var(--app-border-primary)' : '1px solid transparent',
              borderRadius: 6,
              cursor: 'pointer',
              transition: 'all .15s',
              textAlign: 'left' as const,
              fontFamily: SORA,
            }}
          >
            <span
              style={{
                color: active ? EMBER : done ? colors.semantic.success : 'var(--app-text-placeholder)',
              }}
            >
              {sec.icon(16)}
            </span>
            <span
              style={{
                fontSize: 12,
                fontWeight: active ? 600 : 400,
                color: active ? 'var(--app-text-primary)' : 'var(--app-text-secondary)',
                flex: 1,
              }}
            >
              {sec.label}
            </span>
            {done ? <span style={{ color: colors.semantic.success }}>{Icons.check(12)}</span> : null}
          </button>
        );
      })}

      <div
        style={{
          marginTop: 'auto',
          paddingTop: 20,
          borderTop: '1px solid var(--app-border-subtle)',
        }}
      >
        <button
          type="button"
          onClick={() => {
            if (
              confirm(
                'Para encerrar sua conta, entre em contato com nosso suporte via chat ou WhatsApp.',
              )
            ) {
              /* no-op */
            }
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 14px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: colors.semantic.error,
            fontSize: 11,
            fontFamily: SORA,
          }}
        >
          {Icons.alert(14)} {kloelT('Encerrar conta')}
        </button>
      </div>
    </div>
  );
}
