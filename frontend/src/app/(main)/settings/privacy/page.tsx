'use client';

import { useState } from 'react';
import { Button } from '@/components/kloel';
import { gdprApi } from '@/lib/api/privacy';
import { colors } from '@/lib/design-tokens';

type Action = 'export' | 'delete';
type Status = 'idle' | 'confirming' | 'submitting' | 'success' | 'error';

interface ConfirmState {
  action: Action;
  status: Status;
  message: string;
  requestCode?: string;
}

const REQUIRED_TOKEN: Record<Action, string> = {
  export: 'EXPORT',
  delete: 'DELETE',
};

const COPY: Record<Action, { title: string; body: string; cta: string }> = {
  export: {
    title: 'Exportar meus dados',
    body:
      'Receba uma cópia em formato JSON de todos os dados pessoais que mantemos sobre você ' +
      '(contatos, conversas, vendas, configurações). O processo pode levar até 24 horas.',
    cta: 'Solicitar exportação',
  },
  delete: {
    title: 'Excluir minha conta',
    body:
      'Esta ação remove permanentemente todos os seus dados, conversas, vendas e ' +
      'configurações. Não há volta — backups são automaticamente expirados em 30 dias. ' +
      'Pagamentos já capturados continuam disponíveis no Stripe/MercadoPago por requisitos ' +
      'fiscais e financeiros.',
    cta: 'Solicitar exclusão',
  },
};

export default function PrivacySettingsPage() {
  const [state, setState] = useState<ConfirmState | null>(null);
  const [confirmInput, setConfirmInput] = useState('');

  function startConfirm(action: Action) {
    setState({ action, status: 'confirming', message: '' });
    setConfirmInput('');
  }

  function cancel() {
    setState(null);
    setConfirmInput('');
  }

  async function submit() {
    if (!state) return;
    const required = REQUIRED_TOKEN[state.action];
    if (confirmInput !== required) {
      setState({ ...state, status: 'error', message: `Digite exatamente ${required} para confirmar.` });
      return;
    }
    setState({ ...state, status: 'submitting', message: '' });

    try {
      const res =
        state.action === 'export'
          ? await gdprApi.requestGdprExport()
          : await gdprApi.requestGdprDeletion();

      const code = res.data?.code;
      setState({
        action: state.action,
        status: 'success',
        message:
          state.action === 'export'
            ? 'Solicitação registrada. Você receberá um e-mail com o link de download em até 24h.'
            : 'Solicitação de exclusão registrada. Confirme via e-mail para que o processo se inicie.',
        ...(code !== undefined && { requestCode: code }),
      });
    } catch (err) {
      setState({
        ...state,
        status: 'error',
        message: err instanceof Error ? err.message : 'Falha ao registrar a solicitação. Tente novamente.',
      });
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px' }}>
      <h1 style={{ color: colors.text.primary, fontSize: 28, fontWeight: 600, marginBottom: 8 }}>
        Privacidade & Dados
      </h1>
      <p style={{ color: colors.text.silver, fontSize: 14, marginBottom: 32 }}>
        Direitos garantidos pela LGPD (Art. 18): acesso, portabilidade e exclusão. As solicitações
        são processadas pela equipe Kloel em até 24 horas. Veja{' '}
        <a href="/privacy" style={{ color: colors.ember.primary }}>
          Política de Privacidade
        </a>{' '}
        para detalhes legais.
      </p>

      {/* Two action cards */}
      <div style={{ display: 'grid', gap: 16 }}>
        {(['export', 'delete'] as const).map((action) => {
          const c = COPY[action];
          return (
            <div
              key={action}
              style={{
                background: colors.background.surface,
                border: `1px solid ${colors.border.space}`,
                borderRadius: 6,
                padding: 20,
              }}
            >
              <h2 style={{ color: colors.text.primary, fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
                {c.title}
              </h2>
              <p style={{ color: colors.text.silver, fontSize: 13, marginBottom: 16 }}>{c.body}</p>
              <Button
                variant={action === 'delete' ? 'danger' : 'secondary'}
                onClick={() => startConfirm(action)}
                disabled={state?.action === action && state.status === 'submitting'}
              >
                {c.cta}
              </Button>
            </div>
          );
        })}
      </div>

      {/* Confirm modal */}
      {state && state.status !== 'success' && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
          onClick={cancel}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: colors.background.void,
              border: `1px solid ${colors.border.space}`,
              borderRadius: 6,
              padding: 24,
              width: 480,
              maxWidth: 'calc(100vw - 32px)',
            }}
          >
            <h3 style={{ color: colors.text.primary, fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
              Confirmar {state.action === 'delete' ? 'exclusão' : 'exportação'}
            </h3>
            <p style={{ color: colors.text.silver, fontSize: 13, marginBottom: 16 }}>
              Para confirmar, digite{' '}
              <code style={{ color: colors.ember.primary, fontWeight: 600 }}>
                {REQUIRED_TOKEN[state.action]}
              </code>{' '}
              abaixo:
            </p>
            <input
              type="text"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              autoFocus
              autoComplete="off"
              style={{
                width: '100%',
                padding: '10px 12px',
                background: colors.background.surface,
                border: `1px solid ${colors.border.space}`,
                borderRadius: 4,
                color: colors.text.primary,
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 14,
                marginBottom: 16,
              }}
            />
            {state.message && state.status === 'error' && (
              <p style={{ color: colors.ember.primary, fontSize: 13, marginBottom: 12 }}>{state.message}</p>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={cancel} disabled={state.status === 'submitting'}>
                Cancelar
              </Button>
              <Button
                variant={state.action === 'delete' ? 'danger' : 'primary'}
                onClick={submit}
                disabled={state.status === 'submitting' || confirmInput !== REQUIRED_TOKEN[state.action]}
              >
                {state.status === 'submitting' ? 'Enviando...' : 'Confirmar'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Success */}
      {state?.status === 'success' && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
          onClick={cancel}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: colors.background.void,
              border: `1px solid ${colors.border.space}`,
              borderRadius: 6,
              padding: 24,
              width: 480,
              maxWidth: 'calc(100vw - 32px)',
            }}
          >
            <h3 style={{ color: colors.text.primary, fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
              Solicitação registrada
            </h3>
            <p style={{ color: colors.text.silver, fontSize: 13, marginBottom: 12 }}>{state.message}</p>
            {state.requestCode && (
              <p style={{ color: colors.text.silver, fontSize: 12, marginBottom: 16 }}>
                Código:{' '}
                <code style={{ color: colors.ember.primary, fontFamily: 'JetBrains Mono, monospace' }}>
                  {state.requestCode}
                </code>
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="primary" onClick={cancel}>
                Entendi
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
