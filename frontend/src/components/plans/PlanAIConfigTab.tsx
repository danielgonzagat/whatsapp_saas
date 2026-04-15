'use client';
import { apiFetch } from '@/lib/api';
import { colors, typography } from '@/lib/design-tokens';
import {
  AlertTriangle,
  BookOpen,
  Brain,
  CheckCircle,
  Circle,
  Heart,
  Loader2,
  MessageSquare,
  MinusCircle,
  Save,
  Sparkles,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mutate } from 'swr';

const B_X_B_RE = /\bX\b/;

// ============================================
// DATA
// ============================================

const GENDERS = ['Homens', 'Mulheres', 'Todos'];
const AGE_RANGES = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
const LIFE_MOMENTS = [
  'Começando a pesquisar',
  'Já tentou outros produtos',
  'Urgência/necessidade imediata',
  'Comprando como presente',
  'Compra recorrente',
  'Comparando opções',
  'Foi indicado por alguém',
  'Viu um anúncio',
];
const KNOWLEDGE_LEVELS = [
  { v: 'LAYPERSON', l: 'Leigo' },
  { v: 'BASIC', l: 'Básico' },
  { v: 'INFORMED', l: 'Informado' },
  { v: 'SPECIALIST', l: 'Especialista' },
  { v: 'MIXED', l: 'Misto' },
];
const BUYING_POWER = [
  { v: 'ECONOMIC', l: 'Econômico' },
  { v: 'COST_BENEFIT', l: 'Custo-benefício' },
  { v: 'PREMIUM', l: 'Premium' },
  { v: 'LUXURY', l: 'Luxo' },
];
const PROBLEMS = [
  'Saúde — Dor/inflamação',
  'Saúde — Imunidade baixa',
  'Saúde — Anemia/ferro',
  'Beleza — Pele/rugas',
  'Beleza — Cabelo/queda',
  'Emagrecimento',
  'Energia/disposição',
  'Sono/ansiedade',
  'Finanças — Dívidas',
  'Finanças — Investir',
  'Relacionamento',
  'Educação — Aprender skill',
  'Produtividade',
  'Marketing — Vender mais',
  'Outro',
];
const TIERS = [
  { v: 'ENTRY', l: 'Entrada/Isca' },
  { v: 'MAIN', l: 'Principal' },
  { v: 'PREMIUM', l: 'Premium/VIP' },
  { v: 'ECONOMIC', l: 'Econômico' },
  { v: 'WHOLESALE', l: 'Atacado' },
  { v: 'SUBSCRIPTION', l: 'Assinatura' },
  { v: 'UNIQUE', l: 'Único' },
];
const WHEN_TO_OFFER = [
  'Primeira opção apresentada',
  'Cliente quer o mais barato',
  'Cliente quer o mais completo',
  'Cliente pede desconto',
  'Como upsell após compra',
  'Quando há urgência',
  'Cliente indeciso',
  'Compra em volume',
];
const DIFFERENTIATORS = [
  'Mais unidades',
  'Preço menor por unidade',
  'Brinde exclusivo',
  'Frete grátis',
  'Garantia estendida',
  'Acesso exclusivo',
  'Suporte VIP',
  'Desconto progressivo',
  'Bônus digital',
  'Embalagem premium',
  'Resultados mais rápidos',
  'Fornecimento por mais tempo',
  'Nada de especial',
];
const SCARCITY = [
  { v: 'NONE', l: 'Sem escassez' },
  { v: 'LIMITED_STOCK', l: 'Estoque limitado' },
  { v: 'LIMITED_OFFER', l: 'Oferta por tempo limitado' },
  { v: 'PRICE_INCREASE', l: 'Preço vai subir' },
  { v: 'LAST_UNITS', l: 'Últimas unidades' },
  { v: 'WEEKLY_BONUS', l: 'Bônus só esta semana' },
  { v: 'SPECIAL_BATCH', l: 'Lote especial' },
];

