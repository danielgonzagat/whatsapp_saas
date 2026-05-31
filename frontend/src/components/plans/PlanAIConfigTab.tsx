'use client';
import { kloelT } from '@/lib/i18n/t';
import { KloelMushroomMark } from '@/components/kloel/KloelBrand';
import { apiFetch } from '@/lib/api';
import { colors, typography } from '@/lib/design-tokens';
import { Brain, CheckCircle, Save } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { mutate } from 'swr';

import { OBJECTIONS } from './PlanAIConfig.data';
import {
  assignBoolean,
  assignNumber,
  assignRecordString,
  assignString,
  assignStringArray,
  buildAIConfigPayload,
  buildAIConfigSummary,
  buildAIConfigSummaryItems,
  computeAIConfigCompleteness,
  isProductsSwrKey,
  parseSiblingPlansResponse,
  toggleListValue,
  type SiblingPlanResponseRow,
  type SiblingPlanRow,
} from './PlanAIConfig.helpers';
import { AISummaryBox } from './PlanAIConfig.summary';
import { BehaviorSection } from './PlanAIConfig.behavior';
import { CustomerProfileSection } from './PlanAIConfig.customer-profile';
import { ObjectionsSection } from './PlanAIConfig.objections';
import { PositioningSection } from './PlanAIConfig.positioning';
import { SalesArgsSection } from './PlanAIConfig.sales-args';
import { TechInfoSection } from './PlanAIConfig.tech-info';
import { UpsellSection } from './PlanAIConfig.upsell';

