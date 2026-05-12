'use client';

import { kloelT } from '@/lib/i18n/t';
import { PulseLoader } from '@/components/kloel/PulseLoader';
import { useSellerConnectAccount } from '@/hooks/useConnectAccounts';
import { summarizeSellerConnectAccount, SellerConnectState } from './ContaConnectStatus.helpers';
import Icons from './ContaIcons';
import { SORA } from './ContaConstants';
import { getErrorMessage } from './ContaHelpers';
import { SectionCard } from './ContaShared';

const CONNECT_STATE_CONFIG: Record<
  SellerConnectState,
  { color: string; bg: string; border: string; icon: (s: number) => React.ReactNode }
> = {
  not_started: {
    color: 'var(--app-text-secondary)',
    bg: 'var(--app-bg-secondary)',
    border: 'var(--app-border-primary)',
    icon: Icons.clock,
  },
  action_required: {
    color: 'var(--app-warning)',
    bg: 'var(--app-warning-bg)',
    border: 'color-mix(in srgb, var(--app-warning) 18%, transparent)',
    icon: Icons.alert,
  },
  in_review: {
    color: 'var(--app-info)',
    bg: 'var(--app-info-bg)',
    border: 'color-mix(in srgb, var(--app-info) 18%, transparent)',
    icon: Icons.eye,
  },
  restricted: {
    color: 'var(--app-error)',
    bg: 'var(--app-error-bg)',
    border: 'color-mix(in srgb, var(--app-error) 18%, transparent)',
    icon: Icons.x,
  },
  active: {
    color: 'var(--app-success)',
    bg: 'var(--app-success-bg)',
    border: 'color-mix(in srgb, var(--app-success) 18%, transparent)',
    icon: Icons.check,
  },
};

interface ConnectAccountStatusCardProps {
  isMobile: boolean;
  sellerAccount: ReturnType<typeof useSellerConnectAccount>['sellerAccount'];
  isLoading: boolean;
  error: unknown;
}

