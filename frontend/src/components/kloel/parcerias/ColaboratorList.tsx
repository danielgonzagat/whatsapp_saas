'use client';
import { colors } from '@/lib/design-tokens';

import { kloelT } from '@/lib/i18n/t';
import { IC } from './ParceriasView.icons';
import { C, FONT } from './ParceriasDesignTokens';
import type { Agent } from './partnershipTypes';

const ROLES: { value: string; label: string; color: string }[] = [
  { value: 'admin', label: 'Admin', color: 'colors.ember.primary' },
  { value: 'manager', label: 'Manager', color: colors.semantic.info },
  { value: 'support', label: 'Support', color: colors.semantic.success },
  { value: 'finance', label: 'Finance', color: colors.semantic.warning },
  { value: 'viewer', label: 'Viewer', color: 'var(--app-text-secondary)' },
];

const HEADERS = [
  '',
  kloelT(`Nome`),
  kloelT(`Email`),
  kloelT(`Funcao`),
  kloelT(`Status`),
  kloelT(`Ultimo acesso`),
] as const;

const HEADER_COLS = Object.freeze([44, null, 160, 100, 100, 120] as const);

function headerStyle(): React.CSSProperties {
  return {
    fontFamily: FONT.sans, fontSize: 11, color: C.muted, fontWeight: 500,
    textTransform: 'uppercase' as const, letterSpacing: '0.05em',
  };
}

export default function ColaboratorList({
  filtered,
  hasData,
}: {
  filtered: Agent[];
  hasData: boolean;
}) {
  const gridCols = HEADER_COLS.map((c) => (c ? `${c}px` : '1fr')).join(' ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 14, padding: '10px 18px', marginBottom: 4 }}>
        {HEADERS.map((h, i) =>
          i === 0 ? <span key={i} /> : <span key={i} style={headerStyle()}>{h}</span>,
        )}
      </div>

      {filtered.map((c) => {
        const roleConf = ROLES.find((r) => r.value === c.role) || ROLES[ROLES.length - 1];
        return (
          <div key={c.id || c.email}
            style={{
              display: 'grid', gridTemplateColumns: gridCols, gap: 14, alignItems: 'center',
              padding: '14px 18px', background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 6, transition: 'border-color 150ms ease',
            }}>
            <div style={{ position: 'relative' }}>
              <div style={{ width: 40, height: 40, borderRadius: '16%', background: C.elevated, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT.sans, fontSize: 15, fontWeight: 600, color: C.text }}>
                {(c.name || c.email || '?')[0].toUpperCase()}
              </div>
              <div style={{ width: 8, height: 8, borderRadius: '16%', background: c.status === 'online' ? colors.semantic.success : C.muted, border: `2px solid ${C.card}`, position: 'absolute' as const, bottom: 0, right: 0 }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: FONT.sans, fontSize: 14, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{c.name}</div>
            </div>
            <div style={{ fontFamily: FONT.sans, fontSize: 12, color: C.secondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{c.email}</div>
            <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, fontFamily: FONT.sans, color: roleConf.color, background: `${roleConf.color}15`, letterSpacing: '0.02em', textTransform: 'uppercase' as const, width: 'fit-content' }}>{roleConf.label}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: '16%', background: c.status === 'online' ? colors.semantic.success : C.muted }} />
              <span style={{ fontFamily: FONT.sans, fontSize: 12, color: c.status === 'online' ? colors.semantic.success : C.muted }}>{c.status === 'online' ? 'Online' : 'Offline'}</span>
            </div>
            <span style={{ fontFamily: FONT.sans, fontSize: 11, color: C.muted, whiteSpace: 'nowrap' as const }}>{c.lastActive || ''}</span>
          </div>
        );
      })}

      {filtered.length === 0 && !hasData && (
        <div style={{ background: 'var(--app-bg-card)', border: '1px solid var(--app-border-primary)', borderRadius: 6, padding: '60px 20px', textAlign: 'center' as const }}>
          <span style={{ fontSize: 14, color: 'var(--app-text-tertiary)', display: 'block', marginBottom: 8 }}>{kloelT(`Nenhum colaborador cadastrado`)}</span>
          <span style={{ fontSize: 12, color: 'var(--app-text-tertiary)' }}>{kloelT(`Convide colaboradores para gerenciar seu workspace`)}</span>
        </div>
      )}
      {filtered.length === 0 && hasData && (
        <div style={{ textAlign: 'center' as const, padding: 48, background: C.card, border: `1px solid ${C.border}`, borderRadius: 6 }}>
          <span style={{ color: C.muted }}>{IC.users(32)}</span>
          <p style={{ fontFamily: FONT.sans, fontSize: 14, color: C.secondary, marginTop: 12 }}>{kloelT(`Nenhum colaborador encontrado`)}</p>
        </div>
      )}
    </div>
  );
}