export function PlanAIConfigTab({ planId, productId }: { planId: string; productId: string }) {
  const fid = useId();
  const uid = useId();

  // Loading/saving state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (savedTimer.current) {
        clearTimeout(savedTimer.current);
      }
    },
    [],
  );

  // Section 1 — Customer Profile
  const [genders, setGenders] = useState<string[]>(['Todos']);
  const [ages, setAges] = useState<string[]>(['25-34', '35-44']);
  const [moments, setMoments] = useState<string[]>([]);
  const [knowledge, setKnowledge] = useState('INFORMED');
  const [buyingPower, setBuyingPower] = useState('COST_BENEFIT');
  const [problem, setProblem] = useState('');

  // Section 2 — Positioning
  const [tier, setTier] = useState('MAIN');
  const [whenOffer, setWhenOffer] = useState<string[]>([]);
  const [differentiators, setDifferentiators] = useState<string[]>([]);
  const [scarcity, setScarcity] = useState('NONE');

  // Section 3 — Objections
  const [objectionStates, setObjectionStates] = useState<
    Record<string, { enabled: boolean; response: string }>
  >(Object.fromEntries(OBJECTIONS.map((o) => [o.id, { enabled: true, response: o.responses[0] }])));

  // Section 4 — Sales Arguments
  const [socialProof, setSocialProof] = useState<string[]>([]);
  const [socialProofValues, setSocialProofValues] = useState<Record<string, string>>({});
  const [guarantee, setGuarantee] = useState<string[]>([]);
  const [guaranteeValues, setGuaranteeValues] = useState<Record<string, string>>({});
  const [benefits, setBenefits] = useState<string[]>([]);
  const [benefitsValues, setBenefitsValues] = useState<Record<string, string>>({});
  const [urgencyArgs, setUrgencyArgs] = useState<string[]>([]);
  const [urgencyValues, setUrgencyValues] = useState<Record<string, string>>({});

  // Section 5 — Upsell/Downsell
  const [upsellEnabled, setUpsellEnabled] = useState(false);
  const [upsellTargetPlan, setUpsellTargetPlan] = useState('');
  const [upsellWhen, setUpsellWhen] = useState<string[]>([]);
  const [upsellArgument, setUpsellArgument] = useState('');
  const [downsellEnabled, setDownsellEnabled] = useState(false);
  const [downsellTargetPlan, setDownsellTargetPlan] = useState('');
  const [downsellWhen, setDownsellWhen] = useState<string[]>([]);
  const [downsellArgument, setDownsellArgument] = useState('');
  const [siblingPlans, setSiblingPlans] = useState<SiblingPlanRow[]>([]);

  // Section 6 — AI Behavior
  const [tone, setTone] = useState('CONSULTIVE');
  const [persistence, setPersistence] = useState(3);
  const [messageLimit, setMessageLimit] = useState(10);
  const [followUpHours, setFollowUpHours] = useState('24');
  const [followUpMax, setFollowUpMax] = useState('3');

  // Section 7 — Technical Info
  const [hasTechInfo, setHasTechInfo] = useState(false);
  const [usageMode, setUsageMode] = useState('');
  const [duration, setDuration] = useState('');
  const [contraindications, setContraindications] = useState<string[]>([]);
  const [expectedResults, setExpectedResults] = useState('');

  const toggleList = (list: string[], item: string, setter: (v: string[]) => void) => {
    setter(toggleListValue(list, item));
  };

  // Load config
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await apiFetch<Record<string, unknown>>(`/products/${productId}/ai-config`);
        const data = res.data as Record<string, unknown> | undefined;
        if (data) {
          assignStringArray(data, 'genders', setGenders);
          assignStringArray(data, 'ages', setAges);
          assignStringArray(data, 'moments', setMoments);
          assignString(data, 'knowledge', setKnowledge);
          assignString(data, 'buyingPower', setBuyingPower);
          assignString(data, 'problem', setProblem);
          assignString(data, 'tier', setTier);
          assignStringArray(data, 'whenOffer', setWhenOffer);
          assignStringArray(data, 'differentiators', setDifferentiators);
          assignString(data, 'scarcity', setScarcity);
          if (data.objectionStates && typeof data.objectionStates === 'object') {
            setObjectionStates(
              data.objectionStates as Record<string, { enabled: boolean; response: string }>,
            );
          }
          assignStringArray(data, 'socialProof', setSocialProof);
          assignRecordString(data, 'socialProofValues', setSocialProofValues);
          assignStringArray(data, 'guarantee', setGuarantee);
          assignRecordString(data, 'guaranteeValues', setGuaranteeValues);
          assignStringArray(data, 'benefits', setBenefits);
          assignRecordString(data, 'benefitsValues', setBenefitsValues);
          assignStringArray(data, 'urgencyArgs', setUrgencyArgs);
          assignRecordString(data, 'urgencyValues', setUrgencyValues);
          assignBoolean(data, 'upsellEnabled', setUpsellEnabled);
          assignString(data, 'upsellTargetPlan', setUpsellTargetPlan);
          assignStringArray(data, 'upsellWhen', setUpsellWhen);
          assignString(data, 'upsellArgument', setUpsellArgument);
          assignBoolean(data, 'downsellEnabled', setDownsellEnabled);
          assignString(data, 'downsellTargetPlan', setDownsellTargetPlan);
          assignStringArray(data, 'downsellWhen', setDownsellWhen);
          assignString(data, 'downsellArgument', setDownsellArgument);
          assignString(data, 'tone', setTone);
          assignNumber(data, 'persistence', setPersistence);
          assignNumber(data, 'messageLimit', setMessageLimit);
          assignString(data, 'followUpHours', setFollowUpHours);
          assignString(data, 'followUpMax', setFollowUpMax);
          assignBoolean(data, 'hasTechInfo', setHasTechInfo);
          assignString(data, 'usageMode', setUsageMode);
          assignString(data, 'duration', setDuration);
          assignStringArray(data, 'contraindications', setContraindications);
          assignString(data, 'expectedResults', setExpectedResults);
        }
      } catch {}
      setLoading(false);
    };
    loadConfig();
  }, [productId]);

  // Fetch sibling plans
  useEffect(() => {
    const loadPlans = async () => {
      try {
        const data = await apiFetch<SiblingPlanResponseRow[]>(`/products/${productId}/plans`);
        setSiblingPlans(parseSiblingPlansResponse(data.data, planId));
      } catch {}
    };
    loadPlans();
  }, [productId, planId]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setShowSaved(false);
    try {
      await apiFetch(`/products/${productId}/ai-config`, {
        method: 'PUT',
        body: buildAIConfigPayload({
          planId,
          genders,
          ages,
          moments,
          knowledge,
          buyingPower,
          problem,
          tier,
          whenOffer,
          differentiators,
          scarcity,
          objectionStates,
          socialProof,
          socialProofValues,
          guarantee,
          guaranteeValues,
          benefits,
          benefitsValues,
          urgencyArgs,
          urgencyValues,
          upsellEnabled,
          upsellTargetPlan,
          upsellWhen,
          upsellArgument,
          downsellEnabled,
          downsellTargetPlan,
          downsellWhen,
          downsellArgument,
          tone,
          persistence,
          messageLimit,
          followUpHours,
          followUpMax,
          hasTechInfo,
          usageMode,
          duration,
          contraindications,
          expectedResults,
        }),
      });
      mutate(isProductsSwrKey);
      setShowSaved(true);
      if (savedTimer.current) {clearTimeout(savedTimer.current);}
      savedTimer.current = setTimeout(() => setShowSaved(false), 3000);
    } catch {}
    setSaving(false);
  }, [
    planId,
    productId,
    genders,
    ages,
    moments,
    knowledge,
    buyingPower,
    problem,
    tier,
    whenOffer,
    differentiators,
    scarcity,
    objectionStates,
    socialProof,
    socialProofValues,
    guarantee,
    guaranteeValues,
    benefits,
    benefitsValues,
    urgencyArgs,
    urgencyValues,
    upsellEnabled,
    upsellTargetPlan,
    upsellWhen,
    upsellArgument,
    downsellEnabled,
    downsellTargetPlan,
    downsellWhen,
    downsellArgument,
    tone,
    persistence,
    messageLimit,
    followUpHours,
    followUpMax,
    hasTechInfo,
    usageMode,
    duration,
    contraindications,
    expectedResults,
  ]);

  // Section title renderer
  const sectionTitle = (t: string) => (
    <h3
      className="mb-3 mt-2 text-sm font-semibold uppercase"
      style={{
        fontFamily: typography.fontFamily.display,
        color: colors.text.starlight,
        letterSpacing: '0.02em',
      }}
    >
      {t}
    </h3>
  );

  // Completeness indicators — derived purely from form state
  const completeness = computeAIConfigCompleteness({
    genders,
    ages,
    problem,
    tier,
    whenOffer,
    differentiators,
    objectionStates,
    socialProof,
    guarantee,
    benefits,
    urgencyArgs,
    upsellEnabled,
    upsellTargetPlan,
    downsellEnabled,
    downsellTargetPlan,
    tone,
    persistence,
    hasTechInfo,
    usageMode,
    contraindications,
  });
  const { activeObjections, totalArgs } = completeness;
  const summaryItems = useMemo(() => buildAIConfigSummaryItems(completeness), [completeness]);

  const summary = useMemo(
    () =>
      buildAIConfigSummary({
        tone,
        persistence,
        messageLimit,
        activeObjections,
        totalArgs,
        genders,
        ages,
        tier,
      }),
    [tone, persistence, messageLimit, activeObjections, totalArgs, genders, ages, tier],
  );

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <KloelMushroomMark
          size={28}
          title="Carregando IA do plano"
          traceColor={colors.accent.webb}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Intro */}
      <div
        className="flex items-start gap-3 rounded-xl p-5"
        style={{
          background: `${colors.accent.webb}10`,
          border: `1px solid ${colors.border.space}`,
        }}
      >
        <Brain
          className="mt-0.5 h-6 w-6 flex-shrink-0"
          style={{ color: colors.accent.webb }}
          aria-hidden="true"
        />
        <div>
          <h3
            className="text-base font-semibold"
            style={{ fontFamily: typography.fontFamily.display, color: colors.text.starlight }}
          >
            {kloelT(`Configure a inteligência do Kloel para este plano`)}
          </h3>
          <p className="mt-1 text-sm" style={{ color: colors.text.moonlight }}>
            {kloelT(
              `Quanto mais detalhado, melhores as vendas. Todas as configurações alimentam a IA automaticamente.`,
            )}
          </p>
        </div>
      </div>

      {/* S1: Customer Profile */}
      {sectionTitle('1. Perfil do cliente ideal')}
      <CustomerProfileSection
        uid={uid}
        fid={fid}
        genders={genders}
        ages={ages}
        moments={moments}
        knowledge={knowledge}
        buyingPower={buyingPower}
        problem={problem}
        toggleList={toggleList}
        setGenders={setGenders}
        setAges={setAges}
        setMoments={setMoments}
        setKnowledge={setKnowledge}
        setBuyingPower={setBuyingPower}
        setProblem={setProblem}
      />

      {/* S2: Positioning */}
      {sectionTitle('2. Posicionamento deste plano')}
      <PositioningSection
        uid={uid}
        fid={fid}
        tier={tier}
        whenOffer={whenOffer}
        differentiators={differentiators}
        scarcity={scarcity}
        toggleList={toggleList}
        setTier={setTier}
        setWhenOffer={setWhenOffer}
        setDifferentiators={setDifferentiators}
        setScarcity={setScarcity}
      />

      {/* S3: Objections */}
      {sectionTitle('3. Objeções e respostas')}
      <ObjectionsSection
        objectionStates={objectionStates}
        setObjectionStates={setObjectionStates}
      />

      {/* S4: Sales Arguments */}
      {sectionTitle('4. Argumentos de venda')}
      <SalesArgsSection
        socialProof={socialProof}
        socialProofValues={socialProofValues}
        guarantee={guarantee}
        guaranteeValues={guaranteeValues}
        benefits={benefits}
        benefitsValues={benefitsValues}
        urgencyArgs={urgencyArgs}
        urgencyValues={urgencyValues}
        toggleList={toggleList}
        setSocialProof={setSocialProof}
        setSocialProofValues={setSocialProofValues}
        setGuarantee={setGuarantee}
        setGuaranteeValues={setGuaranteeValues}
        setBenefits={setBenefits}
        setBenefitsValues={setBenefitsValues}
        setUrgencyArgs={setUrgencyArgs}
        setUrgencyValues={setUrgencyValues}
      />

      {/* S5: Upsell/Downsell */}
      {sectionTitle('5. Estratégia upsell/downsell')}
      <UpsellSection
        uid={uid}
        fid={fid}
        upsellEnabled={upsellEnabled}
        upsellTargetPlan={upsellTargetPlan}
        upsellWhen={upsellWhen}
        upsellArgument={upsellArgument}
        downsellEnabled={downsellEnabled}
        downsellTargetPlan={downsellTargetPlan}
        downsellWhen={downsellWhen}
        downsellArgument={downsellArgument}
        siblingPlans={siblingPlans}
        toggleList={toggleList}
        setUpsellEnabled={setUpsellEnabled}
        setUpsellTargetPlan={setUpsellTargetPlan}
        setUpsellWhen={setUpsellWhen}
        setUpsellArgument={setUpsellArgument}
        setDownsellEnabled={setDownsellEnabled}
        setDownsellTargetPlan={setDownsellTargetPlan}
        setDownsellWhen={setDownsellWhen}
        setDownsellArgument={setDownsellArgument}
      />

      {/* S6: AI Behavior */}
      {sectionTitle('6. Comportamento da IA')}
      <BehaviorSection
        uid={uid}
        fid={fid}
        tone={tone}
        persistence={persistence}
        messageLimit={messageLimit}
        followUpHours={followUpHours}
        followUpMax={followUpMax}
        setTone={setTone}
        setPersistence={setPersistence}
        setMessageLimit={setMessageLimit}
        setFollowUpHours={setFollowUpHours}
        setFollowUpMax={setFollowUpMax}
      />

      {/* S7: Technical Info */}
      {sectionTitle('7. Informações técnicas')}
      <TechInfoSection
        uid={uid}
        fid={fid}
        hasTechInfo={hasTechInfo}
        usageMode={usageMode}
        duration={duration}
        contraindications={contraindications}
        expectedResults={expectedResults}
        toggleList={toggleList}
        setHasTechInfo={setHasTechInfo}
        setUsageMode={setUsageMode}
        setDuration={setDuration}
        setContraindications={setContraindications}
        setExpectedResults={setExpectedResults}
      />

      {/* AI Summary Box */}
      <AISummaryBox summary={summary} items={summaryItems} />

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white transition-all disabled:opacity-50"
          style={{
            background: showSaved ? colors.state.success : colors.accent.webb,
            boxShadow: 'none',
          }}
        >
          {saving ? (
            <KloelMushroomMark size={18} title="Salvando IA do plano" traceColor={colors.text.silver} />
          ) : showSaved ? (
            <CheckCircle className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Save className="h-4 w-4" aria-hidden="true" />
          )}
          {saving ? 'Salvando...' : showSaved ? 'Salvo!' : 'Salvar configuração'}
        </button>
      </div>
    </div>
  );
}
