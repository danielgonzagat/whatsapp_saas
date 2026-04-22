'use client';

import { kloelT } from '@/lib/i18n/t';
import { apiFetch } from '@/lib/api';
import { useEffect, useRef, useState } from 'react';
import { mutate } from 'swr';
import {
  type AIConfig,
  type AIConfigPayload,
  buildAIConfigBody,
  mergeAIConfigPayload,
} from './ProductIATab.helpers';

const SORA = "var(--font-sora), 'Sora', sans-serif";
const V = {
  s: 'var(--bg-space, #111113)',
  e: 'var(--bg-nebula, #19191C)',
  b: 'var(--border-space, #222226)',
  em: '#E85D30',
  t: 'var(--text-starlight, #E0DDD8)',
  t2: 'var(--text-moonlight, #6E6E73)',
  t3: 'var(--text-dust, #3A3A3F)',
  ta: 'var(--app-text-on-accent, #0A0A0C)',
  g2: '#10B981',
  r: '#EF4444',
};
const is: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  background: V.e,
  border: `1px solid ${V.b}`,
  borderRadius: 6,
  color: V.t,
  fontSize: 13,
  fontFamily: SORA,
  outline: 'none',
};

const PRODUCT_IA_COPY = {
  loadError: kloelT(`Nao foi possivel carregar a configuracao da IA.`),
  idealCustomerPlaceholder: kloelT(`Mulheres 35-55 anos, preocupadas com envelhecimento...`),
  painPointsPlaceholder: kloelT(`Rugas, manchas, flacidez...`),
  promisedResultPlaceholder: kloelT(`Pele rejuvenescida em 30 dias...`),
  objectionInputAria: kloelT(`Objecao do cliente`),
  objectionInputPlaceholder: kloelT(`Objecao do cliente...`),
  objectionResponseAria: kloelT(`Resposta da IA`),
  objectionResponsePlaceholder: kloelT(`Resposta da IA...`),
  persistenceInputAria: kloelT(`Persistencia de 1 a 5`),
  messageLimitInputAria: kloelT(`Limite de mensagens`),
  saveButtonAria: kloelT(`Salvar configuracoes da IA`),
  addObjection: kloelT(`+ Adicionar objecao`),
  saveIdle: kloelT(`Salvar config da IA`),
  saveSaving: kloelT(`Salvando...`),
  saveSuccess: kloelT(`IA atualizada!`),
} as const;

const TONE_OPTIONS = [
  kloelT(`Consultivo`),
  kloelT(`Agressivo`),
  kloelT(`Amigavel`),
  kloelT(`Urgente`),
] as const;

const FOLLOW_UP_OPTIONS = [
  kloelT(`2h, 24h, 72h`),
  kloelT(`1h, 12h, 48h`),
  kloelT(`Desativado`),
] as const;

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      onClick={() => onChange(!checked)}
      role="switch"
      tabIndex={0}
      aria-checked={checked}
      aria-label={label}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 0',
        borderBottom: `1px solid ${V.b}08`,
        cursor: 'pointer',
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          (e.currentTarget as HTMLElement).click();
        }
      }}
    >
      <span style={{ fontSize: 12, color: V.t2, fontFamily: SORA }}>{label}</span>
      <div
        style={{
          width: 36,
          height: 20,
          borderRadius: 10,
          background: checked ? '#10B981' : V.b,
          position: 'relative',
          transition: 'background .2s',
        }}
      >
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: 8,
            background: '#fff',
            position: 'absolute',
            top: 2,
            left: checked ? 18 : 2,
            transition: 'left .2s',
          }}
        />
      </div>
    </div>
  );
}

