'use client';

import { AccountSettingsSection } from '@/components/kloel/settings/account-settings-section';
import { ActivitySection } from '@/components/kloel/settings/activity-section';
import { AnalyticsSettingsSection } from '@/components/kloel/settings/analytics-settings-section';
import { BillingSettingsSection } from '@/components/kloel/settings/billing-settings-section';
import { BrainSettingsSection } from '@/components/kloel/settings/brain-settings-section';
import { CrmSettingsSection } from '@/components/kloel/settings/crm-settings-section';
import { SystemAlertsCard } from '@/components/kloel/settings/system-alerts-card';
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
import { TeamSection } from './ContaTeamSection';
import { ContaAppsSection } from './ContaAppsSection';
import { ContaReferralSection } from './ContaReferralSection';
import { ContaInfoSection } from './ContaInfoSection';
import type { SettingsSectionKey } from './ContaTypes';
import type { useProfile, useFiscalData, useKycDocuments, useBankAccount } from '@/hooks/useKyc';

interface ContentPanelProps {
  section: SettingsSectionKey;
  showSystemAlerts: boolean;
  profile: ReturnType<typeof useProfile>['profile'];
  fiscal: ReturnType<typeof useFiscalData>['fiscal'];
  documents: ReturnType<typeof useKycDocuments>['documents'];
  bankAccount: ReturnType<typeof useBankAccount>['bankAccount'];
  subscriptionStatus: 'none' | 'trial' | 'active' | 'expired' | 'suspended';
  trialDaysLeft: number;
  creditsBalance: number;
  hasCard: boolean;
  onActivateTrial: () => Promise<void>;
  mutateProfile: ReturnType<typeof useProfile>['mutate'];
  mutateFiscal: ReturnType<typeof useFiscalData>['mutate'];
  mutateDocs: ReturnType<typeof useKycDocuments>['mutate'];
  mutateBank: ReturnType<typeof useBankAccount>['mutate'];
  mutateAll: () => void;
  handleSelectSection: (next: SettingsSectionKey) => void;
  router: ReturnType<typeof import('next/navigation').useRouter>;
}

export function ContaContentPanel({
  section,
  showSystemAlerts,
  profile,
  fiscal,
  documents,
  bankAccount,
  subscriptionStatus,
  trialDaysLeft,
  creditsBalance,
  hasCard,
  onActivateTrial,
  mutateProfile,
  mutateFiscal,
  mutateDocs,
  mutateBank,
  mutateAll,
  handleSelectSection,
  router,
}: ContentPanelProps) {
  return (
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
          onActivateTrial={onActivateTrial}
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
        <ContaAppsSection handleSelectSection={handleSelectSection} router={router} />
      )}
      {section === 'presentear' && <ContaReferralSection />}
      {section === 'saiba-mais' && <ContaInfoSection />}
      {section === 'idiomas' && <IdiomasSection />}
      {section === 'ajuda' && <AjudaSection />}
      {section === 'sair' && <SairSection />}
    </div>
  );
}
