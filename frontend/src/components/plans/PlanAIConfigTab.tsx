"use client"
import { useState, useMemo } from "react"
import { Brain, Sparkles } from "lucide-react"
import { colors } from "@/lib/design-tokens"

// ============================================
// DATA
// ============================================

const GENDERS = ["Homens", "Mulheres", "Todos"]
const AGE_RANGES = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"]
const LIFE_MOMENTS = ["Começando a pesquisar", "Já tentou outros produtos", "Urgência/necessidade imediata", "Comprando como presente", "Compra recorrente", "Comparando opções", "Foi indicado por alguém", "Viu um anúncio"]
const KNOWLEDGE_LEVELS = [{v:"LAYPERSON",l:"Leigo"},{v:"BASIC",l:"Básico"},{v:"INFORMED",l:"Informado"},{v:"SPECIALIST",l:"Especialista"},{v:"MIXED",l:"Misto"}]
const BUYING_POWER = [{v:"ECONOMIC",l:"Econômico"},{v:"COST_BENEFIT",l:"Custo-benefício"},{v:"PREMIUM",l:"Premium"},{v:"LUXURY",l:"Luxo"}]
const PROBLEMS = ["Saúde — Dor/inflamação", "Saúde — Imunidade baixa", "Saúde — Anemia/ferro", "Beleza — Pele/rugas", "Beleza — Cabelo/queda", "Emagrecimento", "Energia/disposição", "Sono/ansiedade", "Finanças — Dívidas", "Finanças — Investir", "Relacionamento", "Educação — Aprender skill", "Produtividade", "Marketing — Vender mais", "Outro"]
const TIERS = [{v:"ENTRY",l:"Entrada/Isca"},{v:"MAIN",l:"Principal"},{v:"PREMIUM",l:"Premium/VIP"},{v:"ECONOMIC",l:"Econômico"},{v:"WHOLESALE",l:"Atacado"},{v:"SUBSCRIPTION",l:"Assinatura"},{v:"UNIQUE",l:"Único"}]
const WHEN_TO_OFFER = ["Primeira opção apresentada", "Cliente quer o mais barato", "Cliente quer o mais completo", "Cliente pede desconto", "Como upsell após compra", "Quando há urgência", "Cliente indeciso", "Compra em volume"]
const DIFFERENTIATORS = ["Mais unidades", "Preço menor por unidade", "Brinde exclusivo", "Frete grátis", "Garantia estendida", "Acesso exclusivo", "Suporte VIP", "Desconto progressivo", "Bônus digital", "Embalagem premium", "Resultados mais rápidos", "Fornecimento por mais tempo", "Nada de especial"]
const SCARCITY = [{v:"NONE",l:"Sem escassez"},{v:"LIMITED_STOCK",l:"Estoque limitado"},{v:"LIMITED_OFFER",l:"Oferta por tempo limitado"},{v:"PRICE_INCREASE",l:"Preço vai subir"},{v:"LAST_UNITS",l:"Últimas unidades"},{v:"WEEKLY_BONUS",l:"Bônus só esta semana"},{v:"SPECIAL_BATCH",l:"Lote especial"}]

const OBJECTIONS = [
  {id:"expensive",label:"Está caro",responses:["Valor e resultado","Comparação custo-benefício","Parcelamento","Garantia de satisfação","Economia a longo prazo","Prova social de quem comprou","Desconto especial"]},
  {id:"think",label:"Preciso pensar",responses:["Validar a dúvida","Escassez sutil","Resumo dos benefícios","Oferecer garantia","Compartilhar depoimento","Perguntar o que falta decidir"]},
  {id:"works",label:"Não sei se funciona",responses:["Prova social","Dados científicos","Garantia de resultado","Depoimento em vídeo","Período de teste","Explicar mecanismo de ação"]},
  {id:"tried",label:"Já tentei outros",responses:["Diferencial claro","Garantia ou teste","Explicar por que é diferente","Depoimento de quem também tentou outros"]},
  {id:"cheaper",label:"Achei mais barato",responses:["Qualidade vs preço","Composição superior","Garantia inclusa","Atendimento diferenciado","Frete e entrega"]},
  {id:"trust",label:"Não confio em compra online",responses:["Certificados de segurança","Política de devolução","Empresa estabelecida","Avaliações reais","Pagamento na entrega","Nota fiscal"]},
  {id:"deadline",label:"Prazo é muito longo",responses:["Explicar logística","Oferecer SEDEX","Rastreamento em tempo real","Compensar com bônus","Prazo real vs estimado"]},
  {id:"human",label:"Quero falar com alguém",responses:["Transferir para humano","Oferecer WhatsApp","Ligar para o cliente","Agendar callback","Esclarecer a dúvida primeiro"]},
  {id:"notforme",label:"Não é para mim",responses:["Confirmar perfil ideal","Mostrar caso similar","Oferecer alternativa","Respeitar e encerrar","Salvar para futuro"]},
  {id:"later",label:"Compro depois",responses:["Escassez temporal","Bônus expirando","Lembrete agendado","Desconto relâmpago","Salvar carrinho"]},
]

