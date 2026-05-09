'use client';

import { kloelT } from '@/lib/i18n/t';

import { AiToolsPanel } from './ai-tools-panel';
import { AttendanceRulesSection } from './attendance-rules-section';
import { AutopilotSection } from './autopilot-section';
import type {
  CompanyProfile,
  EmergencyModeProfile,
  FaqItem,
  OpeningMessageProfile,
  VoiceToneProfile,
} from './brain-settings-section.helpers';
import {
  normalizeCompanyProfile,
  normalizeEmergencyMode,
  normalizeFaqs,
  normalizeOpeningMessage,
  normalizeVoiceToneProfile,
} from './brain-settings-section.helpers';
import { CompanyIdentitySection } from './company-identity-section';
import { CustomerPersonasSection } from './customer-personas-section';
import { EmergencyModeCard } from './emergency-mode-card';
import { FaqSection } from './faq-section';
import { KnowledgeBaseSection } from './knowledge-base-section';
import { KloelStatusCard } from './kloel-status-card';
import { MissingStepsCard } from './missing-steps-card';
import { OpeningMessageCard } from './opening-message-card';
import { ProductCatalogSection } from './product-catalog-section';
import { VoiceToneSection } from './voice-tone-section';
import { SettingsNotice, kloelSettingsClass } from './contract';
import { tokenStorage, workspaceApi } from '@/lib/api';
import { useCallback, useEffect, useMemo, useState } from 'react';