/** Product ia tab. */
export function ProductIATab({ productId }: { productId: string }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (savedTimer.current) {
        clearTimeout(savedTimer.current);
      }
    },
    [],
  );
  const [config, setConfig] = useState<AIConfig>({
    objections: [],
    tone: 'Consultivo',
    persistence: 3,
    messageLimit: 10,
    followUp: '2h, 24h, 72h',
    autoCheckoutLink: true,
    offerDiscount: true,
    useUrgency: true,
  });

  useEffect(() => {
    setLoadError(null);
    apiFetch<AIConfigPayload>(`/products/${productId}/ai-config`)
      .then((res) => {
        const d = res?.data;
        if (d) {
          setConfig((prev) => mergeAIConfigPayload(prev, d));
        }
      })
      .catch(() => {
        setLoadError(PRODUCT_IA_COPY.loadError);
      })
      .finally(() => setLoading(false));
  }, [productId]);

  const update = (field: keyof AIConfig, value: AIConfig[keyof AIConfig]) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch(`/products/${productId}/ai-config`, {
        method: 'PUT',
        body: buildAIConfigBody(config),
      });
      mutate((key: unknown) => typeof key === 'string' && key.startsWith('/products'));
      setSaved(true);
      if (savedTimer.current) {
        clearTimeout(savedTimer.current);
      }
      savedTimer.current = setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error('Erro ao salvar config IA:', e);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: V.t2, fontFamily: SORA }}>
        {kloelT(`Carregando...`)}
      </div>
    );
  }

  const objections = config.objections || [];

  return (
    <div>
      {loadError ? (
        <p style={{ marginBottom: 12, color: V.r, fontSize: 12, fontFamily: SORA }}>{loadError}</p>
      ) : null}
      {/* Banner */}
      <div
        style={{
          background: `${V.em}08`,
          border: `1px solid ${V.em}15`,
          borderRadius: 6,
          padding: 14,
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width={16} height={16} viewBox="0 0 24 24" fill={V.em} aria-hidden="true">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
          <span style={{ fontSize: 13, fontWeight: 700, color: V.em, fontFamily: SORA }}>
            {kloelT(`Marketing Artificial`)}
          </span>
        </div>
        <p style={{ fontSize: 11, color: V.t2, margin: '6px 0 0', fontFamily: SORA }}>
          {kloelT(
            `Configure como a IA vende este produto via WhatsApp, Instagram, TikTok e Facebook.`,
          )}
        </p>
      </div>

      {/* Grid: Perfil + Objecoes */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ background: V.s, border: `1px solid ${V.b}`, borderRadius: 6, padding: 20 }}>
          <h3
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: V.t,
              margin: '0 0 16px',
              fontFamily: SORA,
            }}
          >
            {kloelT(`Perfil do cliente ideal`)}
          </h3>
          <div style={{ marginBottom: 14 }}>
            <span
              style={{
                display: 'block',
                fontSize: 10,
                fontWeight: 600,
                color: V.t3,
                letterSpacing: '.08em',
                textTransform: 'uppercase' as const,
                marginBottom: 6,
                fontFamily: SORA,
              }}
            >
              {kloelT(`Quem compra?`)}
            </span>
            <textarea
              value={config.idealCustomer || ''}
              onChange={(e) => update('idealCustomer', e.target.value)}
              style={{ ...is, height: 70, resize: 'vertical' as const }}
              placeholder={PRODUCT_IA_COPY.idealCustomerPlaceholder}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <span
              style={{
                display: 'block',
                fontSize: 10,
                fontWeight: 600,
                color: V.t3,
                letterSpacing: '.08em',
                textTransform: 'uppercase' as const,
                marginBottom: 6,
                fontFamily: SORA,
              }}
            >
              {kloelT(`Principais dores`)}
            </span>
            <textarea
              value={config.painPoints || ''}
              onChange={(e) => update('painPoints', e.target.value)}
              style={{ ...is, height: 60, resize: 'vertical' as const }}
              placeholder={PRODUCT_IA_COPY.painPointsPlaceholder}
            />
          </div>
          <div>
            <span
              style={{
                display: 'block',
                fontSize: 10,
                fontWeight: 600,
                color: V.t3,
                letterSpacing: '.08em',
                textTransform: 'uppercase' as const,
                marginBottom: 6,
                fontFamily: SORA,
              }}
            >
              {kloelT(`Resultado prometido`)}
            </span>
            <textarea
              value={config.promisedResult || ''}
              onChange={(e) => update('promisedResult', e.target.value)}
              style={{ ...is, height: 60, resize: 'vertical' as const }}
              placeholder={PRODUCT_IA_COPY.promisedResultPlaceholder}
            />
          </div>
        </div>

        <div style={{ background: V.s, border: `1px solid ${V.b}`, borderRadius: 6, padding: 20 }}>
          <h3
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: V.t,
              margin: '0 0 16px',
              fontFamily: SORA,
            }}
          >
            {kloelT(`Objecoes e respostas`)}
          </h3>
          {objections.length === 0 && (
            <p style={{ fontSize: 12, color: V.t3, fontFamily: SORA, padding: '16px 0' }}>
              {kloelT(
                `Nenhuma objecao cadastrada. Adicione objecoes comuns e como a IA deve responder.`,
              )}
            </p>
          )}
          {objections.map((o, i) => (
            <div
              key={`objection-${o.q.trim()}-${o.a.trim()}`}
              style={{
                padding: '8px 0',
                borderBottom: i < objections.length - 1 ? `1px solid ${V.b}` : 'none',
              }}
            >
              <input
                aria-label={PRODUCT_IA_COPY.objectionInputAria}
                value={o.q}
                onChange={(e) => {
                  const next = [...objections];
                  next[i] = { ...next[i], q: e.target.value };
                  update('objections', next);
                }}
                style={{ ...is, marginBottom: 4 }}
                placeholder={PRODUCT_IA_COPY.objectionInputPlaceholder}
              />
              <input
                aria-label={PRODUCT_IA_COPY.objectionResponseAria}
                value={o.a}
                onChange={(e) => {
                  const next = [...objections];
                  next[i] = { ...next[i], a: e.target.value };
                  update('objections', next);
                }}
                style={is}
                placeholder={PRODUCT_IA_COPY.objectionResponsePlaceholder}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() => update('objections', [...objections, { q: '', a: '' }])}
            style={{
              width: '100%',
              marginTop: 10,
              padding: '8px 16px',
              background: 'none',
              border: `1px solid ${V.b}`,
              borderRadius: 6,
              color: V.t2,
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: SORA,
            }}
          >
            {PRODUCT_IA_COPY.addObjection}
          </button>
        </div>
      </div>

      {/* Comportamento */}
      <div
        style={{
          background: V.s,
          border: `1px solid ${V.b}`,
          borderRadius: 6,
          padding: 20,
          marginTop: 16,
        }}
      >
        <h3
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: V.t,
            margin: '0 0 16px',
            fontFamily: SORA,
          }}
        >
          {kloelT(`Comportamento`)}
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '0 16px' }}>
          <div style={{ flex: '1 1 45%', marginBottom: 14 }}>
            <span
              style={{
                display: 'block',
                fontSize: 10,
                fontWeight: 600,
                color: V.t3,
                letterSpacing: '.08em',
                textTransform: 'uppercase' as const,
                marginBottom: 6,
                fontFamily: SORA,
              }}
            >
              {kloelT(`Tom`)}
            </span>
            <select
              value={config.tone || 'Consultivo'}
              onChange={(e) => update('tone', e.target.value)}
              style={is}
            >
              {TONE_OPTIONS.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: '1 1 45%', marginBottom: 14 }}>
            <span
              style={{
                display: 'block',
                fontSize: 10,
                fontWeight: 600,
                color: V.t3,
                letterSpacing: '.08em',
                textTransform: 'uppercase' as const,
                marginBottom: 6,
                fontFamily: SORA,
              }}
            >
              {kloelT(`Persistencia (1-5)`)}
            </span>
            <input
              aria-label={PRODUCT_IA_COPY.persistenceInputAria}
              value={config.persistence ?? 3}
              onChange={(e) => update('persistence', Number(e.target.value))}
              style={is}
            />
          </div>
          <div style={{ flex: '1 1 45%', marginBottom: 14 }}>
            <span
              style={{
                display: 'block',
                fontSize: 10,
                fontWeight: 600,
                color: V.t3,
                letterSpacing: '.08em',
                textTransform: 'uppercase' as const,
                marginBottom: 6,
                fontFamily: SORA,
              }}
            >
              {kloelT(`Limite mensagens`)}
            </span>
            <input
              aria-label={PRODUCT_IA_COPY.messageLimitInputAria}
              value={config.messageLimit ?? 10}
              onChange={(e) => update('messageLimit', Number(e.target.value))}
              style={is}
            />
          </div>
          <div style={{ flex: '1 1 45%', marginBottom: 14 }}>
            <span
              style={{
                display: 'block',
                fontSize: 10,
                fontWeight: 600,
                color: V.t3,
                letterSpacing: '.08em',
                textTransform: 'uppercase' as const,
                marginBottom: 6,
                fontFamily: SORA,
              }}
            >
              {kloelT(`Follow-up`)}
            </span>
            <select
              value={config.followUp || '2h, 24h, 72h'}
              onChange={(e) => update('followUp', e.target.value)}
              style={is}
            >
              {FOLLOW_UP_OPTIONS.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </div>
        </div>
        <Toggle
          label={kloelT(`Enviar link checkout automaticamente`)}
          checked={config.autoCheckoutLink ?? true}
          onChange={(v) => update('autoCheckoutLink', v)}
        />
        <Toggle
          label={kloelT(`Oferecer desconto se detectar resistencia`)}
          checked={config.offerDiscount ?? true}
          onChange={(v) => update('offerDiscount', v)}
        />
        <Toggle
          label={kloelT(`Usar urgencia/escassez`)}
          checked={config.useUrgency ?? true}
          onChange={(v) => update('useUrgency', v)}
        />
      </div>

      <button
        type="button"
        onClick={save}
        disabled={saving}
        aria-label={PRODUCT_IA_COPY.saveButtonAria}
        style={{
          width: '100%',
          marginTop: 16,
          padding: '14px',
          background: saving ? V.b : V.em,
          border: 'none',
          borderRadius: 6,
          color: V.ta,
          fontSize: 14,
          fontWeight: 700,
          cursor: saving ? 'not-allowed' : 'pointer',
          fontFamily: SORA,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
        {saved
          ? PRODUCT_IA_COPY.saveSuccess
          : saving
            ? PRODUCT_IA_COPY.saveSaving
            : PRODUCT_IA_COPY.saveIdle}
      </button>
    </div>
  );
}
