'use client';
import { apiFetch } from '@/lib/api';
import { colors, typography } from '@/lib/design-tokens';
import {
  Check,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  MessageCircle,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { mutate } from 'swr';

interface ProductUrlItem {
  id: string;
  description: string;
  url: string;
  isPrivate: boolean;
  active: boolean;
  aiLearning: boolean;
  aiLearnStatus: string | null;
  chatEnabled: boolean;
  salesFromUrl: number;
}

const AI_LEARN_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: 'var(--app-bg-hover)', text: 'var(--app-text-secondary)', label: 'Aguardando' },
  learning: { bg: '#E85D3020', text: '#E85D30', label: 'Aprendendo...' },
  learned: { bg: 'var(--app-success-bg)', text: 'var(--app-success)', label: 'Aprendido' },
  error: { bg: '#E0525220', text: '#E05252', label: 'Erro' },
};

const AI_LEARN_OPTIONS = [
  'Preços',
  'Benefícios',
  'Perguntas frequentes',
  'Depoimentos',
  'Especificações técnicas',
  'Políticas',
];
const UPDATE_FREQ = [
  { v: 'manual', l: 'Manual' },
  { v: 'weekly', l: 'Semanal' },
  { v: 'biweekly', l: 'Quinzenal' },
  { v: 'monthly', l: 'Mensal' },
];
const WIDGET_POSITIONS = [
  { v: 'bottom-right', l: 'Canto inferior direito' },
  { v: 'bottom-left', l: 'Canto inferior esquerdo' },
];
const TRIGGER_TIMINGS = [
  { v: '0', l: 'Imediato' },
  { v: '3000', l: '3 segundos' },
  { v: '5000', l: '5 segundos' },
  { v: '10000', l: '10 segundos' },
  { v: '30000', l: '30 segundos' },
  { v: 'exit', l: 'Exit intent' },
];

