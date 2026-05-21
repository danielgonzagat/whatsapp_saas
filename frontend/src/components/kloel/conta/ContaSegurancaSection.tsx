'use client';
import { colors } from '@/lib/design-tokens';

import { kloelT } from '@/lib/i18n/t';
import { useState } from 'react';
import { useSecurityMutations } from '@/hooks/useKyc';
import { SORA } from './ContaConstants';
import { getErrorMessage } from './ContaHelpers';
import { Field, SaveButton, SectionCard } from './ContaShared';

export default function SegurancaSection() {
  const { changePassword } = useSecurityMutations();
  const [saving, setSaving] = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);

  const setPw = (k: string, v: string) => setPwForm((prev) => ({ ...prev, [k]: v }));

  const handleChangePw = async () => {
    setPwError('');
    setPwSuccess(false);
    if (pwForm.newPw !== pwForm.confirm) {
      setPwError('As senhas nao coincidem.');
      return;
    }
    if (pwForm.newPw.length < 8) {
      setPwError('A nova senha deve ter pelo menos 8 caracteres.');
      return;
    }
    setSaving(true);
    try {
      await changePassword(pwForm.current, pwForm.newPw);
      setPwForm({ current: '', newPw: '', confirm: '' });
      setPwSuccess(true);
      setTimeout(() => setPwSuccess(false), 3000);
    } catch (e) {
      setPwError(getErrorMessage(e) || 'Erro ao alterar senha. Verifique a senha atual.');
    }
    setSaving(false);
  };

  return (
    <>
      <SectionCard
        title={kloelT(`Alterar senha`)}
        subtitle={kloelT(`Use uma senha forte com pelo menos 8 caracteres`)}
      >
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
          <Field
            label={kloelT(`Senha atual`)}
            placeholder={kloelT(`Digite a senha atual`)}
            value={pwForm.current}
            onChange={(v) => setPw('current', v)}
            type="password"
          />
          <Field
            label={kloelT(`Nova senha`)}
            placeholder={kloelT(`Minimo 8 caracteres`)}
            value={pwForm.newPw}
            onChange={(v) => setPw('newPw', v)}
            type="password"
          />
          <Field
            label={kloelT(`Confirmar nova senha`)}
            placeholder={kloelT(`Repita a nova senha`)}
            value={pwForm.confirm}
            onChange={(v) => setPw('confirm', v)}
            type="password"
          />
        </div>
        {pwError && (
          <span
            style={{ fontSize: 11, color: colors.semantic.error, marginTop: 8, display: 'block', fontFamily: SORA }}
          >
            {pwError}
          </span>
        )}
        <div
          style={{
            marginTop: 20,
            display: 'flex',
            justifyContent: 'flex-end' as const,
            alignItems: 'center',
            gap: 12,
          }}
        >
          {pwSuccess && (
            <span style={{ fontSize: 12, fontWeight: 600, color: colors.semantic.success, fontFamily: SORA }}>
              {kloelT(`Senha alterada!`)}
            </span>
          )}
          <SaveButton saving={saving} onClick={handleChangePw} label={kloelT(`Alterar senha`)} />
        </div>
      </SectionCard>

      <SectionCard
        title={kloelT(`Autenticacao em dois fatores`)}
        subtitle={kloelT(`Adicione uma camada extra de seguranca a sua conta`)}
      >
        <div style={{ padding: '16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 8, height: 8, borderRadius: '16%', background: 'var(--app-text-placeholder)',
              }}
            />
            <span
              style={{
                fontSize: 13, fontWeight: 600, color: 'var(--app-text-primary)', fontFamily: SORA,
              }}
            >
              {kloelT(`Ainda indisponivel nesta conta`)}
            </span>
          </div>
          <p
            style={{
              fontSize: 12, color: 'var(--app-text-secondary)', fontFamily: SORA, marginTop: 6, lineHeight: 1.5,
            }}
          >
            {kloelT(`Enquanto isso, mantenha uma senha forte e acompanhe acessos suspeitos pelo seu e-mail de
            cadastro.`)}
          </p>
        </div>
      </SectionCard>

      <SectionCard
        title={kloelT(`Sessoes ativas`)}
        subtitle={kloelT(`Gerencie os dispositivos conectados a sua conta`)}
      >
        <div style={{ padding: '16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span
              style={{
                width: 8, height: 8, borderRadius: '16%', background: 'var(--app-text-placeholder)',
              }}
            />
            <span
              style={{
                fontSize: 13, fontWeight: 600, color: 'var(--app-text-primary)', fontFamily: SORA,
              }}
            >
              {kloelT(`Visao unificada ainda nao disponivel`)}
            </span>
          </div>
          <p
            style={{
              fontSize: 12, color: 'var(--app-text-secondary)', fontFamily: SORA, lineHeight: 1.5,
            }}
          >
            {kloelT(`Esta area sera usada para listar dispositivos e permitir revogar acessos sem sair do
            painel principal.`)}
          </p>
        </div>
      </SectionCard>
    </>
  );
}