export function ConnectAccountStatusCard({
  isMobile,
  sellerAccount,
  isLoading,
  error,
}: ConnectAccountStatusCardProps) {
  const summary = summarizeSellerConnectAccount(sellerAccount);
  const onboarding = sellerAccount?.onboarding;
  const tone = CONNECT_STATE_CONFIG[summary.state];
  const openRequirements = summary.requirements.slice(0, 5);
  const remainingRequirements = Math.max(summary.requirements.length - openRequirements.length, 0);
  const helperText = sellerAccount
    ? 'Sempre que uma nova pendência for solicitada, ela aparece aqui para regularização dentro do seu fluxo Kloel.'
    : 'Assim que você concluir o cadastro e enviar para análise, esta área passa a mostrar as verificações e liberações da sua conta de recebimento.';
  const metrics = [
    {
      label: 'Cadastro enviado',
      value: onboarding?.detailsSubmitted ? 'Sim' : sellerAccount ? 'Parcial' : 'Não',
    },
    {
      label: 'Recebimentos',
      value: onboarding?.chargesEnabled ? 'Liberados' : sellerAccount ? 'Pendentes' : 'Aguardando',
    },
    {
      label: 'Saques',
      value: onboarding?.payoutsEnabled ? 'Liberados' : sellerAccount ? 'Pendentes' : 'Aguardando',
    },
    {
      label: 'Pendências abertas',
      value: String(summary.requirements.length),
    },
  ];

  return (
    <SectionCard title={kloelT(`Conta de recebimento`)} subtitle={kloelT(summary.description)}>
      {isLoading ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '6px 0',
          }}
        >
          <div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--app-text-primary)',
                fontFamily: SORA,
              }}
            >
              {kloelT(`Consultando status da conta`)}
            </div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--app-text-secondary)',
                fontFamily: SORA,
                marginTop: 4,
              }}
            >
              {kloelT(`Aguarde enquanto validamos as pendências e liberações mais recentes.`)}
            </div>
          </div>
          <PulseLoader width={88} height={18} />
        </div>
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: isMobile ? 'flex-start' : 'center',
              justifyContent: 'space-between',
              flexDirection: isMobile ? 'column' : 'row',
              gap: 14,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--app-text-secondary)',
                  fontFamily: SORA,
                  textTransform: 'uppercase',
                  letterSpacing: '.04em',
                }}
              >
                {kloelT(`Status atual`)}
              </div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 8,
                  padding: '7px 12px',
                  background: tone.bg,
                  border: `1px solid ${tone.border}`,
                  borderRadius: 16,
                  color: tone.color,
                }}
              >
                {tone.icon(14)}
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: tone.color,
                    fontFamily: SORA,
                  }}
                >
                  {kloelT(summary.label)}
                </span>
              </div>
            </div>

            <div
              style={{
                maxWidth: isMobile ? '100%' : 360,
                fontSize: 12,
                lineHeight: 1.6,
                color: 'var(--app-text-secondary)',
                fontFamily: SORA,
              }}
            >
              {kloelT(helperText)}
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, minmax(0, 1fr))',
              gap: 10,
              marginTop: 18,
            }}
          >
            {metrics.map((metric) => (
              <div
                key={metric.label}
                style={{
                  background: 'var(--app-bg-primary)',
                  border: '1px solid var(--app-border-primary)',
                  borderRadius: 6,
                  padding: '12px 14px',
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: 'var(--app-text-secondary)',
                    fontFamily: SORA,
                    textTransform: 'uppercase',
                    letterSpacing: '.04em',
                  }}
                >
                  {kloelT(metric.label)}
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: 'var(--app-text-primary)',
                    fontFamily: SORA,
                    marginTop: 6,
                  }}
                >
                  {kloelT(metric.value)}
                </div>
              </div>
            ))}
          </div>

          {summary.disabledReason && (
            <div
              style={{
                marginTop: 14,
                background: 'var(--app-error-bg)',
                border: '1px solid color-mix(in srgb, var(--app-error) 14%, transparent)',
                borderRadius: 6,
                padding: '12px 14px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  color: 'var(--app-error)',
                  fontSize: 12,
                  fontWeight: 700,
                  fontFamily: SORA,
                }}
              >
                {Icons.alert(14)}
                {kloelT(`Restrição identificada`)}
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 12,
                  lineHeight: 1.6,
                  color: 'var(--app-text-secondary)',
                  fontFamily: SORA,
                }}
              >
                {kloelT(summary.disabledReason)}
              </div>
            </div>
          )}

          {openRequirements.length > 0 && (
            <div
              style={{
                marginTop: 14,
                background: 'var(--app-warning-bg)',
                border: '1px solid color-mix(in srgb, var(--app-warning) 14%, transparent)',
                borderRadius: 6,
                padding: '12px 14px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  color: 'var(--app-warning)',
                  fontSize: 12,
                  fontWeight: 700,
                  fontFamily: SORA,
                }}
              >
                {Icons.alert(14)}
                {kloelT(`Itens que exigem atenção`)}
              </div>
              <ul
                style={{
                  margin: '10px 0 0',
                  paddingLeft: 18,
                  color: 'var(--app-text-secondary)',
                  fontSize: 12,
                  lineHeight: 1.7,
                  fontFamily: SORA,
                }}
              >
                {openRequirements.map((requirement) => (
                  <li key={requirement}>{kloelT(requirement)}</li>
                ))}
              </ul>
              {remainingRequirements > 0 && (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 11,
                    color: 'var(--app-text-secondary)',
                    fontFamily: SORA,
                  }}
                >
                  {kloelT(`E mais ${remainingRequirements} item(ns) pendente(s).`)}
                </div>
              )}
            </div>
          )}

          {error && (
            <div
              style={{
                marginTop: 14,
                background: 'var(--app-error-bg)',
                border: '1px solid color-mix(in srgb, var(--app-error) 14%, transparent)',
                borderRadius: 6,
                padding: '12px 14px',
                fontSize: 12,
                lineHeight: 1.6,
                color: 'var(--app-text-secondary)',
                fontFamily: SORA,
              }}
            >
              {kloelT(
                getErrorMessage(error) ||
                  'Não foi possível atualizar o status da conta de recebimento agora.',
              )}
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}