export function ProductUrlsTab({ productId }: { productId: string }) {
  const fid = useId();
  const [items, setItems] = useState<ProductUrlItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [_showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    description: '',
    url: '',
    isPrivate: false,
    aiLearning: false,
    chatEnabled: false,
  });
  const [creating, setCreating] = useState(false);

  // AI Learning fields
  const [aiLearnTopics, setAiLearnTopics] = useState<string[]>([]);
  const [aiUpdateFreq, setAiUpdateFreq] = useState('manual');

  // Chat Widget fields
  const [widgetPosition, setWidgetPosition] = useState('bottom-right');
  const [widgetColor, setWidgetColor] = useState('#E85D30');
  const [widgetMessage, setWidgetMessage] = useState('Olá! Como posso ajudar?');
  const [widgetTrigger, setWidgetTrigger] = useState('5000');
  const [codeCopied, setCodeCopied] = useState(false);
  const codeCopiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (codeCopiedTimer.current) clearTimeout(codeCopiedTimer.current);
    },
    [],
  );

  const fetch_ = useCallback(() => {
    apiFetch<ProductUrlItem[] | { data?: ProductUrlItem[] }>(`/products/${productId}/urls`)
      .then((r) => setItems(Array.isArray(r) ? r : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [productId]);
  useEffect(() => {
    fetch_();
  }, [fetch_]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await apiFetch(`/products/${productId}/urls`, {
        method: 'POST',
        body: {
          ...form,
          aiLearnTopics,
          aiUpdateFreq,
          widgetPosition,
          widgetColor,
          widgetMessage,
          widgetTrigger,
        },
      });
      setShowForm(false);
      setForm({
        description: '',
        url: '',
        isPrivate: false,
        aiLearning: false,
        chatEnabled: false,
      });
      mutate((key: unknown) => typeof key === 'string' && key.startsWith('/products'));
      fetch_();
    } catch {
    } finally {
      setCreating(false);
    }
  };
  const handleDelete = async (id: string) => {
    if (!confirm('Excluir URL?')) return;
    await apiFetch(`/products/${productId}/urls/${id}`, { method: 'DELETE' });
    fetch_();
  };

  // Cosmos styling
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

  const WIDGET_URL = process.env.NEXT_PUBLIC_WIDGET_URL || 'https://widget.kloel.com';
  const widgetCode = [
    '<script src="',
    `${WIDGET_URL}/chat.js`,
    '"',
    '\n  data-product-id="',
    productId,
    '"',
    '\n  data-position="',
    widgetPosition,
    '"',
    '\n  data-color="',
    widgetColor,
    '"',
    '\n  data-delay="',
    widgetTrigger,
    '"',
    '\n  data-message="',
    widgetMessage,
    '"',
    '\n  async>',
    '\n</script>',
  ].join('');

  const handleCopyCode = () => {
    navigator.clipboard.writeText(widgetCode);
    setCodeCopied(true);
    if (codeCopiedTimer.current) clearTimeout(codeCopiedTimer.current);
    codeCopiedTimer.current = setTimeout(() => setCodeCopied(false), 2000);
  };

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
    <div className="space-y-6">
      {/* Add Form */}
      <div className="rounded-xl p-5" style={cardStyle}>
        <h3
          className="mb-4 text-sm font-semibold uppercase"
          style={{
            fontFamily: typography.fontFamily.display,
            color: colors.text.starlight,
            letterSpacing: '0.02em',
          }}
        >
          Adicionar URL
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block" style={labelStyle} htmlFor={`${fid}-desc`}>
              Descrição *
            </label>
            <input
              aria-label="Descricao da URL"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              maxLength={255}
              placeholder="Página de vendas principal"
              className={selectClass}
              style={inputStyle}
              id={`${fid}-desc`}
            />
            <p className="mt-1 text-right text-xs" style={{ color: colors.text.dust }}>
              {form.description.length}/255
            </p>
          </div>
          <div>
            <label className="mb-1 block" style={labelStyle} htmlFor={`${fid}-url`}>
              URL *
            </label>
            <input
              aria-label="URL da pagina"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              maxLength={255}
              placeholder="https://..."
              className={selectClass}
              style={inputStyle}
              id={`${fid}-url`}
            />
            <p className="mt-1 text-right text-xs" style={{ color: colors.text.dust }}>
              {form.url.length}/255
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-6">
          <label
            className="flex items-center gap-2 text-sm cursor-pointer"
            style={{ color: colors.text.starlight }}
          >
            <input
              type="checkbox"
              checked={form.isPrivate}
              onChange={(e) => setForm({ ...form, isPrivate: e.target.checked })}
              style={{ accentColor: colors.accent.webb }}
            />
            URL privada
          </label>
          <label
            className="flex items-center gap-2 text-sm cursor-pointer"
            style={{ color: colors.text.starlight }}
          >
            <Sparkles
              className="h-4 w-4"
              style={{ color: colors.accent.webb }}
              aria-hidden="true"
            />
            <input
              type="checkbox"
              checked={form.aiLearning}
              onChange={(e) => setForm({ ...form, aiLearning: e.target.checked })}
              style={{ accentColor: colors.accent.webb }}
            />
            Kloel pode aprender com essa URL?
          </label>
          <label
            className="flex items-center gap-2 text-sm cursor-pointer"
            style={{ color: colors.text.starlight }}
          >
            <MessageCircle
              className="h-4 w-4"
              style={{ color: colors.accent.webb }}
              aria-hidden="true"
            />
            <input
              type="checkbox"
              checked={form.chatEnabled}
              onChange={(e) => setForm({ ...form, chatEnabled: e.target.checked })}
              style={{ accentColor: colors.accent.webb }}
            />
            Integrar chat Kloel nessa URL?
          </label>
        </div>

        {/* AI Learning section -- expanded when toggle active */}
        {form.aiLearning && (
          <div
            className="mt-4 rounded-xl p-4"
            style={{
              background: `${colors.accent.webb}05`,
              border: `1px solid ${colors.accent.webb}15`,
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Sparkles
                className="h-4 w-4"
                style={{ color: colors.accent.webb }}
                aria-hidden="true"
              />
              <span
                className="text-xs font-semibold uppercase"
                style={{ ...labelStyle, color: colors.accent.webb }}
              >
                Configuração de aprendizado
              </span>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <span className="mb-2 block" style={labelStyle}>
                  O que a IA deve aprender?
                </span>
                <div className="space-y-1.5">
                  {AI_LEARN_OPTIONS.map((opt) => (
                    <label
                      key={opt}
                      className="flex items-center gap-2 text-sm cursor-pointer"
                      style={{ color: colors.text.starlight }}
                    >
                      <input
                        type="checkbox"
                        checked={aiLearnTopics.includes(opt)}
                        onChange={() =>
                          setAiLearnTopics(
                            aiLearnTopics.includes(opt)
                              ? aiLearnTopics.filter((x) => x !== opt)
                              : [...aiLearnTopics, opt],
                          )
                        }
                        style={{ accentColor: colors.accent.webb }}
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <span className="mb-2 block" style={labelStyle}>
                  Frequência de atualização
                </span>
                <div className="space-y-1.5">
                  {UPDATE_FREQ.map((f) => (
                    <label
                      key={f.v}
                      className="flex items-center gap-2 text-sm cursor-pointer"
                      style={{ color: colors.text.starlight }}
                    >
                      <input
                        type="radio"
                        name="updateFreq"
                        checked={aiUpdateFreq === f.v}
                        onChange={() => setAiUpdateFreq(f.v)}
                        style={{ accentColor: colors.accent.webb }}
                      />
                      {f.l}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Chat Widget section -- expanded when toggle active */}
        {form.chatEnabled && (
          <div
            className="mt-4 rounded-xl p-4"
            style={{
              background: `${colors.accent.webb}05`,
              border: `1px solid ${colors.accent.webb}15`,
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <MessageCircle
                className="h-4 w-4"
                style={{ color: colors.accent.webb }}
                aria-hidden="true"
              />
              <span
                className="text-xs font-semibold uppercase"
                style={{ ...labelStyle, color: colors.accent.webb }}
              >
                Configuração do widget
              </span>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <span className="mb-2 block" style={labelStyle}>
                  Posição do widget
                </span>
                <div className="space-y-1.5">
                  {WIDGET_POSITIONS.map((p) => (
                    <label
                      key={p.v}
                      className="flex items-center gap-2 text-sm cursor-pointer"
                      style={{ color: colors.text.starlight }}
                    >
                      <input
                        type="radio"
                        name="widgetPos"
                        checked={widgetPosition === p.v}
                        onChange={() => setWidgetPosition(p.v)}
                        style={{ accentColor: colors.accent.webb }}
                      />
                      {p.l}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor={`${fid}-widgetcolor`} className="mb-2 block" style={labelStyle}>
                  Cor primária
                </label>
                <div className="flex items-center gap-3">
                  <input
                    id={`${fid}-widgetcolor`}
                    aria-label="Cor primaria do widget (seletor)"
                    type="color"
                    value={widgetColor}
                    onChange={(e) => setWidgetColor(e.target.value)}
                    className="h-9 w-9 cursor-pointer rounded-lg border-0 p-0"
                  />
                  <input
                    aria-label="Cor primaria do widget (hex)"
                    type="text"
                    value={widgetColor}
                    onChange={(e) => setWidgetColor(e.target.value)}
                    className="rounded-lg px-3 py-2 text-sm font-mono w-28 focus:outline-none"
                    style={inputStyle}
                  />
                  <div className="h-8 w-8 rounded-lg" style={{ background: widgetColor }} />
                </div>
              </div>
              <div>
                <label className="mb-2 block" style={labelStyle} htmlFor={`${fid}-msg`}>
                  Mensagem inicial
                </label>
                <input
                  aria-label="Mensagem inicial do widget"
                  type="text"
                  value={widgetMessage}
                  onChange={(e) => setWidgetMessage(e.target.value)}
                  className={selectClass}
                  style={inputStyle}
                  placeholder="Olá! Como posso ajudar?"
                  id={`${fid}-msg`}
                />
              </div>
              <div>
                <label className="mb-2 block" style={labelStyle} htmlFor={`${fid}-quando`}>
                  Quando exibir
                </label>
                <select
                  value={widgetTrigger}
                  onChange={(e) => setWidgetTrigger(e.target.value)}
                  className={selectClass}
                  style={inputStyle}
                  id={`${fid}-quando`}
                >
                  {TRIGGER_TIMINGS.map((t) => (
                    <option key={t.v} value={t.v}>
                      {t.l}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Embed code */}
            <div
              className="mt-4 rounded-lg p-4"
              style={{
                background: colors.background.nebula,
                border: `1px solid ${colors.border.space}`,
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium" style={{ color: colors.text.moonlight }}>
                  Código do widget para integrar no seu site:
                </span>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
                  style={{
                    background: colors.background.corona,
                    color: codeCopied ? colors.state.success : colors.text.moonlight,
                  }}
                >
                  {codeCopied ? (
                    <>
                      <Check className="h-3 w-3" aria-hidden="true" /> Copiado!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" aria-hidden="true" /> Copiar
                    </>
                  )}
                </button>
              </div>
              <pre
                className="overflow-x-auto text-xs whitespace-pre-wrap"
                style={{ color: colors.accent.webb, fontFamily: typography.fontFamily.mono }}
              >
                {widgetCode}
              </pre>
            </div>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating || !form.description || !form.url}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 transition-all"
            style={{ backgroundColor: colors.accent.webb, boxShadow: 'none' }}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {creating ? 'Adicionando...' : 'Adicionar'}
          </button>
        </div>
      </div>

      {/* Table -- Cosmos styled */}
      {items.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center rounded-xl py-12"
          style={{ ...cardStyle }}
        >
          <Globe
            className="h-10 w-10 mb-3"
            style={{ color: colors.text.void }}
            aria-hidden="true"
          />
          <p className="text-sm" style={{ color: colors.text.dust }}>
            Nenhuma URL cadastrada
          </p>
        </div>
      ) : (
        <div
          className="overflow-x-auto rounded-xl"
          style={{ border: `1px solid ${colors.border.space}` }}
        >
          <table className="w-full text-left text-sm">
            <thead
              style={{
                background: colors.background.nebula,
                borderBottom: `1px solid ${colors.border.space}`,
              }}
            >
              <tr>
                {[
                  'Descrição',
                  'URL Destino',
                  'Privado',
                  'Status',
                  'Vendas',
                  'IA Aprende',
                  'Chat',
                  'Ações',
                ].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-xs font-semibold uppercase"
                    style={{ ...labelStyle, padding: '12px 16px' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((row, i) => (
                <tr
                  key={row.id}
                  style={{
                    background: i % 2 === 0 ? colors.background.space : colors.background.void,
                    borderBottom: `1px solid ${colors.border.void}`,
                  }}
                >
                  <td
                    className="px-4 py-3 text-sm font-medium"
                    style={{ color: colors.text.starlight }}
                  >
                    {row.description}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={row.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="flex items-center gap-1 text-xs truncate max-w-[200px] hover:underline"
                      style={{ color: colors.accent.webb }}
                    >
                      {row.url}{' '}
                      <ExternalLink className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="text-xs font-medium"
                      style={{ color: row.isPrivate ? colors.text.starlight : colors.text.dust }}
                    >
                      {row.isPrivate ? 'SIM' : 'NÃO'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{
                        background: row.active
                          ? `${colors.state.success}20`
                          : `${colors.state.error}20`,
                        color: row.active ? colors.state.success : colors.state.error,
                      }}
                    >
                      {row.active ? 'ATIVO' : 'INATIVO'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{
                        background: `${colors.state.success}20`,
                        color: colors.state.success,
                      }}
                    >
                      {row.salesFromUrl || 0}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {!row.aiLearning ? (
                      <span className="text-xs" style={{ color: colors.text.dust }}>
                        OFF
                      </span>
                    ) : (
                      (() => {
                        const b =
                          AI_LEARN_BADGES[row.aiLearnStatus || 'pending'] ||
                          AI_LEARN_BADGES.pending;
                        return (
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                            style={{ background: b.bg, color: b.text }}
                          >
                            {b.label}
                            {row.aiLearnStatus === 'learned' && ' \u2713'}
                          </span>
                        );
                      })()
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="text-xs font-medium"
                      style={{ color: row.chatEnabled ? colors.accent.webb : colors.text.dust }}
                    >
                      {row.chatEnabled ? 'ON' : 'OFF'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        className="rounded-full p-1.5 transition-colors"
                        style={{ background: `${colors.accent.webb}15`, color: colors.accent.webb }}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(row.id)}
                        className="rounded-full p-1.5 transition-colors"
                        style={{ background: `${colors.state.error}15`, color: colors.state.error }}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