export function BrainSettingsSection() {
  const workspaceId = tokenStorage.getWorkspaceId();
  const [company, setCompany] = useState<CompanyProfile>({
    name: '',
    sector: '',
    description: '',
    mission: '',
    differentials: [''],
  });

  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');

  const [personas, setPersonas] = useState<string[]>([]);

  const [voiceTone, setVoiceTone] = useState<VoiceToneProfile>({
    style: '',
    customInstructions: '',
    useProfessional: true,
    useFriendly: false,
    usePersuasive: false,
  });

  const [rules, setRules] = useState<string[]>([]);

  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [openingMessage, setOpeningMessage] = useState<OpeningMessageProfile>({
    message: '',
    useEmojis: true,
    isFormal: false,
    isFriendly: true,
  });
  const [emergencyMode, setEmergencyMode] = useState<EmergencyModeProfile>({
    emergencyAction: '',
    fixedMessage: '',
  });

  const [productCount, setProductCount] = useState(0);
  const [productsWithCheckoutCount, setProductsWithCheckoutCount] = useState(0);
  const [knowledgeSourceCount, setKnowledgeSourceCount] = useState(0);

  const handleProductsLoaded = useCallback(
    (products: { activePlansCount?: number }[]) => {
      setProductCount(products.length);
      setProductsWithCheckoutCount(
        products.filter((p) => (p.activePlansCount ?? 0) > 0).length,
      );
    },
    [],
  );

  const handleSourcesLoaded = useCallback((count: number) => {
    setKnowledgeSourceCount(count);
  }, []);

  const hydrateProfile = useCallback(async () => {
    if (!workspaceId) {
      setCompany(normalizeCompanyProfile(null));
      setPersonas([]);
      setVoiceTone(normalizeVoiceToneProfile(null));
      setRules([]);
      setFaqs([]);
      return;
    }

    setProfileLoading(true);
    setProfileError('');

    try {
      const response = await workspaceApi.getMe();
      const workspace = response.data as Record<string, unknown> | undefined;
      const provSettings = workspace?.providerSettings as Record<string, unknown> | undefined;
      const profile = (provSettings?.kloelProfile || {}) as Record<string, unknown>;

      setCompany(normalizeCompanyProfile(profile.company));
      setPersonas(
        Array.isArray(profile.personas)
          ? profile.personas.filter((value: unknown) => typeof value === 'string')
          : [],
      );
      setVoiceTone(normalizeVoiceToneProfile(profile.voiceTone));
      setRules(
        Array.isArray(profile.rules)
          ? profile.rules.filter((value: unknown) => typeof value === 'string')
          : [],
      );
      setFaqs(normalizeFaqs(profile.faqs));
      setOpeningMessage(normalizeOpeningMessage(profile.openingMessage));
      setEmergencyMode(normalizeEmergencyMode(profile.emergencyMode));
    } catch (error: unknown) {
      setProfileError(
        error instanceof Error ? error.message : 'Nao foi possivel carregar o perfil do Kloel.',
      );
    } finally {
      setProfileLoading(false);
    }
  }, [workspaceId]);

  const saveKloelProfile = useCallback(
    async (
      successMessage: string,
      overrides?: Partial<{
        company: CompanyProfile;
        personas: string[];
        voiceTone: VoiceToneProfile;
        rules: string[];
        faqs: FaqItem[];
        openingMessage: OpeningMessageProfile;
        emergencyMode: EmergencyModeProfile;
      }>,
    ) => {
      if (!workspaceId) {
        return;
      }

      setProfileSaving(true);
      setProfileError('');
      setProfileSuccess('');

      try {
        const nextCompany = overrides?.company || company;
        const nextPersonas = overrides?.personas || personas;
        const nextVoiceTone = overrides?.voiceTone || voiceTone;
        const nextRules = overrides?.rules || rules;
        const nextFaqs = overrides?.faqs || faqs;
        const nextOpeningMessage = overrides?.openingMessage || openingMessage;
        const nextEmergencyMode = overrides?.emergencyMode || emergencyMode;

        await workspaceApi.updateSettings({
          kloelProfile: {
            company: {
              ...nextCompany,
              differentials: nextCompany.differentials.filter((item) => item.trim().length > 0),
            },
            personas: nextPersonas.filter((item) => item.trim().length > 0),
            voiceTone: nextVoiceTone,
            rules: nextRules.filter((item) => item.trim().length > 0),
            faqs: nextFaqs.filter((faq) => faq.question.trim() || faq.answer.trim()),
            openingMessage: nextOpeningMessage,
            emergencyMode: nextEmergencyMode,
          },
        });
        setProfileSuccess(successMessage);
      } catch (error: unknown) {
        setProfileError(
          error instanceof Error ? error.message : 'Nao foi possivel salvar o perfil do Kloel.',
        );
      } finally {
        setProfileSaving(false);
      }
    },
    [company, emergencyMode, faqs, openingMessage, personas, rules, voiceTone, workspaceId],
  );

  useEffect(() => {
    void hydrateProfile();
  }, [hydrateProfile]);

  const hasVoiceTone = voiceTone.style !== '';
  const hasFaq = faqs.length > 0;
  const hasProducts = productCount > 0;
  const hasFiles = knowledgeSourceCount > 0;
  const hasCheckout = productsWithCheckoutCount > 0;
  const hasOpeningMessage = openingMessage.message.trim().length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h3 className={kloelSettingsClass.sectionTitle}>{kloelT(`Configurar Kloel`)}</h3>
        <p className={`mt-1 ${kloelSettingsClass.sectionDescription}`}>
          {kloelT(`Ensine o Kloel sobre seu negocio para um atendimento perfeito.`)}
        </p>
      </div>

      {(profileError || profileSuccess) && (
        <div
          className={`rounded-md border px-4 py-3 text-sm ${
            profileError
              ? 'border-[#E05252]/25 bg-[#E05252]/10 text-[#F7A8A8]'
              : 'border-[colors.border.space] bg-[colors.background.surface] text-[colors.text.silver]'
          }`}
        >
          {profileError || profileSuccess}
        </div>
      )}

      {profileLoading ? (
        <SettingsNotice>{kloelT(`Carregando perfil persistido do Kloel...`)}</SettingsNotice>
      ) : null}

      <KloelStatusCard
        filesProcessed={knowledgeSourceCount}
        productsConfigured={productCount}
        rulesLearned={rules.length}
        faqFilled={faqs.length}
        voiceToneDefined={hasVoiceTone}
        checkoutConfigured={hasCheckout}
      />

      <MissingStepsCard
        hasProducts={hasProducts}
        hasFiles={hasFiles}
        hasCheckout={hasCheckout}
        hasVoiceTone={hasVoiceTone}
        hasFaq={hasFaq}
        hasOpeningMessage={hasOpeningMessage}
        hasWhatsApp={false}
      />

      <OpeningMessageCard
        value={openingMessage}
        saving={profileSaving}
        onSave={(payload) => {
          setOpeningMessage(payload);
          return saveKloelProfile('Mensagem de abertura salva.', {
            openingMessage: payload,
          });
        }}
      />

      <CompanyIdentitySection
        value={company}
        saving={profileSaving}
        disabled={!workspaceId}
        onSave={(payload) => {
          setCompany(payload);
          return saveKloelProfile('Identidade da empresa salva.', { company: payload });
        }}
      />

      <ProductCatalogSection
        knowledgeSources={[]}
        onProductsLoaded={handleProductsLoaded}
      />

      <CustomerPersonasSection
        value={personas}
        saving={profileSaving}
        disabled={!workspaceId}
        onSave={(payload) => {
          setPersonas(payload);
          return saveKloelProfile('Personas salvas.', { personas: payload });
        }}
      />

      <VoiceToneSection
        value={voiceTone}
        saving={profileSaving}
        disabled={!workspaceId}
        onSave={(payload) => {
          setVoiceTone(payload);
          return saveKloelProfile('Tom de voz salvo.', { voiceTone: payload });
        }}
      />

      <AttendanceRulesSection
        value={rules}
        saving={profileSaving}
        disabled={!workspaceId}
        onSave={(payload) => {
          setRules(payload);
          return saveKloelProfile('Regras de atendimento salvas.', { rules: payload });
        }}
      />

      <FaqSection
        value={faqs}
        saving={profileSaving}
        disabled={!workspaceId}
        onSave={(payload) => {
          setFaqs(payload);
          return saveKloelProfile('FAQ salvo no perfil do Kloel.', { faqs: payload });
        }}
      />

      <KnowledgeBaseSection
        onSourcesLoaded={handleSourcesLoaded}
      />

      <EmergencyModeCard
        value={emergencyMode}
        saving={profileSaving}
        onSave={(payload) => {
          setEmergencyMode(payload);
          return saveKloelProfile('Configuracao de emergencia salva.', {
            emergencyMode: payload,
          });
        }}
      />

      <AutopilotSection />

      <AiToolsPanel />
    </div>
  );
}
