'use client';
import { colors } from '@/lib/design-tokens';

import { kloelT } from '@/lib/i18n/t';
import { inviteCollaborator } from '@/hooks/usePartnerships';
import { useId, useState } from 'react';
import { IC } from './ParceriasView.icons';
import { C, FONT } from './ParceriasDesignTokens';

const ROLES: { value: string; label: string; color: string }[] = [
  { value: 'admin', label: 'Admin', color: 'colors.ember.primary' },
  { value: 'manager', label: 'Manager', color: colors.semantic.info },
  { value: 'support', label: 'Support', color: colors.semantic.success },
  { value: 'finance', label: 'Finance', color: colors.semantic.warning },
  { value: 'viewer', label: 'Viewer', color: 'var(--app-text-secondary)' },
];

export default function ColaboratorInvitationForm({ onClose }: { onClose: () => void }) {
  const fid = useId();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('manager');
  const [sending, setSending] = useState(false);

  const inviteRoles = ROLES.filter((r) => r.value !== 'admin');

  const handleSubmit = async () => {
    if (!email.trim()) {return;}
    setSending(true);
    try {
      await inviteCollaborator({ email, role });
      onClose();
    } catch (e) {
      console.error('Failed to invite', e);
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        role="button" tabIndex={0} aria-label="Fechar modal" onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.currentTarget as HTMLElement).click(); } }}
      />
      <div
        style={{
          position: 'relative', width: '100%', maxWidth: 440, background: C.card,
          border: `1px solid ${C.border}`, borderRadius: 6, padding: 28, animation: 'slideIn 200ms ease',
        }}
      >
        <button type="button" onClick={onClose}
          style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
          <span style={{ color: C.secondary }}>{IC.x(16)}</span>
        </button>
        <h2 style={{ fontFamily: FONT.sans, fontSize: 18, fontWeight: 700, color: C.text, margin: '0 0 4px' }}>
          {kloelT(`Convidar Colaborador`)}
        </h2>
        <p style={{ fontFamily: FONT.sans, fontSize: 13, color: C.secondary, margin: '0 0 24px' }}>
          {kloelT(`Envie um convite por email para adicionar um novo membro a equipe.`)}
        </p>
        <label style={{ fontFamily: FONT.sans, fontSize: 12, fontWeight: 500, color: C.secondary, display: 'block', marginBottom: 6 }} htmlFor={`${fid}-email`}>
          {kloelT(`Email`)}
        </label>
        <input
          aria-label="Email do colaborador" type="email" value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={kloelT(`colaborador@email.com`)}
          style={{ width: '100%', padding: '10px 14px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: FONT.sans, fontSize: 13, outline: 'none', marginBottom: 16, boxSizing: 'border-box' as const }}
          id={`${fid}-email`}
        />
        <span style={{ fontFamily: FONT.sans, fontSize: 12, fontWeight: 500, color: C.secondary, display: 'block', marginBottom: 6 }}>
          {kloelT(`Funcao`)}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }}>
          {inviteRoles.map((r) => (
            <button type="button" key={r.value} onClick={() => setRole(r.value)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                background: role === r.value ? C.emberBg : C.bg,
                border: `1px solid ${role === r.value ? C.ember : C.border}`, borderRadius: 6,
                cursor: 'pointer', textAlign: 'left' as const,
              }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: r.color }} />
              <span style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 500, color: C.text }}>{r.label}</span>
              {role === r.value && <span style={{ marginLeft: 'auto', color: C.ember }}>{IC.check(14)}</span>}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose}
            style={{ padding: '9px 18px', background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, color: C.secondary, fontFamily: FONT.sans, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            {kloelT(`Cancelar`)}
          </button>
          <button type="button" onClick={handleSubmit} disabled={sending || !email.trim()}
            style={{ padding: '9px 22px', background: C.ember, border: 'none', borderRadius: 6, color: colors.text.silver, fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, cursor: sending ? 'wait' : 'pointer', opacity: !email.trim() ? 0.5 : 1 }}>
            {sending ? 'Enviando...' : 'Enviar Convite'}
          </button>
        </div>
      </div>
    </div>
  );
}
