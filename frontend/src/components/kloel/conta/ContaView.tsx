'use client';

import { kloelT } from '@/lib/i18n/t';
import { PulseLoader } from '@/components/kloel/PulseLoader';
import { AccountSettingsSection } from '@/components/kloel/settings/account-settings-section';
import { ActivitySection } from '@/components/kloel/settings/activity-section';
import { AnalyticsSettingsSection } from '@/components/kloel/settings/analytics-settings-section';
import { BillingSettingsSection } from '@/components/kloel/settings/billing-settings-section';
import { BrainSettingsSection } from '@/components/kloel/settings/brain-settings-section';
import { CrmSettingsSection } from '@/components/kloel/settings/crm-settings-section';
import { SystemAlertsCard } from '@/components/kloel/settings/system-alerts-card';
import { useSellerConnectAccount } from '@/hooks/useConnectAccounts';
import {
  useBankAccount,
  useFiscalData,
  useKycCompletion,
  useKycDocuments,
  useKycStatus,
  useKycSubmit,
  useProfile,
  type KycCompletion,
} from '@/hooks/useKyc';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import { billingApi } from '@/lib/api';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import DadosPessoaisSection from './ContaDadosPessoaisSection';
import DadosFiscaisSection from './ContaDadosFiscaisSection';
import DocumentosSection from './ContaDocumentosSection';
import DadosBancariosSection from './ContaDadosBancariosSection';
import SegurancaSection from './ContaSegurancaSection';
import NotificacoesSection from './ContaNotificacoesSection';
import PerfilPublicoSection from './ContaPerfilPublicoSection';
import IdiomasSection from './ContaIdiomasSection';
import AjudaSection from './ContaAjudaSection';
import SairSection from './ContaSairSection';
import { ConnectAccountStatusCard } from './ContaConnectAccountCard';
import { TeamSection } from './ContaTeamSection';
import { ContaAppsSection } from './ContaAppsSection';
import { ContaReferralSection } from './ContaReferralSection';
import { ContaInfoSection } from './ContaInfoSection';
import { StatusBadge } from './ContaShared';
import Icons from './ContaIcons';
import { SORA, MONO, EMBER, DEFAULT_SETTINGS_SECTION, resolveSettingsSection } from './ContaConstants';
import { colors } from '@/lib/design-tokens';
import { getErrorMessage } from './ContaHelpers';
import type { SettingsSectionKey } from './ContaTypes';

