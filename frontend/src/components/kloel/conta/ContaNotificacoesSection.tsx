'use client';
import { colors } from '@/lib/design-tokens';

import { kloelT } from '@/lib/i18n/t';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type EmailNotificationPreferences,
} from '@/lib/api/notifications';
import { getErrorMessage } from './ContaHelpers';
import { SectionCard, Spinner } from './ContaShared';
import { EMBER, SORA } from './ContaConstants';

/**
 * Honest catalog: the ONLY automatic, optional e-mail the platform sends to
 * the account owner today is the onboarding/tips sequence (day 1/3/7).
 * Security and legal e-mails are listed below as always-on (not toggleable).
 */
const EMAIL_TOGGLES: Array<{
  key: keyof EmailNotificationPreferences;
  title: string;
  description: string;
}> = [
  {
    key: 'emailTips',
    title: 'Dicas e novidades por e-mail',
    description:
      'Sequencia de boas-vindas com dicas praticas dos primeiros dias (3 e-mails) e novidades do Kloel.',
  },
];

const ALWAYS_ON_ROWS: Array<{ title: string; description: string }> = [
  {
    title: 'E-mails de seguranca',
    description:
      'Verificacao de e-mail, redefinicao de senha e link magico de acesso. Sempre ativos para proteger sua conta.',
  },
  {
    title: 'Confirmacoes legais e de privacidade',
    description:
      'Confirmacoes de exportacao e exclusao de dados (LGPD). Sempre ativas por obrigacao legal.',
  },
];

function ToggleSwitch({
  checked,
  disabled,
  label,
  onToggle,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      style={{
        width: 36,
        height: 20,
        padding: 2,
        borderRadius: 6,
        border: '1px solid var(--app-border-primary)',
        background: checked ? EMBER : 'var(--app-bg-secondary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: checked ? 'flex-end' : 'flex-start',
        transition: 'background .15s',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          width: 12,
          height: 12,
          borderRadius: 4,
          background: checked ? 'var(--app-text-on-accent)' : 'var(--app-text-placeholder)',
          display: 'block',
        }}
      />
    </button>
  );
}

export default function NotificacoesSection() {
  const [preferences, setPreferences] = useState<EmailNotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [savingKey, setSavingKey] = useState<keyof EmailNotificationPreferences | null>(null);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // O effect de mount não seta estado sincronamente (react-hooks/set-state-in-effect):
  // `loading` já nasce true e `loadError` nasce vazio; os resets síncronos só
  // existem no retry, que é disparado por evento de clique.
  const load = useCallback(async () => {
    try {
      const prefs = await getNotificationPreferences();
      setPreferences(prefs);
      setLoadError('');
    } catch (e) {
      setLoadError(getErrorMessage(e) || 'Nao foi possivel carregar as preferencias.');
    } finally {
      setLoading(false);
    }
  }, []);

  const retry = useCallback(() => {
    setLoading(true);
    setLoadError('');
    void load();
  }, [load]);

  useEffect(() => {
    // Timer-0 kickoff (padrão do repo p/ react-hooks/set-state-in-effect):
    // o fetch dispara fora do ciclo síncrono do effect, com cancel no cleanup.
    const kickoff = window.setTimeout(() => {
      void load();
    }, 0);
    return () => {
      window.clearTimeout(kickoff);
      if (successTimer.current) {
        clearTimeout(successTimer.current);
      }
    };
  }, [load]);

  const handleToggle = async (key: keyof EmailNotificationPreferences) => {
    if (!preferences || savingKey) {
      return;
    }
    const nextValue = !preferences[key];
    setSavingKey(key);
    setSaveError('');
    setSaveSuccess(false);
    try {
      const saved = await updateNotificationPreferences({ [key]: nextValue });
      setPreferences(saved);
      setSaveSuccess(true);
      if (successTimer.current) {
        clearTimeout(successTimer.current);
      }
      successTimer.current = setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      setSaveError(getErrorMessage(e) || 'Nao foi possivel salvar a preferencia.');
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <>
      <SectionCard
        title={kloelT(`Notificacoes por e-mail`)}
        subtitle={kloelT(`Escolha quais e-mails opcionais voce quer receber nesta conta`)}
      >
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0' }}>
            <Spinner />
            <span style={{ fontSize: 12, color: 'var(--app-text-secondary)', fontFamily: SORA }}>
              {kloelT(`Carregando preferencias...`)}
            </span>
          </div>
        ) : loadError ? (
          <div style={{ padding: '12px 0' }}>
            <span
              style={{ fontSize: 12, color: colors.semantic.error, fontFamily: SORA, display: 'block' }}
            >
              {loadError}
            </span>
            <button
              type="button"
              onClick={retry}
              style={{
                marginTop: 10,
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid var(--app-border-primary)',
                borderRadius: 6,
                color: 'var(--app-text-primary)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: SORA,
              }}
            >
              {kloelT(`Tentar novamente`)}
            </button>
          </div>
        ) : preferences ? (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
            {EMAIL_TOGGLES.map((toggle) => (
              <div
                key={toggle.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 14,
                  padding: '12px 14px',
                  border: '1px solid var(--app-border-primary)',
                  borderRadius: 6,
                  background: 'var(--app-bg-secondary)',
                }}
              >
                <div style={{ flex: 1, minWidth: 180 }}>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--app-text-primary)',
                      fontFamily: SORA,
                      display: 'block',
                    }}
                  >
                    {kloelT(toggle.title)}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--app-text-secondary)',
                      fontFamily: SORA,
                      lineHeight: 1.5,
                      display: 'block',
                      marginTop: 2,
                    }}
                  >
                    {kloelT(toggle.description)}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {savingKey === toggle.key && <Spinner size={12} />}
                  <ToggleSwitch
                    checked={preferences[toggle.key]}
                    disabled={savingKey !== null}
                    label={toggle.title}
                    onToggle={() => void handleToggle(toggle.key)}
                  />
                </div>
              </div>
            ))}
            {saveError && (
              <span style={{ fontSize: 11, color: colors.semantic.error, fontFamily: SORA }}>
                {saveError}
              </span>
            )}
            {saveSuccess && (
              <span
                style={{ fontSize: 12, fontWeight: 600, color: colors.semantic.success, fontFamily: SORA }}
              >
                {kloelT(`Preferencia salva!`)}
              </span>
            )}
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        title={kloelT(`Sempre ativos`)}
        subtitle={kloelT(`E-mails essenciais que nao podem ser desligados`)}
      >
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
          {ALWAYS_ON_ROWS.map((row) => (
            <div key={row.title} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '16%',
                  background: colors.semantic.success,
                  marginTop: 4,
                  flexShrink: 0,
                }}
              />
              <div>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--app-text-primary)',
                    fontFamily: SORA,
                    display: 'block',
                  }}
                >
                  {kloelT(row.title)}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--app-text-secondary)',
                    fontFamily: SORA,
                    lineHeight: 1.5,
                    display: 'block',
                    marginTop: 2,
                  }}
                >
                  {kloelT(row.description)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </>
  );
}

