'use client';
import { kloelT } from '@/lib/i18n/t';
import { KloelMushroomMark } from '@/components/kloel/KloelBrand';
import { apiFetch } from '@/lib/api';
import { colors, typography } from '@/lib/design-tokens';
import { Brain, CheckCircle, Save } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { mutate } from 'swr';

import { OBJECTIONS, TIERS, TONES } from './PlanAIConfig.data';
import {
  assignBoolean,
  assignNumber,
  assignRecordString,
  assignString,
  assignStringArray,
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
  const [siblingPlans, setSiblingPlans] = useState<{ id: string; name: string }[]>([]);

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
    setter(list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
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
        const data = await apiFetch<{ id: string; name?: string; title?: string }[]>(
          `/products/${productId}/plans`,
        );
        if (Array.isArray(data.data)) {
          setSiblingPlans(
            data.data
              .filter((p) => p.id !== planId)
              .map((p) => ({ id: p.id, name: p.name || p.title || `Plano ${p.id}` })),
          );
        }
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
        body: {
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
        },
      });
      mutate((key: unknown) => typeof key === 'string' && key.startsWith('/products'));
      setShowSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      // PULSE:OK — visual saved badge reset after a successful onSave() + mutate() cycle.
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

  // Shared styles
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

  const labelStyle: React.CSSProperties = {
    fontFamily: typography.fontFamily.display,
    fontSize: '11px',
    fontWeight: 600,
    color: colors.text.dust,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
  };
  const cardStyle: React.CSSProperties = {
    background: colors.background.space,
    border: `1px solid ${colors.border.space}`,
    borderRadius: '6px',
  };
  const inputStyle: React.CSSProperties = {
    background: colors.background.nebula,
    border: `1px solid ${colors.border.space}`,
    color: colors.text.starlight,
    borderRadius: '6px',
  };
  const selectClass = 'w-full rounded-lg px-3 py-2 text-sm focus:outline-none';

  // Completeness indicators
  const s1Complete = genders.length > 0 && ages.length > 0 && problem !== '';
  const s1Partial = genders.length > 0 || ages.length > 0;
  const s2Complete = tier !== '' && whenOffer.length > 0 && differentiators.length > 0;
  const s2Partial = tier !== '' || whenOffer.length > 0;
  const s3Complete = Object.values(objectionStates).filter((o) => o.enabled).length >= 5;
  const s3Partial = Object.values(objectionStates).filter((o) => o.enabled).length > 0;
  const s4Complete = socialProof.length > 0 && guarantee.length > 0 && benefits.length > 0;
  const s4Partial = socialProof.length > 0 || guarantee.length > 0 || benefits.length > 0;
  const s5Complete =
    (upsellEnabled && upsellTargetPlan !== '') ||
    (downsellEnabled && downsellTargetPlan !== '') ||
    (!upsellEnabled && !downsellEnabled);
  const s5Partial = upsellEnabled || downsellEnabled;
  const s6Complete = tone !== '' && persistence > 0;
  const s7Complete = hasTechInfo && usageMode !== '' && contraindications.length > 0;
  const s7Partial = hasTechInfo;

  const activeObjections = Object.values(objectionStates).filter((o) => o.enabled).length;
  const totalArgs = socialProof.length + guarantee.length + benefits.length + urgencyArgs.length;
  const summary = useMemo(
    () =>
      `Tom: ${TONES.find((t) => t.v === tone)?.l}. Insistência: ${persistence}/5. Limite: ${messageLimit || '∞'} msgs. ` +
      `Objeções ativas: ${activeObjections}/10. Argumentos: ${totalArgs}. ` +
      `Público: ${genders.join('/')} ${ages.join(', ')}. ${tier ? `Plano ${TIERS.find((t) => t.v === tier)?.l}.` : ''}`,
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
        labelStyle={labelStyle}
        inputStyle={inputStyle}
        selectClass={selectClass}
        cardStyle={cardStyle}
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
        labelStyle={labelStyle}
        inputStyle={inputStyle}
        selectClass={selectClass}
        cardStyle={cardStyle}
        toggleList={toggleList}
        setTier={setTier}
        setWhenOffer={setWhenOffer}
        setDifferentiators={setDifferentiators}
        setScarcity={setScarcity}
      />

      {/* S3: Objections */}
      {sectionTitle('3. Objeções e respostas')}
      <ObjectionsSection
        inputStyle={inputStyle}
        objectionStates={objectionStates}
        setObjectionStates={setObjectionStates}
      />

      {/* S4: Sales Arguments */}
      {sectionTitle('4. Argumentos de venda')}
      <SalesArgsSection
        inputStyle={inputStyle}
        cardStyle={cardStyle}
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
        labelStyle={labelStyle}
        inputStyle={inputStyle}
        selectClass={selectClass}
        cardStyle={cardStyle}
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
        labelStyle={labelStyle}
        inputStyle={inputStyle}
        selectClass={selectClass}
        cardStyle={cardStyle}
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
        labelStyle={labelStyle}
        inputStyle={inputStyle}
        selectClass={selectClass}
        cardStyle={cardStyle}
        toggleList={toggleList}
        setHasTechInfo={setHasTechInfo}
        setUsageMode={setUsageMode}
        setDuration={setDuration}
        setContraindications={setContraindications}
        setExpectedResults={setExpectedResults}
      />

      {/* AI Summary Box */}
      <AISummaryBox
        summary={summary}
        items={[
          { label: 'Perfil', complete: s1Complete, partial: s1Partial },
          { label: 'Posição', complete: s2Complete, partial: s2Partial },
          { label: 'Objeções', complete: s3Complete, partial: s3Partial },
          { label: 'Argumentos', complete: s4Complete, partial: s4Partial },
          { label: 'Up/Down', complete: s5Complete, partial: s5Partial },
          { label: 'Comportamento', complete: s6Complete, partial: true },
          { label: 'Técnico', complete: s7Complete, partial: s7Partial },
        ]}
      />

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
            <KloelMushroomMark size={18} title="Salvando IA do plano" traceColor="#ffffff" />
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