const OBJECTIONS = [
  {
    id: 'expensive',
    label: 'Está caro',
    responses: [
      'Valor e resultado',
      'Comparação custo-benefício',
      'Parcelamento',
      'Garantia de satisfação',
      'Economia a longo prazo',
      'Prova social de quem comprou',
      'Desconto especial',
    ],
  },
  {
    id: 'think',
    label: 'Preciso pensar',
    responses: [
      'Validar a dúvida',
      'Escassez sutil',
      'Resumo dos benefícios',
      'Oferecer garantia',
      'Compartilhar depoimento',
      'Perguntar o que falta decidir',
    ],
  },
  {
    id: 'works',
    label: 'Não sei se funciona',
    responses: [
      'Prova social',
      'Dados científicos',
      'Garantia de resultado',
      'Depoimento em vídeo',
      'Período de teste',
      'Explicar mecanismo de ação',
    ],
  },
  {
    id: 'tried',
    label: 'Já tentei outros',
    responses: [
      'Diferencial claro',
      'Garantia ou teste',
      'Explicar por que é diferente',
      'Depoimento de quem também tentou outros',
    ],
  },
  {
    id: 'cheaper',
    label: 'Achei mais barato',
    responses: [
      'Qualidade vs preço',
      'Composição superior',
      'Garantia inclusa',
      'Atendimento diferenciado',
      'Frete e entrega',
    ],
  },
  {
    id: 'trust',
    label: 'Não confio em compra online',
    responses: [
      'Certificados de segurança',
      'Política de devolução',
      'Empresa estabelecida',
      'Avaliações reais',
      'Pagamento na entrega',
      'Nota fiscal',
    ],
  },
  {
    id: 'deadline',
    label: 'Prazo é muito longo',
    responses: [
      'Explicar logística',
      'Oferecer SEDEX',
      'Rastreamento em tempo real',
      'Compensar com bônus',
      'Prazo real vs estimado',
    ],
  },
  {
    id: 'human',
    label: 'Quero falar com alguém',
    responses: [
      'Transferir para humano',
      'Oferecer WhatsApp',
      'Ligar para o cliente',
      'Agendar callback',
      'Esclarecer a dúvida primeiro',
    ],
  },
  {
    id: 'notforme',
    label: 'Não é para mim',
    responses: [
      'Confirmar perfil ideal',
      'Mostrar caso similar',
      'Oferecer alternativa',
      'Respeitar e encerrar',
      'Salvar para futuro',
    ],
  },
  {
    id: 'later',
    label: 'Compro depois',
    responses: [
      'Escassez temporal',
      'Bônus expirando',
      'Lembrete agendado',
      'Desconto relâmpago',
      'Salvar carrinho',
    ],
  },
];

const SOCIAL_PROOF = [
  'Mais de X clientes',
  'Avaliação X estrelas',
  'Mais vendido',
  'Recomendado por especialistas',
  'Aprovado ANVISA',
  'Mais de X avaliações',
];
const GUARANTEE = [
  'Garantia X dias',
  'Devolução grátis',
  'Pagamento seguro SSL',
  'Empresa com X anos',
  'Nota X Reclame Aqui',
  'Milhares satisfeitos',
];
const BENEFITS = [
  'Economia X%',
  'Frete grátis',
  'Bônus exclusivo',
  'Suporte VIP',
  'Acesso grupo exclusivo',
  'Fornecimento X meses',
  'Resultados em X',
  'Desconto exclusivo',
];
const URGENCY = [
  'Oferta válida até...',
  'Últimas X unidades',
  'Preço vai subir',
  'Bônus só próximos X',
  'Desconto só via link',
];

const TONES: { v: string; l: string; icon: typeof MessageSquare; desc: string }[] = [
  {
    v: 'CONSULTIVE',
    l: 'Consultivo',
    icon: MessageSquare,
    desc: 'Faz perguntas, entende a necessidade e recomenda.',
  },
  { v: 'DIRECT', l: 'Direto', icon: Zap, desc: 'Vai direto ao ponto, objetivo e rápido.' },
  {
    v: 'EMPATHETIC',
    l: 'Empático',
    icon: Heart,
    desc: 'Acolhe, valida sentimentos e cria conexão.',
  },
  {
    v: 'EDUCATIVE',
    l: 'Educativo',
    icon: BookOpen,
    desc: 'Explica com detalhes, ensina antes de vender.',
  },
  {
    v: 'URGENT',
    l: 'Urgente',
    icon: AlertTriangle,
    desc: 'Cria senso de urgência, foco em ação imediata.',
  },
  {
    v: 'AUTO',
    l: 'Automático',
    icon: Sparkles,
    desc: 'A IA escolhe o melhor tom conforme o contexto.',
  },
];
const USAGE_MODES = [
  'Cápsulas (X por dia)',
  'Aplicar X vezes ao dia',
  'Gotas sublinguais',
  'Conforme orientação médica',
  'Conteúdo digital (acesso)',
  'Instruções na embalagem',
];
const DURATIONS = [
  '15 dias',
  '30 dias',
  '60 dias',
  '90 dias',
  '180 dias',
  '365 dias',
  'Uso único',
  'Acesso vitalício',
];
const CONTRAINDICATIONS = [
  'Gestantes',
  'Lactantes',
  'Menores de 18 anos',
  'Hipertensos',
  'Diabéticos',
  'Alérgicos a componentes',
  'Uso de anticoagulantes',
  'Doença renal',
  'Doença hepática',
  'Cardiopatas',
];
const RESULTS = [
  '1-2 semanas',
  '2-4 semanas',
  '1-2 meses',
  '2-3 meses',
  '3-6 meses',
  '6-12 meses',
  'Imediato',
  'Varia por pessoa',
  'Uso contínuo recomendado',
];

const UPSELL_WHEN = [
  'Cliente pergunta sobre o plano principal',
  'Cliente aceita o preço',
  'Cliente quer mais resultados',
  'Cliente compra pela segunda vez',
  'Cliente pergunta por garantia estendida',
  'Cliente demonstra poder aquisitivo',
];
const UPSELL_ARGUMENTS = [
  'Mais resultados por pouco a mais',
  'Melhor custo-benefício a longo prazo',
  'Brindes e bônus exclusivos',
  'Garantia estendida inclusa',
  'Suporte prioritário',
];
const DOWNSELL_WHEN = [
  'Cliente diz que está caro',
  'Cliente quer pensar',
  'Cliente compara com concorrente',
  'Cliente quer apenas experimentar',
  'Cliente desiste do carrinho',
];
const DOWNSELL_ARGUMENTS = [
  'Versão mais acessível',
  'Teste sem compromisso',
  'Menos unidades, mesmo resultado',
  'Garantia mantida',
];