const SOCIAL_PROOF = ["Mais de X clientes","Avaliação X estrelas","Mais vendido","Recomendado por especialistas","Aprovado ANVISA","Mais de X avaliações"]
const GUARANTEE = ["Garantia X dias","Devolução grátis","Pagamento seguro SSL","Empresa com X anos","Nota X Reclame Aqui","Milhares satisfeitos"]
const BENEFITS = ["Economia X%","Frete grátis","Bônus exclusivo","Suporte VIP","Acesso grupo exclusivo","Fornecimento X meses","Resultados em X","Desconto exclusivo"]
const URGENCY = ["Oferta válida até...","Últimas X unidades","Preço vai subir","Bônus só próximos X","Desconto só via link"]

const TONES = [{v:"CONSULTIVE",l:"Consultivo"},{v:"DIRECT",l:"Direto"},{v:"EMPATHETIC",l:"Empático"},{v:"EDUCATIVE",l:"Educativo"},{v:"URGENT",l:"Urgente"},{v:"AUTO",l:"Automático"}]
const USAGE_MODES = ["Cápsulas (X por dia)","Aplicar X vezes ao dia","Gotas sublinguais","Conforme orientação médica","Conteúdo digital (acesso)","Instruções na embalagem"]
const DURATIONS = ["15 dias","30 dias","60 dias","90 dias","180 dias","365 dias","Uso único","Acesso vitalício"]
const CONTRAINDICATIONS = ["Gestantes","Lactantes","Menores de 18 anos","Hipertensos","Diabéticos","Alérgicos a componentes","Uso de anticoagulantes","Doença renal","Doença hepática"]
const RESULTS = ["1-2 semanas","2-4 semanas","1-2 meses","2-3 meses","3-6 meses","6-12 meses","Imediato","Varia por pessoa","Uso contínuo recomendado"]

// ============================================
// COMPONENT
// ============================================

