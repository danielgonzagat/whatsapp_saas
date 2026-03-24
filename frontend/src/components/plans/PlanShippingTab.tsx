"use client"
import { useState } from "react"
import { Plus, Sparkles } from "lucide-react"
import { RadioGroup } from "@/components/kloel/FormExtras"
import { colors } from "@/lib/design-tokens"

const PACKAGE_TYPES = ["Envelope", "Caixa pequena (30cm)", "Caixa média (60cm)", "Caixa grande (100cm)", "Tubo", "Saco plástico", "Personalizada"]
const CARRIERS = ["Correios PAC", "Correios SEDEX", "Jadlog", "Loggi", "Total Express", "Azul Cargo", "Latam Cargo", "Sequoia", "Kangu", "Melhor Envio"]
const REGIONS = ["Sul", "Sudeste", "Centro-Oeste", "Nordeste", "Norte"]
const PRAZO_OPTIONS = ["1-2 dias", "2-4 dias", "3-5 dias", "5-7 dias", "7-10 dias", "10-15 dias", "15-20 dias", "20-30 dias", "30-45 dias", "45-60 dias"]
const OBS_OPTIONS = ["Entrega normal", "Pode haver atrasos em feriados", "Sujeito a condições climáticas", "Entrega via transportadora local", "Retirada disponível", "Prazo pode variar"]

const FAQ_QUESTIONS = [
  "O que acontece se eu não estiver em casa na hora da entrega?",
  "Posso alterar o endereço de entrega após a compra?",
  "Meu pedido atrasou, o que fazer?",
  "O produto chegou danificado, como proceder?",
  "Vocês entregam para todo o Brasil?",
  "Qual o prazo de entrega para minha região?",
  "O frete é grátis?",
  "Posso retirar o produto pessoalmente?",
  "Vocês enviam para fora do Brasil?",
  "Como embalam o produto?",
]
const FAQ_ANSWERS: Record<number, string[]> = {
  0: ["Tentativa de reentrega no próximo dia útil", "Produto fica disponível para retirada na agência", "Entraremos em contato para reagendar"],
  1: ["Sim, desde que o pedido não tenha sido despachado", "Somente antes do envio, via suporte", "Não é possível alterar após confirmação"],
  2: ["Entre em contato pelo WhatsApp que verificamos", "Aguarde o prazo máximo e depois nos procure", "Verificaremos com a transportadora"],
  3: ["Envie fotos pelo WhatsApp para iniciarmos a troca", "Recusa na entrega e solicite reenvio", "Abra reclamação e garantimos o reemvio"],
  4: ["Sim, entregamos em todo território nacional", "Sim, exceto algumas áreas rurais remotas", "Consulte disponibilidade para sua região"],
  5: ["Varia conforme a região, consulte no checkout", "O prazo estimado aparece após informar o CEP", "Entre 5-15 dias úteis dependendo da localidade"],
  6: ["Sim, frete grátis para todo o Brasil", "Frete grátis para compras acima de R$ 200", "O frete é calculado no checkout"],
  7: ["Não trabalhamos com retirada presencial", "Sim, em nosso escritório com agendamento", "Apenas envio pelos Correios/transportadora"],
  8: ["No momento enviamos apenas para o Brasil", "Sim, consulte tarifas internacionais", "Apenas para países do Mercosul"],
  9: ["Embalagem reforçada com plástico bolha", "Caixa de papelão com proteção interna", "Embalagem discreta e segura"],
}