export default function ContaView() {
  const { isMobile } = useResponsiveViewport();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [section, setSection] = useState<SettingsSectionKey>(() =>
    resolveSettingsSection(searchParams.get('section')),
  );
  const { profile, isLoading: profileLoading, mutate: mutateProfile } = useProfile();
  const { fiscal, mutate: mutateFiscal } = useFiscalData();
  const { documents, mutate: mutateDocs } = useKycDocuments();
  const { bankAccount, mutate: mutateBank } = useBankAccount();
  const { status, mutate: mutateStatus } = useKycStatus();
  const { completion, mutate: mutateCompletion } = useKycCompletion();
  const {
    sellerAccount,
    isLoading: connectAccountLoading,
    error: connectAccountError,
    mutate: mutateConnectAccount,
  } = useSellerConnectAccount();
  const { submitKyc } = useKycSubmit();
  const [submitError, setSubmitError] = useState('');
  const [subscriptionStatus, setSubscriptionStatus] = useState<
    'none' | 'trial' | 'active' | 'expired' | 'suspended'
  >('none');
  const [trialDaysLeft, setTrialDaysLeft] = useState(0);
  const [creditsBalance, setCreditsBalance] = useState(0);
  const [hasCard, setHasCard] = useState(false);

  const completionData: KycCompletion = completion || { percentage: 0, sections: [] };
  const sectionStatus = (name: string) => {
    const s = completionData.sections?.find((sec) => sec.name === name);
    return s?.complete ? 'approved' : 'pending';
  };

  const kycStatus = status?.kycStatus || 'pending';
  const pct = completionData.percentage || 0;
  const isBlocked = pct < 100 || kycStatus !== 'approved';

  const loadBillingSummary = useCallback(async () => {
    try {
      const [subscriptionResponse, paymentMethodsResponse] = await Promise.all([
        billingApi.getSubscription(),
        billingApi.getPaymentMethods(),
      ]);

      if (subscriptionResponse.data) {
        setSubscriptionStatus(subscriptionResponse.data.status ?? 'none');
        setTrialDaysLeft(subscriptionResponse.data.trialDaysLeft ?? 0);
        setCreditsBalance(subscriptionResponse.data.creditsBalance ?? 0);
      } else {
        setSubscriptionStatus('none');
        setTrialDaysLeft(0);
        setCreditsBalance(0);
      }

      setHasCard(!!paymentMethodsResponse.data?.paymentMethods?.length);
    } catch {
      setSubscriptionStatus('none');
      setTrialDaysLeft(0);
      setCreditsBalance(0);
      setHasCard(false);
    }
  }, []);

  useEffect(() => {
    void loadBillingSummary();
  }, [loadBillingSummary]);

  useEffect(() => {
    const nextSection = resolveSettingsSection(searchParams.get('section'));
    setSection((current) => (current === nextSection ? current : nextSection));
  }, [searchParams]);

  const handleSelectSection = useCallback(
    (nextSection: SettingsSectionKey) => {
      setSection(nextSection);
      const params = new URLSearchParams(searchParams.toString());
      if (nextSection === DEFAULT_SETTINGS_SECTION) {
        params.delete('section');
      } else {
        params.set('section', nextSection);
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const handleActivateTrialFromSettings = useCallback(async () => {
    await billingApi.activateTrial();
    await loadBillingSummary();
  }, [loadBillingSummary]);

  const showSystemAlerts =
    section === 'account' ||
    section === 'billing' ||
    section === 'apps' ||
    section === 'brain' ||
    section === 'crm' ||
    section === 'analytics' ||
    section === 'activity';

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

  const mutateAll = () => {
    mutateCompletion();
  };

  return (
    <div
      data-testid="account-settings-root"
      style={{
        minHeight: '100vh',
        background: 'var(--app-bg-primary)',
        fontFamily: SORA,
        color: 'var(--app-text-primary)',
      }}
    >
      <div
        style={{
          maxWidth: 1000,
          margin: '0 auto',
          padding: isMobile ? '20px 16px 28px' : '32px 20px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: isMobile ? 'flex-start' : 'center',
            justifyContent: 'space-between',
            flexDirection: isMobile ? 'column' : 'row',
            gap: 12,
            marginBottom: 24,
          }}
        >
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{kloelT(`Minha conta`)}</h1>
            <p style={{ fontSize: 12, color: 'var(--app-text-secondary)', margin: '4px 0 0' }}>
              {kloelT(`Preencha todos os campos obrigatorios para utilizar a plataforma`)}
            </p>
          </div>
          <StatusBadge status={kycStatus} />
        </div>

        {isBlocked && (
          <div
            style={{
              background: 'rgba(245,158,11,.04)',
              border: '1px solid rgba(245,158,11,.15)',
              borderRadius: 6,
              padding: '14px 18px',
              marginBottom: 20,
              display: 'flex',
              alignItems: isMobile ? 'flex-start' : 'center',
              flexDirection: isMobile ? 'column' : 'row',
              gap: 12,
            }}
          >
            <span style={{ color: colors.semantic.warning }}>{Icons.alert(20)}</span>
            <div style={{ flex: 1 }}>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--app-text-primary)',
                  display: 'block',
                }}
              >
                {kloelT(`Cadastro incompleto`)}
              </span>
              <span style={{ fontSize: 11, color: 'var(--app-text-secondary)' }}>
                {kloelT(`Voce pode visualizar todas as funcionalidades, mas para criar produtos, se afiliar e
                utilizar a IA, complete seu cadastro e aguarde a aprovacao.`)}
              </span>
            </div>
            <div style={{ textAlign: isMobile ? ('left' as const) : ('right' as const) }}>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 24,
                  fontWeight: 700,
                  color: pct === 100 ? colors.semantic.success : colors.semantic.warning,
                }}
              >
                {pct}%
              </span>
              <span style={{ fontSize: 9, color: 'var(--app-text-tertiary)', display: 'block' }}>
                completo
              </span>
            </div>
          </div>
        )}

        {profileLoading && (
          <div
            style={{
              background: 'rgba(59,130,246,.04)',
              border: '1px solid rgba(59,130,246,.15)',
              borderRadius: 6,
              padding: '14px 18px',
              marginBottom: 20,
              display: 'flex',
              alignItems: isMobile ? 'flex-start' : 'center',
              flexDirection: isMobile ? 'column' : 'row',
              gap: 12,
            }}
          >
            <span style={{ color: colors.semantic.info, flexShrink: 0 }}>{Icons.clock(18)}</span>
            <div style={{ flex: 1 }}>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--app-text-primary)',
                  display: 'block',
                }}
              >
                {kloelT(`Sincronizando dados da conta`)}
              </span>
              <span style={{ fontSize: 11, color: 'var(--app-text-secondary)', fontFamily: SORA }}>
                {kloelT(`O painel continua disponível enquanto perfil, workspace e status regulatório são
                revalidados.`)}
              </span>
            </div>
            <PulseLoader width={84} height={18} />
          </div>
        )}

        <ConnectAccountStatusCard
          isMobile={isMobile}
          sellerAccount={sellerAccount}
          isLoading={connectAccountLoading}
          error={connectAccountError}
        />

        <div
          style={{
            height: 4,
            background: 'var(--app-bg-secondary)',
            borderRadius: 2,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${pct}%`,
              background: pct === 100 ? colors.semantic.success : EMBER,
              borderRadius: 2,
              transition: 'width .3s',
            }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 2 }}>
            {SECTIONS.map((sec) => {
              const active = section === sec.key;
              const done = sec.statusKey ? sectionStatus(sec.statusKey) === 'approved' : false;
              return (
                <button
                  type="button"
                  key={sec.key}
                  onClick={() => handleSelectSection(sec.key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 14px',
                    background: active ? 'var(--app-bg-card)' : 'transparent',
                    border: active
                      ? '1px solid var(--app-border-primary)'
                      : '1px solid transparent',
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
                {Icons.alert(14)} {kloelT(`Encerrar conta`)}
              </button>
            </div>
          </div>

          <div key={section} style={{ animation: 'fadeIn .3s' }}>
            {showSystemAlerts && (
              <div style={{ marginBottom: 20 }}>
                <SystemAlertsCard />
              </div>
            )}
            {section === 'pessoal' && (
              <DadosPessoaisSection
                profile={profile}
                mutate={() => {
                  mutateProfile();
                  mutateAll();
                }}
              />
            )}
            {section === 'fiscal' && (
              <DadosFiscaisSection
                fiscal={fiscal}
                mutate={() => {
                  mutateFiscal();
                  mutateAll();
                }}
              />
            )}
            {section === 'documentos' && (
              <DocumentosSection
                documents={documents}
                fiscal={fiscal}
                mutate={() => {
                  mutateDocs();
                  mutateAll();
                }}
              />
            )}
            {section === 'bancario' && (
              <DadosBancariosSection
                bankAccount={bankAccount}
                fiscal={fiscal}
                profile={profile}
                mutate={() => {
                  mutateBank();
                  mutateAll();
                }}
              />
            )}
            {section === 'account' && <AccountSettingsSection />}
            {section === 'billing' && (
              <BillingSettingsSection
                subscriptionStatus={subscriptionStatus}
                trialDaysLeft={trialDaysLeft}
                creditsBalance={creditsBalance}
                hasCard={hasCard}
                onActivateTrial={handleActivateTrialFromSettings}
              />
            )}
            {section === 'brain' && <BrainSettingsSection />}
            {section === 'crm' && <CrmSettingsSection />}
            {section === 'analytics' && <AnalyticsSettingsSection />}
            {section === 'activity' && <ActivitySection />}
            {section === 'seguranca' && <SegurancaSection />}
            {section === 'equipe' && <TeamSection />}
            {section === 'notificacoes' && <NotificacoesSection />}
            {section === 'perfil' && (
              <PerfilPublicoSection
                profile={profile}
                mutate={() => {
                  mutateProfile();
                  mutateAll();
                }}
              />
            )}
            {section === 'apps' && (
              <ContaAppsSection
                handleSelectSection={handleSelectSection}
                router={router}
              />
            )}
            {section === 'presentear' && <ContaReferralSection />}
            {section === 'saiba-mais' && <ContaInfoSection />}
            {section === 'idiomas' && <IdiomasSection />}
            {section === 'ajuda' && <AjudaSection />}
            {section === 'sair' && <SairSection />}
          </div>
        </div>

        {pct >= 100 && kycStatus === 'pending' && (
          <div style={{ marginTop: 32, textAlign: 'center' as const }}>
            {submitError && (
              <span
                style={{
                  fontSize: 12,
                  color: colors.semantic.error,
                  display: 'block',
                  marginBottom: 8,
                  fontFamily: SORA,
                }}
              >
                {submitError}
              </span>
            )}
            <button
              type="button"
              onClick={async () => {
                setSubmitError('');
                try {
                  await submitKyc();
                  mutateCompletion();
                  mutateStatus();
                  mutateConnectAccount();
                } catch (e) {
                  setSubmitError(getErrorMessage(e) || 'Erro ao enviar. Tente novamente.');
                }
              }}
              style={{
                padding: '14px 40px',
                background: EMBER,
                border: 'none',
                borderRadius: 6,
                color: colors.text.silver,
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: SORA,
              }}
            >
              {kloelT(`Enviar para analise`)}
            </button>
          </div>
        )}
      </div>

      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}