export function PlanAIConfigTab({ planId, productId }: { planId: string; productId: string }) {
  // Section 1
  const [genders, setGenders] = useState<string[]>(["Todos"])
  const [ages, setAges] = useState<string[]>(["25-34","35-44"])
  const [moments, setMoments] = useState<string[]>([])
  const [knowledge, setKnowledge] = useState("INFORMED")
  const [buyingPower, setBuyingPower] = useState("COST_BENEFIT")
  const [problem, setProblem] = useState("")
  // Section 2
  const [tier, setTier] = useState("MAIN")
  const [whenOffer, setWhenOffer] = useState<string[]>([])
  const [differentiators, setDifferentiators] = useState<string[]>([])
  const [scarcity, setScarcity] = useState("NONE")
  // Section 3
  const [objectionStates, setObjectionStates] = useState<Record<string, {enabled: boolean; response: string}>>(
    Object.fromEntries(OBJECTIONS.map(o => [o.id, {enabled: true, response: o.responses[0]}]))
  )
  // Section 4
  const [socialProof, setSocialProof] = useState<string[]>([])
  const [guarantee, setGuarantee] = useState<string[]>([])
  const [benefits, setBenefits] = useState<string[]>([])
  const [urgencyArgs, setUrgencyArgs] = useState<string[]>([])
  // Section 5
  const [upsellEnabled, setUpsellEnabled] = useState(false)
  const [downsellEnabled, setDownsellEnabled] = useState(false)
  // Section 6
  const [tone, setTone] = useState("CONSULTIVE")
  const [persistence, setPersistence] = useState(3)
  const [messageLimit, setMessageLimit] = useState(10)
  const [followUpHours, setFollowUpHours] = useState("24")
  const [followUpMax, setFollowUpMax] = useState("3")
  // Section 7
  const [hasTechInfo, setHasTechInfo] = useState(false)
  const [usageMode, setUsageMode] = useState("")
  const [duration, setDuration] = useState("")
  const [contraindications, setContraindications] = useState<string[]>([])
  const [expectedResults, setExpectedResults] = useState("")

  const toggleList = (list: string[], item: string, setter: (v: string[]) => void) => {
    setter(list.includes(item) ? list.filter(x => x !== item) : [...list, item])
  }

  const Toggle = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
    <label className="flex items-center gap-3 py-1"><button type="button" onClick={() => onChange(!checked)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? "bg-teal-600" : "bg-gray-300"}`}><span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} /></button><span className="text-sm text-gray-700">{label}</span></label>
  )
  const sectionTitle = (t: string) => <h3 className="mb-3 mt-2 text-sm font-semibold uppercase tracking-wider text-gray-600">{t}</h3>
  const selectClass = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"

  // Summary
  const activeObjections = Object.values(objectionStates).filter(o => o.enabled).length
  const totalArgs = socialProof.length + guarantee.length + benefits.length + urgencyArgs.length
  const summary = useMemo(() =>
    `Tom: ${TONES.find(t=>t.v===tone)?.l}. Insistência: ${persistence}/5. Limite: ${messageLimit || "∞"} msgs. ` +
    `Objeções ativas: ${activeObjections}/10. Argumentos: ${totalArgs}. ` +
    `Público: ${genders.join("/")} ${ages.join(", ")}. ${tier ? `Plano ${TIERS.find(t=>t.v===tier)?.l}.` : ""}`
  , [tone, persistence, messageLimit, activeObjections, totalArgs, genders, ages, tier])

  return (
    <div className="space-y-8">
      {/* Intro */}
      <div className="flex items-start gap-3 rounded-xl p-5" style={{ background: `linear-gradient(135deg, ${colors.brand.primary}08, ${colors.brand.accent}08)` }}>
        <Brain className="mt-0.5 h-6 w-6 text-teal-600 flex-shrink-0" />
        <div><h3 className="text-base font-semibold text-gray-900">Configure a inteligência do Kloel para este plano</h3><p className="mt-1 text-sm text-gray-600">Quanto mais detalhado, melhores as vendas. Todas as configurações alimentam a IA automaticamente.</p></div>
      </div>

      {/* S1: Customer Profile */}
      {sectionTitle("1. Perfil do cliente ideal")}
      <div className="grid gap-6 md:grid-cols-2">
        <div><label className="mb-2 block text-xs font-medium text-gray-600">Gênero</label><div className="flex flex-wrap gap-2">{GENDERS.map(g => <label key={g} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={genders.includes(g)} onChange={() => toggleList(genders, g, setGenders)} className="accent-teal-600" />{g}</label>)}</div></div>
        <div><label className="mb-2 block text-xs font-medium text-gray-600">Faixa etária</label><div className="flex flex-wrap gap-2">{AGE_RANGES.map(a => <label key={a} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={ages.includes(a)} onChange={() => toggleList(ages, a, setAges)} className="accent-teal-600" />{a}</label>)}</div></div>
        <div><label className="mb-2 block text-xs font-medium text-gray-600">Momento de vida</label><div className="space-y-1">{LIFE_MOMENTS.map(m => <label key={m} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={moments.includes(m)} onChange={() => toggleList(moments, m, setMoments)} className="accent-teal-600" />{m}</label>)}</div></div>
        <div className="space-y-4">
          <div><label className="mb-2 block text-xs font-medium text-gray-600">Nível de conhecimento</label>{KNOWLEDGE_LEVELS.map(k => <label key={k.v} className="flex items-center gap-1.5 text-sm"><input type="radio" name="knowledge" checked={knowledge===k.v} onChange={() => setKnowledge(k.v)} className="accent-teal-600" />{k.l}</label>)}</div>
          <div><label className="mb-2 block text-xs font-medium text-gray-600">Poder aquisitivo</label>{BUYING_POWER.map(b => <label key={b.v} className="flex items-center gap-1.5 text-sm"><input type="radio" name="buying" checked={buyingPower===b.v} onChange={() => setBuyingPower(b.v)} className="accent-teal-600" />{b.l}</label>)}</div>
          <div><label className="mb-2 block text-xs font-medium text-gray-600">Problema principal</label><select value={problem} onChange={e => setProblem(e.target.value)} className={selectClass}><option value="">Selecione</option>{PROBLEMS.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
        </div>
      </div>

      {/* S2: Positioning */}
      {sectionTitle("2. Posicionamento deste plano")}
      <div className="grid gap-6 md:grid-cols-2">
        <div><label className="mb-2 block text-xs font-medium text-gray-600">Este plano é o quê?</label>{TIERS.map(t => <label key={t.v} className="flex items-center gap-1.5 text-sm"><input type="radio" name="tier" checked={tier===t.v} onChange={() => setTier(t.v)} className="accent-teal-600" />{t.l}</label>)}</div>
        <div><label className="mb-2 block text-xs font-medium text-gray-600">Quando a IA deve oferecer?</label><div className="space-y-1">{WHEN_TO_OFFER.map(w => <label key={w} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={whenOffer.includes(w)} onChange={() => toggleList(whenOffer, w, setWhenOffer)} className="accent-teal-600" />{w}</label>)}</div></div>
        <div><label className="mb-2 block text-xs font-medium text-gray-600">O que diferencia?</label><div className="space-y-1">{DIFFERENTIATORS.map(d => <label key={d} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={differentiators.includes(d)} onChange={() => toggleList(differentiators, d, setDifferentiators)} className="accent-teal-600" />{d}</label>)}</div></div>
        <div><label className="mb-2 block text-xs font-medium text-gray-600">Escassez/Urgência</label><select value={scarcity} onChange={e => setScarcity(e.target.value)} className={selectClass}>{SCARCITY.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}</select></div>
      </div>

      {/* S3: Objections */}
      {sectionTitle("3. Objeções e respostas")}
      <div className="grid gap-3 md:grid-cols-2">{OBJECTIONS.map(obj => {
        const st = objectionStates[obj.id]
        return <div key={obj.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3">
          <div className="flex items-center gap-3"><input type="checkbox" checked={st?.enabled} onChange={() => setObjectionStates({...objectionStates, [obj.id]: {...st, enabled: !st?.enabled}})} className="accent-teal-600" /><span className="text-sm font-medium text-gray-800">{obj.label}</span></div>
          <select value={st?.response} onChange={e => setObjectionStates({...objectionStates, [obj.id]: {...st, response: e.target.value}})} className="max-w-[180px] rounded border border-gray-200 px-2 py-1 text-xs">{obj.responses.map(r => <option key={r} value={r}>{r}</option>)}</select>
        </div>
      })}</div>

      {/* S4: Sales Arguments */}
      {sectionTitle("4. Argumentos de venda")}
      <div className="grid gap-6 md:grid-cols-2">
        <div><p className="mb-2 text-xs font-semibold text-teal-700">Prova Social</p>{SOCIAL_PROOF.map(s => <label key={s} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={socialProof.includes(s)} onChange={() => toggleList(socialProof, s, setSocialProof)} className="accent-teal-600" />{s}</label>)}</div>
        <div><p className="mb-2 text-xs font-semibold text-teal-700">Garantia e Segurança</p>{GUARANTEE.map(g => <label key={g} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={guarantee.includes(g)} onChange={() => toggleList(guarantee, g, setGuarantee)} className="accent-teal-600" />{g}</label>)}</div>
        <div><p className="mb-2 text-xs font-semibold text-teal-700">Benefícios do Plano</p>{BENEFITS.map(b => <label key={b} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={benefits.includes(b)} onChange={() => toggleList(benefits, b, setBenefits)} className="accent-teal-600" />{b}</label>)}</div>
        <div><p className="mb-2 text-xs font-semibold text-teal-700">Urgência</p>{URGENCY.map(u => <label key={u} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={urgencyArgs.includes(u)} onChange={() => toggleList(urgencyArgs, u, setUrgencyArgs)} className="accent-teal-600" />{u}</label>)}</div>
      </div>

      {/* S5: Upsell/Downsell */}
      {sectionTitle("5. Estratégia upsell/downsell")}
      <div className="grid gap-6 md:grid-cols-2">
        <div><Toggle checked={upsellEnabled} onChange={setUpsellEnabled} label="Fazer upsell?" />{upsellEnabled && <p className="ml-14 text-xs text-gray-500">Configure o plano alvo e timing após salvar.</p>}</div>
        <div><Toggle checked={downsellEnabled} onChange={setDownsellEnabled} label="Fazer downsell?" />{downsellEnabled && <p className="ml-14 text-xs text-gray-500">Configure o plano alvo e triggers após salvar.</p>}</div>
      </div>

      {/* S6: AI Behavior */}
      {sectionTitle("6. Comportamento da IA")}
      <div className="grid gap-4 md:grid-cols-4">
        <div><label className="mb-1.5 block text-xs font-medium text-gray-600">Tom</label>{TONES.map(t => <label key={t.v} className="flex items-center gap-1.5 text-sm"><input type="radio" name="tone" checked={tone===t.v} onChange={() => setTone(t.v)} className="accent-teal-600" />{t.l}</label>)}</div>
        <div><label className="mb-1.5 block text-xs font-medium text-gray-600">Insistência ({persistence}/5)</label><input type="range" min={1} max={5} value={persistence} onChange={e => setPersistence(Number(e.target.value))} className="w-full accent-teal-600" /><div className="flex justify-between text-[10px] text-gray-400"><span>Passivo</span><span>Agressivo</span></div></div>
        <div><label className="mb-1.5 block text-xs font-medium text-gray-600">Limite msgs</label><select value={messageLimit} onChange={e => setMessageLimit(Number(e.target.value))} className={selectClass}><option value={3}>3</option><option value={5}>5</option><option value={10}>10</option><option value={15}>15</option><option value={0}>Sem limite</option></select></div>
        <div><label className="mb-1.5 block text-xs font-medium text-gray-600">Follow-up</label><select value={followUpHours} onChange={e => setFollowUpHours(e.target.value)} className={selectClass}><option value="24">24h</option><option value="48">48h</option><option value="72">72h</option><option value="168">1 semana</option><option value="0">Nunca</option></select><select value={followUpMax} onChange={e => setFollowUpMax(e.target.value)} className={`${selectClass} mt-2`}><option value="1">1 tentativa</option><option value="2">2 tentativas</option><option value="3">3 tentativas</option><option value="5">5 tentativas</option></select></div>
      </div>

      {/* S7: Technical Info */}
      {sectionTitle("7. Informações técnicas")}
      <Toggle checked={hasTechInfo} onChange={setHasTechInfo} label="Este plano tem informações técnicas?" />
      {hasTechInfo && (
        <div className="grid gap-4 md:grid-cols-2">
          <div><label className="mb-1 block text-xs font-medium text-gray-600">Modo de uso</label><select value={usageMode} onChange={e => setUsageMode(e.target.value)} className={selectClass}><option value="">Selecione</option>{USAGE_MODES.map(u => <option key={u} value={u}>{u}</option>)}</select></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-600">Duração</label><select value={duration} onChange={e => setDuration(e.target.value)} className={selectClass}><option value="">Selecione</option>{DURATIONS.map(d => <option key={d} value={d}>{d}</option>)}</select></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-600">Contraindicações</label><div className="space-y-1">{CONTRAINDICATIONS.map(c => <label key={c} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={contraindications.includes(c)} onChange={() => toggleList(contraindications, c, setContraindications)} className="accent-teal-600" />{c}</label>)}</div></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-600">Resultados esperados em</label><select value={expectedResults} onChange={e => setExpectedResults(e.target.value)} className={selectClass}><option value="">Selecione</option>{RESULTS.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
        </div>
      )}

      {/* Summary Box */}
      <div className="rounded-xl border p-5" style={{ borderColor: `${colors.brand.primary}30`, background: `${colors.brand.primary}05` }}>
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 h-5 w-5 text-teal-600 flex-shrink-0" />
          <div><h4 className="text-sm font-semibold text-gray-900">Resumo do que a IA sabe sobre este plano</h4><p className="mt-2 text-sm text-gray-600">{summary}</p></div>
        </div>
      </div>
    </div>
  )
}