export function PlanShippingTab({ planId }: { planId: string }) {
  const [packageType, setPackageType] = useState("")
  const [width, setWidth] = useState("")
  const [height, setHeight] = useState("")
  const [length, setLength] = useState("")
  const [weight, setWeight] = useState("")
  const [whoShips, setWhoShips] = useState("self")
  const [shipFrom, setShipFrom] = useState("my_city")
  const [dispatchTime, setDispatchTime] = useState("3")
  const [selectedCarriers, setSelectedCarriers] = useState<string[]>(["Correios PAC", "Correios SEDEX"])
  const [freightType, setFreightType] = useState("calculated")
  const [fixedFreight, setFixedFreight] = useState("")
  const [hasTracking, setHasTracking] = useState("all")
  const [regionPrazos, setRegionPrazos] = useState<Record<string, { prazo: string; obs: string }>>(
    Object.fromEntries(REGIONS.map(r => [r, { prazo: "5-7 dias", obs: "Entrega normal" }]))
  )
  const [faqAnswers, setFaqAnswers] = useState<Record<number, string>>(
    Object.fromEntries(FAQ_QUESTIONS.map((_, i) => [i, FAQ_ANSWERS[i]?.[0] || ""]))
  )

  const selectClass = "w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-teal-500 focus:outline-none"
  const inputClass = selectClass
  const labelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-600"

  return (
    <div className="space-y-8">
      {/* Packaging */}
      <div>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-600">Embalagem do produto</h3>
        <div className="grid gap-4 md:grid-cols-5">
          <div className="md:col-span-2"><label className={labelClass}>Tipo de embalagem *</label><select value={packageType} onChange={e => setPackageType(e.target.value)} className={selectClass}><option value="">Selecione</option>{PACKAGE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
          <div><label className={labelClass}>Largura (cm)</label><input type="number" value={width} onChange={e => setWidth(e.target.value)} className={inputClass} /></div>
          <div><label className={labelClass}>Altura (cm)</label><input type="number" value={height} onChange={e => setHeight(e.target.value)} className={inputClass} /></div>
          <div><label className={labelClass}>Comprimento (cm)</label><input type="number" value={length} onChange={e => setLength(e.target.value)} className={inputClass} /></div>
        </div>
        <div className="mt-3 flex items-end gap-4">
          <div className="w-40"><label className={labelClass}>Peso (kg) *</label><input type="number" step="0.1" value={weight} onChange={e => setWeight(e.target.value)} className={inputClass} /></div>
          <button className="flex h-10 w-10 items-center justify-center rounded-full text-white" style={{ backgroundColor: colors.brand.primary }}><Plus className="h-4 w-4" /></button>
        </div>
      </div>

      {/* Logistics */}
      <div>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-600">Logística de envio</h3>
        <div className="grid gap-8 md:grid-cols-2">
          <div className="space-y-4">
            <RadioGroup value={whoShips} onChange={setWhoShips} label="Quem realiza o envio? *" options={[{value:"self",label:"Eu mesmo"},{value:"supplier",label:"Meu fornecedor"},{value:"fulfillment",label:"Fulfillment"},{value:"dropshipping",label:"Dropshipping"}]} />
            <div><label className={labelClass}>Prazo de despacho *</label><select value={dispatchTime} onChange={e => setDispatchTime(e.target.value)} className={selectClass}><option value="1">24 horas</option><option value="3">1-3 dias úteis</option><option value="5">3-5 dias úteis</option><option value="7">5-7 dias úteis</option><option value="10">7-10 dias úteis</option><option value="15">10-15 dias úteis</option></select></div>
          </div>
          <div className="space-y-4">
            <div><label className={labelClass}>Transportadoras *</label><div className="space-y-1.5">{CARRIERS.map(c => <label key={c} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selectedCarriers.includes(c)} onChange={e => setSelectedCarriers(e.target.checked ? [...selectedCarriers, c] : selectedCarriers.filter(x => x !== c))} className="accent-teal-600" />{c}</label>)}</div></div>
            <RadioGroup value={freightType} onChange={setFreightType} label="Frete para o comprador *" options={[{value:"free",label:"Grátis"},{value:"calculated",label:"Calculado pelo CEP"},{value:"fixed",label:"Fixo"},{value:"variable",label:"Variável por região"}]} />
            {freightType === "fixed" && <div><label className={labelClass}>Valor fixo (R$)</label><input type="number" step="0.01" value={fixedFreight} onChange={e => setFixedFreight(e.target.value)} className={inputClass} /></div>}
          </div>
        </div>
      </div>

      {/* Region Deadlines */}
      <div>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-600">Prazos de entrega por região</h3>
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm"><thead className="bg-gray-50 border-b"><tr><th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Região</th><th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Prazo estimado</th><th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Observação</th></tr></thead>
            <tbody className="divide-y">{REGIONS.map(r => <tr key={r}><td className="px-4 py-2 font-medium text-gray-800">{r}</td><td className="px-4 py-2"><select value={regionPrazos[r]?.prazo} onChange={e => setRegionPrazos({...regionPrazos, [r]: {...regionPrazos[r], prazo: e.target.value}})} className="rounded border border-gray-200 px-2 py-1 text-xs">{PRAZO_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}</select></td><td className="px-4 py-2"><select value={regionPrazos[r]?.obs} onChange={e => setRegionPrazos({...regionPrazos, [r]: {...regionPrazos[r], obs: e.target.value}})} className="rounded border border-gray-200 px-2 py-1 text-xs">{OBS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}</select></td></tr>)}</tbody>
          </table>
        </div>
      </div>

      {/* Tracking */}
      <RadioGroup value={hasTracking} onChange={setHasTracking} label="O produto possui código de rastreamento?" options={[{value:"all",label:"Sim, todos os envios"},{value:"sedex",label:"Sim, apenas SEDEX"},{value:"no",label:"Não"}]} />

      {/* FAQ */}
      <div>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-600">Política de entrega — FAQ</h3>
        <div className="space-y-3">
          {FAQ_QUESTIONS.map((q, i) => (
            <div key={i} className="rounded-lg border border-gray-200 p-4">
              <p className="mb-2 text-sm font-medium text-gray-800">{q}</p>
              <select value={faqAnswers[i]} onChange={e => setFaqAnswers({...faqAnswers, [i]: e.target.value})} className={selectClass}>
                {(FAQ_ANSWERS[i] || []).map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* AI Note */}
      <div className="flex items-start gap-3 rounded-xl p-5" style={{ background: `linear-gradient(135deg, ${colors.brand.primary}08, ${colors.brand.accent}08)` }}>
        <Sparkles className="mt-0.5 h-5 w-5 text-teal-600 flex-shrink-0" />
        <p className="text-sm text-gray-600">A IA do Kloel usará todas as informações configuradas nesta página para responder automaticamente perguntas dos seus clientes sobre entrega, rastreamento e prazos.</p>
      </div>
    </div>
  )
}