// ============================================
// SHARED UI
// ============================================

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-3 py-1">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
        style={{ backgroundColor: checked ? colors.accent.webb : colors.background.corona }}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`}
        />
      </button>
      <span className="text-sm" style={{ color: colors.text.starlight }}>
        {label}
      </span>
    </label>
  );
}

// ============================================
// COMPONENT
// ============================================

export function PlanAIConfigTab({ planId, productId }: { planId: string; productId: string }) {
  // Loading/saving state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  // Section 1
  const [genders, setGenders] = useState<string[]>(['Todos']);
  const [ages, setAges] = useState<string[]>(['25-34', '35-44']);
  const [moments, setMoments] = useState<string[]>([]);
  const [knowledge, setKnowledge] = useState('INFORMED');
  const [buyingPower, setBuyingPower] = useState('COST_BENEFIT');
  const [problem, setProblem] = useState('');
  // Section 2
  const [tier, setTier] = useState('MAIN');
  const [whenOffer, setWhenOffer] = useState<string[]>([]);
  const [differentiators, setDifferentiators] = useState<string[]>([]);
  const [scarcity, setScarcity] = useState('NONE');
  // Section 3
  const [objectionStates, setObjectionStates] = useState<
    Record<string, { enabled: boolean; response: string }>
  >(Object.fromEntries(OBJECTIONS.map((o) => [o.id, { enabled: true, response: o.responses[0] }])));
  // Section 4
  const [socialProof, setSocialProof] = useState<string[]>([]);
  const [socialProofValues, setSocialProofValues] = useState<Record<string, string>>({});
  const [guarantee, setGuarantee] = useState<string[]>([]);
  const [guaranteeValues, setGuaranteeValues] = useState<Record<string, string>>({});
  const [benefits, setBenefits] = useState<string[]>([]);
  const [benefitsValues, setBenefitsValues] = useState<Record<string, string>>({});
  const [urgencyArgs, setUrgencyArgs] = useState<string[]>([]);
  const [urgencyValues, setUrgencyValues] = useState<Record<string, string>>({});
  // Section 5
  const [upsellEnabled, setUpsellEnabled] = useState(false);
  const [upsellTargetPlan, setUpsellTargetPlan] = useState('');
  const [upsellWhen, setUpsellWhen] = useState<string[]>([]);
  const [upsellArgument, setUpsellArgument] = useState('');
  const [downsellEnabled, setDownsellEnabled] = useState(false);
  const [downsellTargetPlan, setDownsellTargetPlan] = useState('');
  const [downsellWhen, setDownsellWhen] = useState<string[]>([]);
  const [downsellArgument, setDownsellArgument] = useState('');
  const [siblingPlans, setSiblingPlans] = useState<{ id: string; name: string }[]>([]);
  // Section 6
  const [tone, setTone] = useState('CONSULTIVE');
  const [persistence, setPersistence] = useState(3);
  const [messageLimit, setMessageLimit] = useState(10);
  const [followUpHours, setFollowUpHours] = useState('24');
  const [followUpMax, setFollowUpMax] = useState('3');
  // Section 7
  const [hasTechInfo, setHasTechInfo] = useState(false);
  const [usageMode, setUsageMode] = useState('');
  const [duration, setDuration] = useState('');
  const [contraindications, setContraindications] = useState<string[]>([]);
  const [expectedResults, setExpectedResults] = useState('');

  const toggleList = (list: string[], item: string, setter: (v: string[]) => void) => {
    setter(list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  };

  // Data persistence
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await apiFetch<any>(`/products/${productId}/ai-config`);
        const data = res.data;
        if (data) {
          if (data.genders) setGenders(data.genders);
          if (data.ages) setAges(data.ages);
          if (data.moments) setMoments(data.moments);
          if (data.knowledge) setKnowledge(data.knowledge);
          if (data.buyingPower) setBuyingPower(data.buyingPower);
          if (data.problem) setProblem(data.problem);
          if (data.tier) setTier(data.tier);
          if (data.whenOffer) setWhenOffer(data.whenOffer);
          if (data.differentiators) setDifferentiators(data.differentiators);
          if (data.scarcity) setScarcity(data.scarcity);
          if (data.objectionStates) setObjectionStates(data.objectionStates);
          if (data.socialProof) setSocialProof(data.socialProof);
          if (data.socialProofValues) setSocialProofValues(data.socialProofValues);
          if (data.guarantee) setGuarantee(data.guarantee);
          if (data.guaranteeValues) setGuaranteeValues(data.guaranteeValues);
          if (data.benefits) setBenefits(data.benefits);
          if (data.benefitsValues) setBenefitsValues(data.benefitsValues);
          if (data.urgencyArgs) setUrgencyArgs(data.urgencyArgs);
          if (data.urgencyValues) setUrgencyValues(data.urgencyValues);
          if (data.upsellEnabled !== undefined) setUpsellEnabled(data.upsellEnabled);
          if (data.upsellTargetPlan) setUpsellTargetPlan(data.upsellTargetPlan);
          if (data.upsellWhen) setUpsellWhen(data.upsellWhen);
          if (data.upsellArgument) setUpsellArgument(data.upsellArgument);
          if (data.downsellEnabled !== undefined) setDownsellEnabled(data.downsellEnabled);
          if (data.downsellTargetPlan) setDownsellTargetPlan(data.downsellTargetPlan);
          if (data.downsellWhen) setDownsellWhen(data.downsellWhen);
          if (data.downsellArgument) setDownsellArgument(data.downsellArgument);
          if (data.tone) setTone(data.tone);
          if (data.persistence !== undefined) setPersistence(data.persistence);
          if (data.messageLimit !== undefined) setMessageLimit(data.messageLimit);
          if (data.followUpHours) setFollowUpHours(data.followUpHours);
          if (data.followUpMax) setFollowUpMax(data.followUpMax);
          if (data.hasTechInfo !== undefined) setHasTechInfo(data.hasTechInfo);
          if (data.usageMode) setUsageMode(data.usageMode);
          if (data.duration) setDuration(data.duration);
          if (data.contraindications) setContraindications(data.contraindications);
          if (data.expectedResults) setExpectedResults(data.expectedResults);
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
        const data = await apiFetch<any>(`/products/${productId}/plans`);
        if (Array.isArray(data)) {
          setSiblingPlans(
            data
              .filter((p: any) => p.id !== planId)
              .map((p: any) => ({ id: p.id, name: p.name || p.title || `Plano ${p.id}` })),
          );
        }
      } catch {}
    };
    loadPlans();
  }, [productId, planId]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaved(false);
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
      setSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      // PULSE:OK — visual saved badge reset after a successful onSave() + mutate() cycle.
      savedTimer.current = setTimeout(() => setSaved(false), 3000);
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

  // Cosmos design helpers
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
  const _inputClass = selectClass;

  // Completeness indicators for summary
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

  const completenessColor = (complete: boolean, partial: boolean) =>
    complete ? colors.state.success : partial ? colors.brand.amber : colors.text.void;
  const _completenessLabel = (complete: boolean, partial: boolean) =>
    complete ? 'Completo' : partial ? 'Parcial' : 'Não configurado';

  const activeObjections = Object.values(objectionStates).filter((o) => o.enabled).length;
  const totalArgs = socialProof.length + guarantee.length + benefits.length + urgencyArgs.length;
  const summary = useMemo(
    () =>
      `Tom: ${TONES.find((t) => t.v === tone)?.l}. Insistência: ${persistence}/5. Limite: ${messageLimit || '∞'} msgs. ` +
      `Objeções ativas: ${activeObjections}/10. Argumentos: ${totalArgs}. ` +
      `Público: ${genders.join('/')} ${ages.join(', ')}. ${tier ? `Plano ${TIERS.find((t) => t.v === tier)?.l}.` : ''}`,
    [tone, persistence, messageLimit, activeObjections, totalArgs, genders, ages, tier],
  );

  // Check if argument has X placeholder for numeric input
  const hasNumericPlaceholder = (arg: string) => B_X_B_RE.test(arg);

  if (loading)
    return (
      <div className="flex justify-center py-12">
        <Loader2
          className="h-6 w-6 animate-spin"
          style={{ color: colors.accent.webb }}
          aria-hidden="true"
        />
      </div>
    );

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
            Configure a inteligência do Kloel para este plano
          </h3>
          <p className="mt-1 text-sm" style={{ color: colors.text.moonlight }}>
            Quanto mais detalhado, melhores as vendas. Todas as configurações alimentam a IA
            automaticamente.
          </p>
        </div>
      </div>

      {/* S1: Customer Profile */}
      {sectionTitle('1. Perfil do cliente ideal')}
      <div className="rounded-xl p-5" style={cardStyle}>
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label className="mb-2 block" style={labelStyle}>
              Gênero
            </label>
            <div className="flex flex-wrap gap-2">
              {GENDERS.map((g) => (
                <label
                  key={g}
                  className="flex items-center gap-1.5 text-sm cursor-pointer"
                  style={{ color: colors.text.starlight }}
                >
                  <input
                    type="checkbox"
                    checked={genders.includes(g)}
                    onChange={() => toggleList(genders, g, setGenders)}
                    style={{ accentColor: colors.accent.webb }}
                  />
                  {g}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-2 block" style={labelStyle}>
              Faixa etária
            </label>
            <div className="flex flex-wrap gap-2">
              {AGE_RANGES.map((a) => (
                <label
                  key={a}
                  className="flex items-center gap-1.5 text-sm cursor-pointer"
                  style={{ color: colors.text.starlight }}
                >
                  <input
                    type="checkbox"
                    checked={ages.includes(a)}
                    onChange={() => toggleList(ages, a, setAges)}
                    style={{ accentColor: colors.accent.webb }}
                  />
                  {a}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-2 block" style={labelStyle}>
              Momento de vida
            </label>
            <div className="space-y-1">
              {LIFE_MOMENTS.map((m) => (
                <label
                  key={m}
                  className="flex items-center gap-1.5 text-sm cursor-pointer"
                  style={{ color: colors.text.starlight }}
                >
                  <input
                    type="checkbox"
                    checked={moments.includes(m)}
                    onChange={() => toggleList(moments, m, setMoments)}
                    style={{ accentColor: colors.accent.webb }}
                  />
                  {m}
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="mb-2 block" style={labelStyle}>
                Nível de conhecimento
              </label>
              {KNOWLEDGE_LEVELS.map((k) => (
                <label
                  key={k.v}
                  className="flex items-center gap-1.5 text-sm cursor-pointer"
                  style={{ color: colors.text.starlight }}
                >
                  <input
                    type="radio"
                    name="knowledge"
                    checked={knowledge === k.v}
                    onChange={() => setKnowledge(k.v)}
                    style={{ accentColor: colors.accent.webb }}
                  />
                  {k.l}
                </label>
              ))}
            </div>
            <div>
              <label className="mb-2 block" style={labelStyle}>
                Poder aquisitivo
              </label>
              {BUYING_POWER.map((b) => (
                <label
                  key={b.v}
                  className="flex items-center gap-1.5 text-sm cursor-pointer"
                  style={{ color: colors.text.starlight }}
                >
                  <input
                    type="radio"
                    name="buying"
                    checked={buyingPower === b.v}
                    onChange={() => setBuyingPower(b.v)}
                    style={{ accentColor: colors.accent.webb }}
                  />
                  {b.l}
                </label>
              ))}
            </div>
            <div>
              <label className="mb-2 block" style={labelStyle}>
                Problema principal
              </label>
              <select
                value={problem}
                onChange={(e) => setProblem(e.target.value)}
                className={selectClass}
                style={inputStyle}
              >
                <option value="">Selecione</option>
                {PROBLEMS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* S2: Positioning */}
      {sectionTitle('2. Posicionamento deste plano')}
      <div className="rounded-xl p-5" style={cardStyle}>
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label className="mb-2 block" style={labelStyle}>
              Este plano é o quê?
            </label>
            {TIERS.map((t) => (
              <label
                key={t.v}
                className="flex items-center gap-1.5 text-sm cursor-pointer"
                style={{ color: colors.text.starlight }}
              >
                <input
                  type="radio"
                  name="tier"
                  checked={tier === t.v}
                  onChange={() => setTier(t.v)}
                  style={{ accentColor: colors.accent.webb }}
                />
                {t.l}
              </label>
            ))}
          </div>
          <div>
            <label className="mb-2 block" style={labelStyle}>
              Quando a IA deve oferecer?
            </label>
            <div className="space-y-1">
              {WHEN_TO_OFFER.map((w) => (
                <label
                  key={w}
                  className="flex items-center gap-1.5 text-sm cursor-pointer"
                  style={{ color: colors.text.starlight }}
                >
                  <input
                    type="checkbox"
                    checked={whenOffer.includes(w)}
                    onChange={() => toggleList(whenOffer, w, setWhenOffer)}
                    style={{ accentColor: colors.accent.webb }}
                  />
                  {w}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-2 block" style={labelStyle}>
              O que diferencia?
            </label>
            <div className="space-y-1">
              {DIFFERENTIATORS.map((d) => (
                <label
                  key={d}
                  className="flex items-center gap-1.5 text-sm cursor-pointer"
                  style={{ color: colors.text.starlight }}
                >
                  <input
                    type="checkbox"
                    checked={differentiators.includes(d)}
                    onChange={() => toggleList(differentiators, d, setDifferentiators)}
                    style={{ accentColor: colors.accent.webb }}
                  />
                  {d}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-2 block" style={labelStyle}>
              Escassez/Urgência
            </label>
            <select
              value={scarcity}
              onChange={(e) => setScarcity(e.target.value)}
              className={selectClass}
              style={inputStyle}
            >
              {SCARCITY.map((s) => (
                <option key={s.v} value={s.v}>
                  {s.l}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* S3: Objections — 10 card layout, 2-col grid */}
      {sectionTitle('3. Objeções e respostas')}
      <div className="grid gap-3 md:grid-cols-2">
        {OBJECTIONS.map((obj) => {
          const st = objectionStates[obj.id];
          const isEnabled = st?.enabled;
          return (
            <div
              key={obj.id}
              className="flex items-center justify-between rounded-xl px-4 py-3 transition-all"
              style={{
                background: isEnabled ? colors.background.space : colors.background.void,
                border: `1px solid ${isEnabled ? colors.border.space : colors.border.void}`,
                opacity: isEnabled ? 1 : 0.5,
              }}
            >
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setObjectionStates({
                      ...objectionStates,
                      [obj.id]: { ...st, enabled: !st?.enabled },
                    })
                  }
                  className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0"
                  style={{
                    backgroundColor: isEnabled ? colors.accent.webb : colors.background.corona,
                  }}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${isEnabled ? 'translate-x-[18px]' : 'translate-x-[3px]'}`}
                  />
                </button>
                <span
                  className="text-sm font-semibold"
                  style={{ color: isEnabled ? colors.text.starlight : colors.text.dust }}
                >
                  {obj.label}
                </span>
              </div>
              <select
                value={st?.response}
                onChange={(e) =>
                  setObjectionStates({
                    ...objectionStates,
                    [obj.id]: { ...st, response: e.target.value },
                  })
                }
                disabled={!isEnabled}
                className="max-w-[180px] rounded-lg px-2 py-1 text-xs focus:outline-none disabled:cursor-not-allowed"
                style={{ ...inputStyle, fontSize: '12px' }}
              >
                {obj.responses.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      {/* S4: Sales Arguments with numeric inputs */}
      {sectionTitle('4. Argumentos de venda')}
      <div className="rounded-xl p-5" style={cardStyle}>
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold" style={{ color: colors.accent.webb }}>
              Prova Social
            </p>
            {SOCIAL_PROOF.map((s) => (
              <div key={s} className="flex items-center gap-1.5 py-0.5">
                <label
                  className="flex items-center gap-1.5 text-sm cursor-pointer"
                  style={{ color: colors.text.starlight }}
                >
                  <input
                    type="checkbox"
                    checked={socialProof.includes(s)}
                    onChange={() => toggleList(socialProof, s, setSocialProof)}
                    style={{ accentColor: colors.accent.webb }}
                  />
                  {s}
                </label>
                {socialProof.includes(s) && hasNumericPlaceholder(s) && (
                  <input
                    aria-label={`Quantidade: ${s}`}
                    type="number"
                    placeholder="X"
                    value={socialProofValues[s] || ''}
                    onChange={(e) =>
                      setSocialProofValues({ ...socialProofValues, [s]: e.target.value })
                    }
                    className="ml-2 w-20 rounded px-2 py-0.5 text-xs focus:outline-none"
                    style={inputStyle}
                  />
                )}
              </div>
            ))}
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold" style={{ color: colors.accent.webb }}>
              Garantia e Segurança
            </p>
            {GUARANTEE.map((g) => (
              <div key={g} className="flex items-center gap-1.5 py-0.5">
                <label
                  className="flex items-center gap-1.5 text-sm cursor-pointer"
                  style={{ color: colors.text.starlight }}
                >
                  <input
                    type="checkbox"
                    checked={guarantee.includes(g)}
                    onChange={() => toggleList(guarantee, g, setGuarantee)}
                    style={{ accentColor: colors.accent.webb }}
                  />
                  {g}
                </label>
                {guarantee.includes(g) && hasNumericPlaceholder(g) && (
                  <input
                    aria-label={`Quantidade: ${g}`}
                    type="number"
                    placeholder="X"
                    value={guaranteeValues[g] || ''}
                    onChange={(e) =>
                      setGuaranteeValues({ ...guaranteeValues, [g]: e.target.value })
                    }
                    className="ml-2 w-20 rounded px-2 py-0.5 text-xs focus:outline-none"
                    style={inputStyle}
                  />
                )}
              </div>
            ))}
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold" style={{ color: colors.accent.webb }}>
              Benefícios do Plano
            </p>
            {BENEFITS.map((b) => (
              <div key={b} className="flex items-center gap-1.5 py-0.5">
                <label
                  className="flex items-center gap-1.5 text-sm cursor-pointer"
                  style={{ color: colors.text.starlight }}
                >
                  <input
                    type="checkbox"
                    checked={benefits.includes(b)}
                    onChange={() => toggleList(benefits, b, setBenefits)}
                    style={{ accentColor: colors.accent.webb }}
                  />
                  {b}
                </label>
                {benefits.includes(b) && hasNumericPlaceholder(b) && (
                  <input
                    aria-label={`Quantidade: ${b}`}
                    type="number"
                    placeholder="X"
                    value={benefitsValues[b] || ''}
                    onChange={(e) => setBenefitsValues({ ...benefitsValues, [b]: e.target.value })}
                    className="ml-2 w-20 rounded px-2 py-0.5 text-xs focus:outline-none"
                    style={inputStyle}
                  />
                )}
              </div>
            ))}
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold" style={{ color: colors.accent.webb }}>
              Urgência
            </p>
            {URGENCY.map((u) => (
              <div key={u} className="flex items-center gap-1.5 py-0.5">
                <label
                  className="flex items-center gap-1.5 text-sm cursor-pointer"
                  style={{ color: colors.text.starlight }}
                >
                  <input
                    type="checkbox"
                    checked={urgencyArgs.includes(u)}
                    onChange={() => toggleList(urgencyArgs, u, setUrgencyArgs)}
                    style={{ accentColor: colors.accent.webb }}
                  />
                  {u}
                </label>
                {urgencyArgs.includes(u) && hasNumericPlaceholder(u) && (
                  <input
                    aria-label={`Quantidade: ${u}`}
                    type="number"
                    placeholder="X"
                    value={urgencyValues[u] || ''}
                    onChange={(e) => setUrgencyValues({ ...urgencyValues, [u]: e.target.value })}
                    className="ml-2 w-20 rounded px-2 py-0.5 text-xs focus:outline-none"
                    style={inputStyle}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* S5: Upsell/Downsell — full cascading fields */}
      {sectionTitle('5. Estratégia upsell/downsell')}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Upsell */}
        <div className="rounded-xl p-5" style={cardStyle}>
          <Toggle checked={upsellEnabled} onChange={setUpsellEnabled} label="Fazer upsell?" />
          {upsellEnabled && (
            <div
              className="mt-4 space-y-4 pl-2"
              style={{ borderLeft: `2px solid ${colors.accent.webb}30` }}
            >
              <div>
                <label className="mb-1.5 block" style={labelStyle}>
                  Plano alvo
                </label>
                <select
                  value={upsellTargetPlan}
                  onChange={(e) => setUpsellTargetPlan(e.target.value)}
                  className={selectClass}
                  style={inputStyle}
                >
                  <option value="">Selecione o plano</option>
                  {siblingPlans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block" style={labelStyle}>
                  Quando oferecer
                </label>
                <div className="space-y-1">
                  {UPSELL_WHEN.map((w) => (
                    <label
                      key={w}
                      className="flex items-center gap-1.5 text-sm cursor-pointer"
                      style={{ color: colors.text.starlight }}
                    >
                      <input
                        type="checkbox"
                        checked={upsellWhen.includes(w)}
                        onChange={() => toggleList(upsellWhen, w, setUpsellWhen)}
                        style={{ accentColor: colors.accent.webb }}
                      />
                      {w}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1.5 block" style={labelStyle}>
                  Argumento principal
                </label>
                {UPSELL_ARGUMENTS.map((a) => (
                  <label
                    key={a}
                    className="flex items-center gap-1.5 text-sm cursor-pointer"
                    style={{ color: colors.text.starlight }}
                  >
                    <input
                      type="radio"
                      name="upsell_arg"
                      checked={upsellArgument === a}
                      onChange={() => setUpsellArgument(a)}
                      style={{ accentColor: colors.accent.webb }}
                    />
                    {a}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Downsell */}
        <div className="rounded-xl p-5" style={cardStyle}>
          <Toggle checked={downsellEnabled} onChange={setDownsellEnabled} label="Fazer downsell?" />
          {downsellEnabled && (
            <div
              className="mt-4 space-y-4 pl-2"
              style={{ borderLeft: `2px solid ${colors.accent.gold}30` }}
            >
              <div>
                <label className="mb-1.5 block" style={labelStyle}>
                  Plano alvo
                </label>
                <select
                  value={downsellTargetPlan}
                  onChange={(e) => setDownsellTargetPlan(e.target.value)}
                  className={selectClass}
                  style={inputStyle}
                >
                  <option value="">Selecione o plano</option>
                  {siblingPlans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block" style={labelStyle}>
                  Quando oferecer
                </label>
                <div className="space-y-1">
                  {DOWNSELL_WHEN.map((w) => (
                    <label
                      key={w}
                      className="flex items-center gap-1.5 text-sm cursor-pointer"
                      style={{ color: colors.text.starlight }}
                    >
                      <input
                        type="checkbox"
                        checked={downsellWhen.includes(w)}
                        onChange={() => toggleList(downsellWhen, w, setDownsellWhen)}
                        style={{ accentColor: colors.accent.webb }}
                      />
                      {w}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1.5 block" style={labelStyle}>
                  Argumento principal
                </label>
                {DOWNSELL_ARGUMENTS.map((a) => (
                  <label
                    key={a}
                    className="flex items-center gap-1.5 text-sm cursor-pointer"
                    style={{ color: colors.text.starlight }}
                  >
                    <input
                      type="radio"
                      name="downsell_arg"
                      checked={downsellArgument === a}
                      onChange={() => setDownsellArgument(a)}
                      style={{ accentColor: colors.accent.webb }}
                    />
                    {a}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* S6: AI Behavior — visual card selection for tone */}
      {sectionTitle('6. Comportamento da IA')}
      <div className="rounded-xl p-5" style={cardStyle}>
        <label className="mb-3 block" style={labelStyle}>
          Tom da conversa
        </label>
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6 mb-6">
          {TONES.map((t) => {
            const Icon = t.icon;
            const isSelected = tone === t.v;
            return (
              <button
                key={t.v}
                type="button"
                onClick={() => setTone(t.v)}
                className="flex flex-col items-center gap-2 rounded-xl p-4 text-center transition-all"
                style={{
                  background: isSelected ? `${colors.accent.webb}15` : colors.background.nebula,
                  border: `2px solid ${isSelected ? colors.accent.webb : colors.border.space}`,
                  boxShadow: 'none',
                }}
              >
                <Icon
                  className="h-6 w-6"
                  style={{ color: isSelected ? colors.accent.webb : colors.text.dust }}
                />
                <span
                  className="text-xs font-semibold"
                  style={{ color: isSelected ? colors.accent.webb : colors.text.starlight }}
                >
                  {t.l}
                </span>
                <span
                  className="text-[10px] leading-tight"
                  style={{ color: colors.text.moonlight }}
                >
                  {t.desc}
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <div>
            <label className="mb-1.5 block" style={labelStyle}>
              Insistência ({persistence}/5)
            </label>
            <div className="relative mt-2">
              <input
                type="range"
                min={1}
                max={5}
                value={persistence}
                onChange={(e) => setPersistence(Number(e.target.value))}
                aria-label={`Insistência: ${persistence} de 5`}
                className="w-full h-2 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, ${colors.accent.webb} 0%, ${colors.accent.webb} ${(persistence - 1) * 25}%, ${colors.background.corona} ${(persistence - 1) * 25}%, ${colors.background.corona} 100%)`,
                  accentColor: colors.accent.webb,
                }}
              />
              <div className="flex justify-between mt-1">
                <span className="text-[10px]" style={{ color: colors.text.dust }}>
                  Passivo
                </span>
                <span className="text-[10px]" style={{ color: colors.text.dust }}>
                  Agressivo
                </span>
              </div>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block" style={labelStyle}>
              Limite de mensagens
            </label>
            <select
              value={messageLimit}
              onChange={(e) => setMessageLimit(Number(e.target.value))}
              className={selectClass}
              style={inputStyle}
            >
              <option value={3}>3</option>
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={15}>15</option>
              <option value={0}>Sem limite</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block" style={labelStyle}>
              Follow-up
            </label>
            <select
              value={followUpHours}
              onChange={(e) => setFollowUpHours(e.target.value)}
              className={selectClass}
              style={inputStyle}
            >
              <option value="24">24h</option>
              <option value="48">48h</option>
              <option value="72">72h</option>
              <option value="168">1 semana</option>
              <option value="0">Nunca</option>
            </select>
            <select
              value={followUpMax}
              onChange={(e) => setFollowUpMax(e.target.value)}
              className={`${selectClass} mt-2`}
              style={inputStyle}
            >
              <option value="1">1 tentativa</option>
              <option value="2">2 tentativas</option>
              <option value="3">3 tentativas</option>
              <option value="5">5 tentativas</option>
            </select>
          </div>
        </div>
      </div>

      {/* S7: Technical Info — 10 contraindication checkboxes */}
      {sectionTitle('7. Informações técnicas')}
      <div className="rounded-xl p-5" style={cardStyle}>
        <Toggle
          checked={hasTechInfo}
          onChange={setHasTechInfo}
          label="Este plano tem informações técnicas?"
        />
        {hasTechInfo && (
          <div className="grid gap-4 md:grid-cols-2 mt-4">
            <div>
              <label className="mb-1 block" style={labelStyle}>
                Modo de uso
              </label>
              <select
                value={usageMode}
                onChange={(e) => setUsageMode(e.target.value)}
                className={selectClass}
                style={inputStyle}
              >
                <option value="">Selecione</option>
                {USAGE_MODES.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block" style={labelStyle}>
                Duração
              </label>
              <select
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className={selectClass}
                style={inputStyle}
              >
                <option value="">Selecione</option>
                {DURATIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block" style={labelStyle}>
                Contraindicações
              </label>
              <div className="space-y-1">
                {CONTRAINDICATIONS.map((c) => (
                  <label
                    key={c}
                    className="flex items-center gap-1.5 text-sm cursor-pointer"
                    style={{ color: colors.text.starlight }}
                  >
                    <input
                      type="checkbox"
                      checked={contraindications.includes(c)}
                      onChange={() => toggleList(contraindications, c, setContraindications)}
                      style={{ accentColor: colors.accent.webb }}
                    />
                    {c}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 block" style={labelStyle}>
                Resultados esperados em
              </label>
              <select
                value={expectedResults}
                onChange={(e) => setExpectedResults(e.target.value)}
                className={selectClass}
                style={inputStyle}
              >
                <option value="">Selecione</option>
                {RESULTS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* AI Summary Box with completeness indicators */}
      <div
        className="rounded-xl p-5"
        style={{
          background: colors.background.space,
          border: `1px solid ${colors.accent.webb}30`,
          boxShadow: 'none',
        }}
      >
        <div className="flex items-start gap-3 mb-4">
          <Sparkles
            className="mt-0.5 h-5 w-5 flex-shrink-0"
            style={{ color: colors.accent.webb }}
            aria-hidden="true"
          />
          <div>
            <h4
              className="text-sm font-semibold"
              style={{ fontFamily: typography.fontFamily.display, color: colors.text.starlight }}
            >
              Resumo do que a IA sabe sobre este plano
            </h4>
            <p className="mt-2 text-sm" style={{ color: colors.text.moonlight }}>
              {summary}
            </p>
          </div>
        </div>

        <div
          className="grid gap-2 md:grid-cols-4 lg:grid-cols-7 mt-4 pt-4"
          style={{ borderTop: `1px solid ${colors.border.space}` }}
        >
          {[
            { label: 'Perfil', complete: s1Complete, partial: s1Partial },
            { label: 'Posição', complete: s2Complete, partial: s2Partial },
            { label: 'Objeções', complete: s3Complete, partial: s3Partial },
            { label: 'Argumentos', complete: s4Complete, partial: s4Partial },
            { label: 'Up/Down', complete: s5Complete, partial: s5Partial },
            { label: 'Comportamento', complete: s6Complete, partial: true },
            { label: 'Técnico', complete: s7Complete, partial: s7Partial },
          ].map((item, idx) => {
            const color = completenessColor(item.complete, item.partial);
            const Icon = item.complete ? CheckCircle : item.partial ? MinusCircle : Circle;
            return (
              <div key={idx} className="flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5 flex-shrink-0" style={{ color }} />
                <span className="text-[10px] font-medium" style={{ color }}>
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white transition-all disabled:opacity-50"
          style={{
            background: saved ? colors.state.success : colors.accent.webb,
            boxShadow: 'none',
          }}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : saved ? (
            <CheckCircle className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Save className="h-4 w-4" aria-hidden="true" />
          )}
          {saving ? 'Salvando...' : saved ? 'Salvo!' : 'Salvar configuração'}
        </button>
      </div>
    </div>
  );
}
