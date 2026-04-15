'use client';
import { useToast } from '@/components/kloel/ToastProvider';
import { apiFetch } from '@/lib/api';
import { colors, typography } from '@/lib/design-tokens';
import { Bot, ChevronDown, ChevronUp, Plus, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { mutate } from 'swr';

const PACKAGE_TYPES = [
  'Envelope',
  'Caixa pequena (30cm)',
  'Caixa média (60cm)',
  'Caixa grande (100cm)',
  'Tubo',
  'Saco plástico',
  'Personalizada',
];
const CARRIERS = [
  'Correios PAC',
  'Correios SEDEX',
  'Jadlog',
  'Loggi',
  'Total Express',
  'Azul Cargo',
  'Latam Cargo',
  'Sequoia',
  'Kangu',
  'Melhor Envio',
  'Transportadora própria',
];
const REGIONS = ['Sul', 'Sudeste', 'Centro-Oeste', 'Nordeste', 'Norte'];
const PRAZO_OPTIONS = [
  '1-2 dias',
  '2-4 dias',
  '3-5 dias',
  '5-7 dias',
  '7-10 dias',
  '10-15 dias',
  '15-20 dias',
  '20-30 dias',
  '30-45 dias',
  '45-60 dias',
];
const OBS_OPTIONS = [
  'Entrega normal',
  'Pode haver atrasos em feriados',
  'Sujeito a condições climáticas',
  'Entrega via transportadora local',
  'Retirada disponível',
  'Prazo pode variar',
];
const SHIP_FROM = [
  { v: 'my_address', l: 'Meu endereço' },
  { v: 'supplier', l: 'Fornecedor' },
  { v: 'distribution', l: 'Centro de distribuição' },
  { v: 'multiple', l: 'Múltiplos endereços' },
];

const FAQ_QUESTIONS = [
  'O que acontece se eu não estiver em casa na hora da entrega?',
  'Posso alterar o endereço de entrega após a compra?',
  'Meu pedido atrasou, o que fazer?',
  'O produto chegou danificado, como proceder?',
  'Vocês entregam para todo o Brasil?',
  'Qual o prazo de entrega para minha região?',
  'O frete é grátis?',
  'Posso retirar o produto pessoalmente?',
  'Vocês enviam para fora do Brasil?',
  'Como embalam o produto?',
];
const FAQ_ANSWERS: Record<number, string[]> = {
  0: [
    'Tentativa de reentrega no próximo dia útil',
    'Produto fica disponível para retirada na agência',
    'Entraremos em contato para reagendar',
  ],
  1: [
    'Sim, desde que o pedido não tenha sido despachado',
    'Somente antes do envio, via suporte',
    'Não é possível alterar após confirmação',
  ],
  2: [
    'Entre em contato pelo WhatsApp que verificamos',
    'Aguarde o prazo máximo e depois nos procure',
    'Verificaremos com a transportadora',
  ],
  3: [
    'Envie fotos pelo WhatsApp para iniciarmos a troca',
    'Recusa na entrega e solicite reenvio',
    'Abra reclamação e garantimos o reenvio',
  ],
  4: [
    'Sim, entregamos em todo território nacional',
    'Sim, exceto algumas áreas rurais remotas',
    'Consulte disponibilidade para sua região',
  ],
  5: [
    'Varia conforme a região, consulte no checkout',
    'O prazo estimado aparece após informar o CEP',
    'Entre 5-15 dias úteis dependendo da localidade',
  ],
  6: [
    'Sim, frete grátis para todo o Brasil',
    'Frete grátis para compras acima de R$ 200',
    'O frete é calculado no checkout',
  ],
  7: [
    'Não trabalhamos com retirada presencial',
    'Sim, em nosso escritório com agendamento',
    'Apenas envio pelos Correios/transportadora',
  ],
  8: [
    'No momento enviamos apenas para o Brasil',
    'Sim, consulte tarifas internacionais',
    'Apenas para países do Mercosul',
  ],
  9: [
    'Embalagem reforçada com plástico bolha',
    'Caixa de papelão com proteção interna',
    'Embalagem discreta e segura',
  ],
};

export function PlanShippingTab({ planId, productId }: { planId: string; productId: string }) {
  const [packageType, setPackageType] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [length, setLength] = useState('');
  const [weight, setWeight] = useState('');
  const [whoShips, setWhoShips] = useState('self');
  const [shipFrom, setShipFrom] = useState('my_address');
  const [dispatchTime, setDispatchTime] = useState('3');
  const [selectedCarriers, setSelectedCarriers] = useState<string[]>([
    'Correios PAC',
    'Correios SEDEX',
  ]);
  const [freightType, setFreightType] = useState('calculated');
  const [fixedFreight, setFixedFreight] = useState('');
  const [hasTracking, setHasTracking] = useState('all');
  const [regionPrazos, setRegionPrazos] = useState<Record<string, { prazo: string; obs: string }>>(
    Object.fromEntries(REGIONS.map((r) => [r, { prazo: '5-7 dias', obs: 'Entrega normal' }])),
  );
  const [faqAnswers, setFaqAnswers] = useState<Record<number, string>>(
    Object.fromEntries(FAQ_QUESTIONS.map((_, i) => [i, FAQ_ANSWERS[i]?.[0] || ''])),
  );
  const [openFaqs, setOpenFaqs] = useState<Record<number, boolean>>({});
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (!productId || !planId) return;
    apiFetch(`/products/${encodeURIComponent(productId)}/plans/${encodeURIComponent(planId)}`).then(
      (res) => {
        if (res.error || !res.data) return;
        const d = res.data as Record<string, unknown>;
        const dims = d.dimensions as Record<string, unknown> | undefined;
        if (d.packageType != null) setPackageType(d.packageType as string);
        if (dims?.width != null) setWidth(String(dims.width));
        if (dims?.height != null) setHeight(String(dims.height));
        if (dims?.length != null) setLength(String(dims.length));
        if (d.weight != null) setWeight(String(d.weight));
        if (d.whoShips != null) setWhoShips(d.whoShips as string);
        if (d.shipFrom != null) setShipFrom(d.shipFrom as string);
        if (d.dispatchTime != null) setDispatchTime(String(d.dispatchTime));
        if (d.carriers != null) setSelectedCarriers(d.carriers as string[]);
        if (d.freightType != null) setFreightType(d.freightType as string);
        if (d.fixedFreight != null) setFixedFreight(String(d.fixedFreight));
        if (d.tracking != null) setHasTracking(d.tracking as string);
        if (d.regionPrazos != null)
          setRegionPrazos(d.regionPrazos as Record<string, { prazo: string; obs: string }>);
        if (d.faqAnswers != null) setFaqAnswers(d.faqAnswers as Record<number, string>);
      },
    );
  }, [productId, planId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch(
        `/products/${encodeURIComponent(productId)}/plans/${encodeURIComponent(planId)}`,
        {
          method: 'PUT',
          body: {
            packageType,
            dimensions: { width, height, length },
            weight,
            shipper: whoShips,
            shipFrom,
            dispatchTime,
            carriers: selectedCarriers,
            shippingCost: freightType === 'fixed' ? fixedFreight : freightType,
            regionPrazos,
            tracking: hasTracking,
            faqAnswers,
          },
        },
      );
      mutate((key: unknown) => typeof key === 'string' && key.startsWith('/products'));
      showToast('Configurações salvas!', 'success');
    } catch (e) {
      console.error('Save failed', e);
      showToast('Erro ao salvar', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Cosmos styling helpers
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
  const selectClass = 'w-full rounded-lg px-4 py-2.5 text-sm focus:outline-none';
  const inputClass = selectClass;

  const sectionTitle = (t: string) => (
    <h3
      className="mb-4 text-sm font-semibold uppercase"
      style={{
        fontFamily: typography.fontFamily.display,
        color: colors.text.starlight,
        letterSpacing: '0.02em',
      }}
    >
      {t}
    </h3>
  );

  const CosmosRadioGroup = ({
    value,
    onChange,
    label,
    options,
  }: {
    value: string;
    onChange: (v: string) => void;
    label: string;
    options: { value: string; label: string }[];
  }) => (
    <div>
      <label className="mb-2 block" style={labelStyle}>
        {label}
      </label>
      <div className="space-y-2">
        {options.map((opt) => (
          <label key={opt.value} className="flex cursor-pointer items-start gap-2.5">
            <input
              type="radio"
              name={label}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              style={{ accentColor: colors.accent.webb }}
              className="mt-0.5"
            />
            <span className="text-sm font-medium" style={{ color: colors.text.starlight }}>
              {opt.label}
            </span>
          </label>
        ))}
      </div>
    </div>
  );

  const toggleFaq = (i: number) => setOpenFaqs({ ...openFaqs, [i]: !openFaqs[i] });

  return (
    <div className="space-y-8">
      {/* Packaging */}
      <div className="rounded-xl p-5" style={cardStyle}>
        {sectionTitle('Embalagem do produto')}
        <div className="grid gap-4 md:grid-cols-5">
          <div className="md:col-span-2">
            <label style={labelStyle}>Tipo de embalagem *</label>
            <select
              value={packageType}
              onChange={(e) => setPackageType(e.target.value)}
              className={`${selectClass} mt-1.5`}
              style={inputStyle}
            >
              <option value="">Selecione</option>
              {PACKAGE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Largura (cm)</label>
            <input
              aria-label="Largura em cm"
              type="number"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              className={`${inputClass} mt-1.5`}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Altura (cm)</label>
            <input
              aria-label="Altura em cm"
              type="number"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              className={`${inputClass} mt-1.5`}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Comprimento (cm)</label>
            <input
              aria-label="Comprimento em cm"
              type="number"
              value={length}
              onChange={(e) => setLength(e.target.value)}
              className={`${inputClass} mt-1.5`}
              style={inputStyle}
            />
          </div>
        </div>
        <div className="mt-3 flex items-end gap-4">
          <div className="w-40">
            <label style={labelStyle}>Peso (kg) *</label>
            <input
              aria-label="Peso em kg"
              type="number"
              step="0.1"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className={`${inputClass} mt-1.5`}
              style={inputStyle}
            />
          </div>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full text-white transition-all"
            style={{ backgroundColor: colors.accent.webb, boxShadow: 'none' }}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Logistics */}
      <div className="rounded-xl p-5" style={cardStyle}>
        {sectionTitle('Logística de envio')}
        <div className="grid gap-8 md:grid-cols-2">
          <div className="space-y-4">
            <CosmosRadioGroup
              value={whoShips}
              onChange={setWhoShips}
              label="Quem realiza o envio? *"
              options={[
                { value: 'self', label: 'Eu mesmo' },
                { value: 'supplier', label: 'Meu fornecedor' },
                { value: 'fulfillment', label: 'Fulfillment' },
                { value: 'dropshipping', label: 'Dropshipping' },
              ]}
            />

            {/* From where — 4 radio options */}
            <CosmosRadioGroup
              value={shipFrom}
              onChange={setShipFrom}
              label="De onde sai o envio? *"
              options={SHIP_FROM.map((s) => ({ value: s.v, label: s.l }))}
            />

            <div>
              <label style={labelStyle}>Prazo de despacho *</label>
              <select
                value={dispatchTime}
                onChange={(e) => setDispatchTime(e.target.value)}
                className={`${selectClass} mt-1.5`}
                style={inputStyle}
              >
                <option value="1">24 horas</option>
                <option value="3">1-3 dias úteis</option>
                <option value="5">3-5 dias úteis</option>
                <option value="7">5-7 dias úteis</option>
                <option value="10">7-10 dias úteis</option>
                <option value="15">10-15 dias úteis</option>
              </select>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label style={labelStyle}>Transportadoras *</label>
              <div className="space-y-1.5 mt-1.5">
                {CARRIERS.map((c) => (
                  <label
                    key={c}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                    style={{ color: colors.text.starlight }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedCarriers.includes(c)}
                      onChange={(e) =>
                        setSelectedCarriers(
                          e.target.checked
                            ? [...selectedCarriers, c]
                            : selectedCarriers.filter((x) => x !== c),
                        )
                      }
                      style={{ accentColor: colors.accent.webb }}
                    />
                    {c}
                  </label>
                ))}
              </div>
            </div>
            <CosmosRadioGroup
              value={freightType}
              onChange={setFreightType}
              label="Frete para o comprador *"
              options={[
                { value: 'free', label: 'Grátis' },
                { value: 'calculated', label: 'Calculado pelo CEP' },
                { value: 'fixed', label: 'Fixo' },
                { value: 'variable', label: 'Variável por região' },
              ]}
            />
            {freightType === 'fixed' && (
              <div>
                <label style={labelStyle}>Valor fixo (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={fixedFreight}
                  onChange={(e) => setFixedFreight(e.target.value)}
                  className={`${inputClass} mt-1.5`}
                  style={inputStyle}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Region Deadlines — Cosmos styled table */}
      <div className="rounded-xl p-5" style={cardStyle}>
        {sectionTitle('Prazos de entrega por região')}
        <div
          className="overflow-x-auto rounded-lg"
          style={{ border: `1px solid ${colors.border.space}` }}
        >
          <table className="w-full text-sm">
            <thead
              style={{
                background: colors.background.nebula,
                borderBottom: `1px solid ${colors.border.space}`,
              }}
            >
              <tr>
                <th className="px-4 py-3 text-left" style={labelStyle}>
                  Região
                </th>
                <th className="px-4 py-3 text-left" style={labelStyle}>
                  Prazo estimado
                </th>
                <th className="px-4 py-3 text-left" style={labelStyle}>
                  Observação
                </th>
              </tr>
            </thead>
            <tbody>
              {REGIONS.map((r, i) => (
                <tr
                  key={r}
                  style={{
                    background: i % 2 === 0 ? colors.background.space : colors.background.void,
                    borderBottom: `1px solid ${colors.border.void}`,
                  }}
                >
                  <td className="px-4 py-3 font-medium" style={{ color: colors.text.starlight }}>
                    {r}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={regionPrazos[r]?.prazo}
                      onChange={(e) =>
                        setRegionPrazos({
                          ...regionPrazos,
                          [r]: { ...regionPrazos[r], prazo: e.target.value },
                        })
                      }
                      className="rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                      style={inputStyle}
                    >
                      {PRAZO_OPTIONS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={regionPrazos[r]?.obs}
                      onChange={(e) =>
                        setRegionPrazos({
                          ...regionPrazos,
                          [r]: { ...regionPrazos[r], obs: e.target.value },
                        })
                      }
                      className="rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                      style={inputStyle}
                    >
                      {OBS_OPTIONS.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tracking */}
      <div className="rounded-xl p-5" style={cardStyle}>
        <CosmosRadioGroup
          value={hasTracking}
          onChange={setHasTracking}
          label="O produto possui código de rastreamento?"
          options={[
            { value: 'all', label: 'Sim, todos os envios' },
            { value: 'sedex', label: 'Sim, apenas SEDEX' },
            { value: 'no', label: 'Não' },
          ]}
        />
      </div>

      {/* FAQ — Collapsible cards with smooth animation */}
      <div className="rounded-xl p-5" style={cardStyle}>
        {sectionTitle('Política de entrega — FAQ')}
        <div className="space-y-3">
          {FAQ_QUESTIONS.map((q, i) => {
            const isOpen = openFaqs[i] ?? false;
            return (
              <div
                key={i}
                className="rounded-xl overflow-hidden transition-all"
                style={{
                  background: colors.background.nebula,
                  border: `1px solid ${colors.border.space}`,
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleFaq(i)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:opacity-80"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium" style={{ color: colors.text.starlight }}>
                      {q}
                    </span>
                    <span
                      className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase flex-shrink-0"
                      style={{
                        background: `${colors.accent.webb}15`,
                        color: colors.accent.webb,
                        letterSpacing: '0.05em',
                      }}
                    >
                      <Bot className="h-2.5 w-2.5" aria-hidden="true" /> IA usa esta resposta
                    </span>
                  </div>
                  {isOpen ? (
                    <ChevronUp
                      className="h-4 w-4 flex-shrink-0"
                      style={{ color: colors.text.dust }}
                      aria-hidden="true"
                    />
                  ) : (
                    <ChevronDown
                      className="h-4 w-4 flex-shrink-0"
                      style={{ color: colors.text.dust }}
                      aria-hidden="true"
                    />
                  )}
                </button>
                <div
                  className="overflow-hidden transition-all"
                  style={{
                    maxHeight: isOpen ? '200px' : '0px',
                    opacity: isOpen ? 1 : 0,
                    transition: 'max-height 300ms ease, opacity 250ms ease',
                  }}
                >
                  <div className="px-4 pb-4">
                    <select
                      value={faqAnswers[i]}
                      onChange={(e) => setFaqAnswers({ ...faqAnswers, [i]: e.target.value })}
                      className={selectClass}
                      style={inputStyle}
                    >
                      {(FAQ_ANSWERS[i] || []).map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* AI Note — Webb blue glow border */}
      <div
        className="flex items-start gap-3 rounded-xl p-5"
        style={{
          background: `${colors.accent.webb}05`,
          border: `1px solid ${colors.accent.webb}30`,
          boxShadow: `0 0 20px ${colors.accent.webb}10, 0 0 40px ${colors.accent.webb}05`,
        }}
      >
        <Sparkles
          className="mt-0.5 h-5 w-5 flex-shrink-0"
          style={{ color: colors.accent.webb }}
          aria-hidden="true"
        />
        <p className="text-sm" style={{ color: colors.text.moonlight }}>
          A IA do Kloel usará todas as informações configuradas nesta página para responder
          automaticamente perguntas dos seus clientes sobre entrega, rastreamento e prazos.
        </p>
      </div>

      {/* Save Button */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl px-8 py-3 text-sm font-semibold text-white transition-all disabled:opacity-50"
          style={{ backgroundColor: '#E0DDD8', color: '#0A0A0C', boxShadow: 'none' }}
        >
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  );
}
