'use client';
import Image from 'next/image';
import { colors } from '@/lib/design-tokens';

import { kloelT } from '@/lib/i18n/t';
import { useState } from 'react';
import { useSecurityMutations, useSecurityState } from '@/hooks/useKyc';
import { SORA } from './ContaConstants';
import { getErrorMessage } from './ContaHelpers';
import { Field, SaveButton, SectionCard } from './ContaShared';

export default function SegurancaSection() {
  const { security, isLoading: loadingSecurity, error: securityError, mutate } = useSecurityState();
  const { changePassword, startMfaSetup, verifyMfaSetup, disableMfa, revokeSession } = useSecurityMutations();
  const [saving, setSaving] = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaQrDataUrl, setMfaQrDataUrl] = useState('');
  const [mfaBusy, setMfaBusy] = useState<'idle' | 'setup' | 'verify' | 'disable'>('idle');
  const [mfaError, setMfaError] = useState('');
  const [mfaSuccess, setMfaSuccess] = useState('');
  const [sessionBusyId, setSessionBusyId] = useState('');
  const [sessionError, setSessionError] = useState('');
  const [sessionSuccess, setSessionSuccess] = useState('');

  const setPw = (k: string, v: string) => setPwForm((prev) => ({ ...prev, [k]: v }));
  const mfaEnabled = security?.mfa.enabled === true;
  const mfaPendingSetup = security?.mfa.pendingSetup === true;
  const mfaStatusColor = mfaEnabled
    ? colors.semantic.success
    : mfaPendingSetup
      ? colors.semantic.warning
      : 'var(--app-text-placeholder)';
  const mfaStatusLabel = loadingSecurity
    ? 'Carregando estado 2FA...'
    : mfaEnabled
      ? '2FA ativo nesta conta'
      : mfaPendingSetup
        ? 'Configuracao 2FA pendente'
        : '2FA inativo nesta conta';
  const sessions = security?.sessions ?? [];
  const formatSessionDate = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(parsed);
  };

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

  const showMfaSuccess = (message: string) => {
    setMfaSuccess(message);
    setTimeout(() => setMfaSuccess(''), 3500);
  };

  const requireMfaCode = () => {
    if (!/^\d{6}$/.test(mfaCode)) {
      setMfaError('Informe o codigo de 6 digitos do aplicativo autenticador.');
      return false;
    }
    return true;
  };

  const handleStartMfa = async () => {
    setMfaError('');
    setMfaSuccess('');
    setMfaBusy('setup');
    try {
      const result = await startMfaSetup();
      setMfaQrDataUrl(result.qrDataUrl || '');
      setMfaCode('');
      await mutate();
      showMfaSuccess('QR code 2FA gerado. Confirme o codigo para ativar.');
    } catch (e) {
      setMfaError(getErrorMessage(e) || 'Nao foi possivel iniciar o 2FA.');
    } finally {
      setMfaBusy('idle');
    }
  };

  const handleVerifyMfa = async () => {
    setMfaError('');
    setMfaSuccess('');
    if (!requireMfaCode()) {
      return;
    }
    setMfaBusy('verify');
    try {
      await verifyMfaSetup(mfaCode);
      setMfaQrDataUrl('');
      setMfaCode('');
      await mutate();
      showMfaSuccess('2FA ativado com sucesso.');
    } catch (e) {
      setMfaError(getErrorMessage(e) || 'Codigo 2FA invalido.');
    } finally {
      setMfaBusy('idle');
    }
  };

  const handleDisableMfa = async () => {
    setMfaError('');
    setMfaSuccess('');
    if (!requireMfaCode()) {
      return;
    }
    setMfaBusy('disable');
    try {
      await disableMfa(mfaCode);
      setMfaCode('');
      await mutate();
      showMfaSuccess('2FA desativado.');
    } catch (e) {
      setMfaError(getErrorMessage(e) || 'Nao foi possivel desativar o 2FA.');
    } finally {
      setMfaBusy('idle');
    }
  };

  const handleCancelMfaSetup = async () => {
    setMfaError('');
    setMfaSuccess('');
    setMfaBusy('disable');
    try {
      await disableMfa();
      setMfaQrDataUrl('');
      setMfaCode('');
      await mutate();
      showMfaSuccess('Configuracao 2FA cancelada.');
    } catch (e) {
      setMfaError(getErrorMessage(e) || 'Nao foi possivel cancelar a configuracao 2FA.');
    } finally {
      setMfaBusy('idle');
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    setSessionError('');
    setSessionSuccess('');
    setSessionBusyId(sessionId);
    try {
      await revokeSession(sessionId);
      await mutate();
      setSessionSuccess('Sessao revogada.');
      setTimeout(() => setSessionSuccess(''), 3000);
    } catch (e) {
      setSessionError(getErrorMessage(e) || 'Nao foi possivel revogar esta sessao.');
    } finally {
      setSessionBusyId('');
    }
  };

  return (
    <>
      <SectionCard
        title={kloelT(`Alterar senha`)}
        subtitle={kloelT(`Use uma senha forte com pelo menos 8 caracteres`)}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleChangePw();
          }}
          style={{ display: 'flex', flexDirection: 'column' as const }}
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
        </form>
      </SectionCard>

      <SectionCard
        title={kloelT(`Autenticacao em dois fatores`)}
        subtitle={kloelT(`Adicione uma camada extra de seguranca a sua conta`)}
      >
        <div style={{ padding: '16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 8, height: 8, borderRadius: '16%', background: mfaStatusColor,
              }}
            />
            <span
              style={{
                fontSize: 13, fontWeight: 600, color: 'var(--app-text-primary)', fontFamily: SORA,
              }}
            >
              {kloelT(mfaStatusLabel)}
            </span>
          </div>
          <p
            style={{
              fontSize: 12, color: 'var(--app-text-secondary)', fontFamily: SORA, marginTop: 6, lineHeight: 1.5,
            }}
          >
            {mfaEnabled
              ? kloelT(`Digite um codigo do aplicativo autenticador para desativar o 2FA.`)
              : kloelT(`Use um aplicativo autenticador para proteger o login desta conta.`)}
          </p>

          {securityError && (
            <span style={{ fontSize: 11, color: colors.semantic.error, marginTop: 8, display: 'block', fontFamily: SORA }}>
              {getErrorMessage(securityError) || 'Nao foi possivel carregar a seguranca.'}
            </span>
          )}

          {mfaQrDataUrl && (
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 16, flexWrap: 'wrap' as const }}>
              <Image
                src={mfaQrDataUrl}
                alt="QR code 2FA"
                width={132}
                height={132}
                unoptimized
                style={{ borderRadius: 6, border: '1px solid var(--app-border-primary)' }}
              />
              <p style={{ fontSize: 11, color: 'var(--app-text-secondary)', fontFamily: SORA, lineHeight: 1.5, flex: 1, minWidth: 180 }}>
                {kloelT(`Escaneie o QR code e confirme o codigo de 6 digitos exibido no aplicativo.`)}
              </p>
            </div>
          )}

          {(mfaPendingSetup || mfaEnabled || mfaQrDataUrl) && (
            <div style={{ marginTop: 16 }}>
              <Field
                label={kloelT(`Codigo 2FA`)}
                placeholder={kloelT(`000000`)}
                value={mfaCode}
                onChange={(value) => setMfaCode(value.replace(/\D/g, '').slice(0, 6))}
                mono
              />
            </div>
          )}

          {mfaError && (
            <span style={{ fontSize: 11, color: colors.semantic.error, marginTop: 8, display: 'block', fontFamily: SORA }}>
              {mfaError}
            </span>
          )}
          {mfaSuccess && (
            <span style={{ fontSize: 12, fontWeight: 600, color: colors.semantic.success, marginTop: 8, display: 'block', fontFamily: SORA }}>
              {mfaSuccess}
            </span>
          )}

          <div style={{ marginTop: 18, display: 'flex', gap: 10, justifyContent: 'flex-end' as const, flexWrap: 'wrap' as const }}>
            {!mfaEnabled && (
              <SaveButton
                saving={mfaBusy === 'setup'}
                onClick={handleStartMfa}
                label={mfaPendingSetup || mfaQrDataUrl ? kloelT(`Reabrir QR code`) : kloelT(`Configurar 2FA`)}
              />
            )}
            {(mfaPendingSetup || mfaQrDataUrl) && (
              <SaveButton saving={mfaBusy === 'disable'} onClick={handleCancelMfaSetup} label={kloelT(`Cancelar configuracao 2FA`)} />
            )}
            {(mfaPendingSetup || mfaQrDataUrl) && (
              <SaveButton saving={mfaBusy === 'verify'} onClick={handleVerifyMfa} label={kloelT(`Confirmar 2FA`)} />
            )}
            {mfaEnabled && (
              <SaveButton saving={mfaBusy === 'disable'} onClick={handleDisableMfa} label={kloelT(`Desativar 2FA`)} />
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title={kloelT(`Sessoes ativas`)}
        subtitle={kloelT(`Gerencie os acessos autenticados a sua conta`)}
      >
        <div style={{ padding: '16px 0', display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
          {sessionError && (
            <span style={{ fontSize: 11, color: colors.semantic.error, fontFamily: SORA }}>
              {sessionError}
            </span>
          )}
          {sessionSuccess && (
            <span style={{ fontSize: 12, fontWeight: 600, color: colors.semantic.success, fontFamily: SORA }}>
              {sessionSuccess}
            </span>
          )}
          {loadingSecurity ? (
            <span style={{ fontSize: 12, color: 'var(--app-text-secondary)', fontFamily: SORA }}>
              {kloelT(`Carregando sessoes...`)}
            </span>
          ) : securityError ? (
            <span style={{ fontSize: 12, color: colors.semantic.error, fontFamily: SORA }}>
              {getErrorMessage(securityError) || 'Nao foi possivel carregar as sessoes.'}
            </span>
          ) : sessions.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--app-text-secondary)', fontFamily: SORA, lineHeight: 1.5, margin: 0 }}>
              {kloelT(`Nenhuma sessao ativa encontrada para esta conta.`)}
            </p>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 14,
                  padding: '12px 14px',
                  border: '1px solid var(--app-border-primary)',
                  borderRadius: 6,
                  background: 'var(--app-bg-secondary)',
                  flexWrap: 'wrap' as const,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4, minWidth: 220 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--app-text-primary)', fontFamily: SORA }}>
                    {kloelT(`Sessao autenticada`)}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--app-text-secondary)', fontFamily: SORA }}>
                    {kloelT(`Criada em`)} {formatSessionDate(session.createdAt)} · {kloelT(`Expira em`)} {formatSessionDate(session.expiresAt)}
                  </span>
                </div>
                <SaveButton
                  saving={sessionBusyId === session.id}
                  onClick={() => handleRevokeSession(session.id)}
                  label={kloelT(`Revogar sessao`)}
                />
              </div>
            ))
          )}
        </div>
      </SectionCard>
    </>
  );
}
