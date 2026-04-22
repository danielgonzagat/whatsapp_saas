'use client';
import { kloelT } from '@/lib/i18n/t';
import { apiFetch } from '@/lib/api';
import { Save } from 'lucide-react';
import { type CSSProperties, useCallback, useEffect, useState, useId } from 'react';
import { mutate } from 'swr';

interface CheckoutConfigState {
  checkoutName: string;
  enableBoleto: boolean;
  enableCreditCard: boolean;
  enablePix: boolean;
  chatEnabled: boolean;
  chatWelcomeMessage: string;
  chatDelay: number;
  chatPosition: string;
  chatColor: string;
  chatOfferDiscount: boolean;
  chatDiscountCode: string;
  chatSupportPhone: string;
  enableCoupon: boolean;
  enableTimer: boolean;
  timerMinutes: number;
  timerMessage: string;
  socialProofEnabled: boolean;
  socialProofCustomNames: string;
  enableSteps: boolean;
  [key: string]: unknown;
}

interface CheckoutConfigInput extends Partial<CheckoutConfigState> {
  id?: string;
}

interface Props {
  planId: string;
  config: CheckoutConfigInput | null | undefined;
  onSave: (data: CheckoutConfigState) => void;
}

/* ── Design Tokens ── */

const VOID = 'var(--bg-void, #0A0A0C)';
const SURFACE = 'var(--bg-space, #111113)';
const ELEVATED = 'var(--bg-nebula, #19191C)';
const BORDER = 'var(--border-space, #222226)';
const TEXT = 'var(--text-starlight, #E0DDD8)';
const SECONDARY = 'var(--text-moonlight, #6E6E73)';
const FAINT = 'var(--text-dust, #3A3A3F)';
const TEXT_ON_ACCENT = 'var(--app-text-on-accent, #FFFFFF)';
const EMBER = '#E85D30';
const GREEN = '#10B981';

/* ── Shared Styles ── */

const sectionTitleStyle: CSSProperties = {
  fontFamily: "'Sora', sans-serif",
  fontSize: 14,
  fontWeight: 600,
  color: TEXT,
  marginBottom: 16,
  marginTop: 0,
};

const labelStyle: CSSProperties = {
  fontFamily: "'Sora', sans-serif",
  fontSize: 10,
  fontWeight: 600,
  color: SECONDARY,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  marginBottom: 6,
  display: 'block',
};

const inputStyle: CSSProperties = {
  backgroundColor: SURFACE,
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  padding: '10px 14px',
  color: TEXT,
  fontSize: 13,
  fontFamily: "'Sora', sans-serif",
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 80,
  resize: 'vertical',
  lineHeight: 1.5,
};

const dividerStyle: CSSProperties = {
  height: 1,
  backgroundColor: BORDER,
  border: 'none',
  margin: '28px 0',
};

/* ── Toggle Component ── */

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        backgroundColor: checked ? GREEN : BORDER,
        border: 'none',
        cursor: 'pointer',
        position: 'relative',
        padding: 0,
        flexShrink: 0,
        transition: 'background-color 0.2s ease',
      }}
    >
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          backgroundColor: TEXT_ON_ACCENT,
          position: 'absolute',
          top: 2,
          left: checked ? 18 : 2,
          transition: 'left 0.2s ease',
        }}
      />
    </button>
  );
}

/* ── Checkbox Component ── */

function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        cursor: 'pointer',
        fontFamily: "'Sora', sans-serif",
        fontSize: 13,
        color: TEXT,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onChange(!checked)}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
      />
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: 4,
          border: `1px solid ${checked ? EMBER : BORDER}`,
          backgroundColor: checked ? EMBER : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'all 0.15s ease',
        }}
        aria-hidden="true"
      >
        {checked && (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke={TEXT_ON_ACCENT}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </div>
      {label}
    </label>
  );
}

/* ── Radio Component ── */

function Radio({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        cursor: 'pointer',
        fontFamily: "'Sora', sans-serif",
        fontSize: 13,
        color: TEXT,
      }}
    >
      <input
        type="radio"
        checked={checked}
        onChange={() => onChange()}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
      />
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          border: `2px solid ${checked ? EMBER : BORDER}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
        aria-hidden="true"
      >
        {checked && (
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: EMBER,
            }}
          />
        )}
      </div>
      {label}
    </label>
  );
}

/* ── Toggle Row ── */

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 13, color: TEXT }}>{label}</span>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

/* ── Pixels Section ── */

const PIXEL_TYPES = ['META', 'GOOGLE_ADS', 'TIKTOK', 'TABOOLA', 'OUTBRAIN', 'CUSTOM'] as const;

interface Pixel {
  id: string;
  type: string;
  pixelId: string;
  accessToken?: string;
}

function PixelsSection({ configId, planId }: { configId: string | null; planId: string }) {
  const fid = useId();
  const [pixels, setPixels] = useState<Pixel[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ type: 'META', pixelId: '', accessToken: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ type: 'META', pixelId: '', accessToken: '' });

  const loadPixels = useCallback(async () => {
    if (!planId) {
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch(`/checkout/plans/${planId}/config`);
      const data = res.data as { pixels?: Pixel[] } | undefined;
      setPixels(Array.isArray(data?.pixels) ? data.pixels : []);
    } catch {
      setPixels([]);
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    loadPixels();
  }, [loadPixels]);

  const handleCreate = async () => {
    if (!configId || !form.pixelId.trim()) {
      setError('Informe o ID do pixel');
      return;
    }
    setSaving(true);
    setError('');
    const res = await apiFetch(`/checkout/config/${configId}/pixels`, {
      method: 'POST',
      body: form,
    });
    if (res.error) {
      setError(res.error);
    } else {
      setShowAdd(false);
      setForm({ type: 'META', pixelId: '', accessToken: '' });
      mutate((key: unknown) => typeof key === 'string' && key.startsWith('/checkout'));
      await loadPixels();
    }
    setSaving(false);
  };

  const handleUpdate = async (id: string) => {
    setSaving(true);
    setError('');
    const res = await apiFetch(`/checkout/pixels/${id}`, { method: 'PUT', body: editForm });
    if (res.error) {
      setError(res.error);
    } else {
      setEditId(null);
      await loadPixels();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    await apiFetch(`/checkout/pixels/${id}`, { method: 'DELETE' });
    await loadPixels();
  };

  if (!configId) {
    return (
      <p style={{ fontFamily: "'Sora', sans-serif", fontSize: 12, color: SECONDARY }}>
        {kloelT(`Salve o plano primeiro para configurar pixels.`)}
      </p>
    );
  }

  return (
    <div>
      {loading && (
        <p style={{ fontFamily: "'Sora', sans-serif", fontSize: 12, color: SECONDARY }}>
          {kloelT(`Carregando pixels...`)}
        </p>
      )}
      {pixels.map((px) => (
        <div
          key={px.id}
          style={{
            background: SURFACE,
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            padding: '10px 14px',
            marginBottom: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          {editId === px.id ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <select
                value={editForm.type}
                onChange={(e) => setEditForm((f) => ({ ...f, type: e.target.value }))}
                style={{ ...inputStyle, padding: '6px 10px' }}
              >
                {PIXEL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <input
                aria-label="ID do pixel"
                value={editForm.pixelId}
                onChange={(e) => setEditForm((f) => ({ ...f, pixelId: e.target.value }))}
                placeholder={kloelT(`ID do pixel`)}
                style={inputStyle}
              />
              <input
                aria-label="Access Token"
                value={editForm.accessToken || ''}
                onChange={(e) => setEditForm((f) => ({ ...f, accessToken: e.target.value }))}
                placeholder={kloelT(`Access Token (opcional)`)}
                style={inputStyle}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => handleUpdate(px.id)}
                  disabled={saving}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    background: EMBER,
                    border: 'none',
                    borderRadius: 6,
                    color: TEXT_ON_ACCENT,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: "'Sora', sans-serif",
                  }}
                >
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditId(null)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    background: 'none',
                    border: `1px solid ${BORDER}`,
                    borderRadius: 6,
                    color: SECONDARY,
                    fontSize: 12,
                    cursor: 'pointer',
                    fontFamily: "'Sora', sans-serif",
                  }}
                >
                  {kloelT(`Cancelar`)}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ flex: 1 }}>
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 10,
                    fontWeight: 600,
                    color: EMBER,
                    background: `${EMBER}12`,
                    padding: '2px 6px',
                    borderRadius: 4,
                    textTransform: 'uppercase',
                    marginRight: 8,
                  }}
                >
                  {px.type}
                </span>
                <span
                  style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: TEXT }}
                >
                  {px.pixelId}
                </span>
                {px.accessToken && (
                  <span style={{ fontSize: 10, color: SECONDARY, marginLeft: 8 }}>
                    {kloelT(`Token: ****`)}
                    {px.accessToken.slice(-4)}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditId(px.id);
                  setEditForm({
                    type: px.type,
                    pixelId: px.pixelId,
                    accessToken: px.accessToken || '',
                  });
                }}
                style={{
                  background: 'none',
                  border: `1px solid ${BORDER}`,
                  borderRadius: 6,
                  color: SECONDARY,
                  fontSize: 11,
                  padding: '4px 10px',
                  cursor: 'pointer',
                  fontFamily: "'Sora', sans-serif",
                }}
              >
                {kloelT(`Editar`)}
              </button>
              <button
                type="button"
                onClick={() => handleDelete(px.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: FAINT,
                  fontSize: 11,
                  padding: 4,
                  cursor: 'pointer',
                }}
              >
                {kloelT(`Remover`)}
              </button>
            </>
          )}
        </div>
      ))}
      {pixels.length === 0 && !loading && (
        <p
          style={{ fontFamily: "'Sora', sans-serif", fontSize: 12, color: FAINT, marginBottom: 12 }}
        >
          {kloelT(`Nenhum pixel configurado.`)}
        </p>
      )}
      {showAdd ? (
        <div
          style={{
            background: SURFACE,
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            padding: 16,
            marginTop: 8,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={labelStyle} htmlFor={`${fid}-pixel-type`}>
                {kloelT(`Tipo de pixel`)}
              </label>
              <select
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                style={{ ...inputStyle, padding: '10px 14px' }}
                id={`${fid}-pixel-type`}
              >
                {PIXEL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle} htmlFor={`${fid}-pixel-id`}>
                {kloelT(`ID do Pixel`)}
              </label>
              <input
                aria-label="ID do Pixel"
                value={form.pixelId}
                onChange={(e) => setForm((f) => ({ ...f, pixelId: e.target.value }))}
                placeholder={kloelT(`Ex: 1234567890`)}
                style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace" }}
                id={`${fid}-pixel-id`}
              />
            </div>
            <div>
              <label style={labelStyle} htmlFor={`${fid}-access-token`}>
                {kloelT(`Access Token (opcional — Meta)`)}
              </label>
              <input
                aria-label="Access Token Meta"
                value={form.accessToken}
                onChange={(e) => setForm((f) => ({ ...f, accessToken: e.target.value }))}
                placeholder={kloelT(`EAAG...`)}
                style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace" }}
                id={`${fid}-access-token`}
              />
            </div>
            {error && (
              <p
                style={{
                  fontFamily: "'Sora', sans-serif",
                  fontSize: 12,
                  color: '#EF4444',
                  margin: 0,
                }}
              >
                {error}
              </p>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={handleCreate}
                disabled={saving}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: saving ? ELEVATED : EMBER,
                  border: 'none',
                  borderRadius: 6,
                  color: saving ? SECONDARY : TEXT_ON_ACCENT,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: saving ? 'default' : 'pointer',
                  fontFamily: "'Sora', sans-serif",
                }}
              >
                {saving ? 'Adicionando...' : 'Adicionar pixel'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAdd(false);
                  setError('');
                }}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: 'none',
                  border: `1px solid ${BORDER}`,
                  borderRadius: 6,
                  color: SECONDARY,
                  fontSize: 12,
                  cursor: 'pointer',
                  fontFamily: "'Sora', sans-serif",
                }}
              >
                {kloelT(`Cancelar`)}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          style={{
            padding: '8px 16px',
            background: 'none',
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            color: EMBER,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: "'Sora', sans-serif",
          }}
        >
          {kloelT(`+ Adicionar pixel`)}
        </button>
      )}
    </div>
  );
}

/* ── Main Component ── */

export function CheckoutConfigPage({ planId, config, onSave }: Props) {
  const fid = useId();
  const [state, setState] = useState<CheckoutConfigState>({
    checkoutName: '',
    enableBoleto: false,
    enableCreditCard: false,
    enablePix: false,
    chatEnabled: false,
    chatWelcomeMessage: '',
    chatDelay: 5,
    chatPosition: 'bottom-right',
    chatColor: '#E85D30',
    chatOfferDiscount: false,
    chatDiscountCode: '',
    chatSupportPhone: '',
    enableCoupon: false,
    enableTimer: false,
    timerMinutes: 10,
    timerMessage: '',
    socialProofEnabled: false,
    socialProofCustomNames: '',
    enableSteps: false,
  });

  useEffect(() => {
    if (config) {
      setState((prev) => ({ ...prev, ...config }));
    }
  }, [config]);

  const set = (key: string, value: unknown) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div
      style={{
        backgroundColor: VOID,
        minHeight: '100vh',
        padding: '32px 0',
        fontFamily: "'Sora', sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 640,
          margin: '0 auto',
          padding: '0 24px',
        }}
      >
        {/* Page header */}
        <div style={{ marginBottom: 32 }}>
          <h1
            style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: 20,
              fontWeight: 700,
              color: TEXT,
              margin: 0,
              marginBottom: 6,
            }}
          >
            {kloelT(`Configurar Checkout`)}
          </h1>
          <p
            style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: 13,
              color: SECONDARY,
              margin: 0,
            }}
          >
            {kloelT(`Plano ID:`)}{' '}
            <span style={{ fontFamily: "'JetBrains Mono', monospace", color: FAINT }}>
              {planId}
            </span>
          </p>
        </div>

        {/* Content card */}
        <div
          style={{
            backgroundColor: ELEVATED,
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            padding: 28,
          }}
        >
          {/* ── Section 1: Descricao ── */}
          <h3 style={sectionTitleStyle}>{kloelT(`Descricao`)}</h3>
          <div>
            <label style={labelStyle} htmlFor={`${fid}-checkout-name`}>
              {kloelT(`Nome do checkout`)}
            </label>
            <input
              aria-label="Nome do checkout"
              type="text"
              value={state.checkoutName}
              onChange={(e) => set('checkoutName', e.target.value)}
              placeholder={kloelT(`Ex: Checkout principal`)}
              style={inputStyle}
              id={`${fid}-checkout-name`}
            />
          </div>

          <hr style={dividerStyle} />

          {/* ── Section 2: Pagamento ── */}
          <h3 style={sectionTitleStyle}>{kloelT(`Pagamento`)}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Checkbox
              checked={state.enableBoleto}
              onChange={(v) => set('enableBoleto', v)}
              label={kloelT(`Boleto`)}
            />
            <Checkbox
              checked={state.enableCreditCard}
              onChange={(v) => set('enableCreditCard', v)}
              label={kloelT(`Cartao`)}
            />
            <Checkbox
              checked={state.enablePix}
              onChange={(v) => set('enablePix', v)}
              label={kloelT(`Pix`)}
            />
          </div>

          <hr style={dividerStyle} />

          {/* ── Section 3: Chat Kloel ── */}
          <h3 style={sectionTitleStyle}>{kloelT(`Chat Kloel`)}</h3>
          <ToggleRow
            label={kloelT(`Ativar chat no checkout`)}
            checked={state.chatEnabled}
            onChange={(v) => set('chatEnabled', v)}
          />

          {state.chatEnabled && (
            <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <label style={labelStyle} htmlFor={`${fid}-welcome`}>
                  {kloelT(`Mensagem de boas-vindas`)}
                </label>
                <input
                  type="text"
                  value={state.chatWelcomeMessage}
                  onChange={(e) => set('chatWelcomeMessage', e.target.value)}
                  placeholder={kloelT(`Ola! Posso te ajudar?`)}
                  style={inputStyle}
                  id={`${fid}-welcome`}
                />
              </div>

              <div>
                <label style={labelStyle} htmlFor={`${fid}-delay`}>
                  {kloelT(`Delay (segundos)`)}
                </label>
                <input
                  aria-label="Delay em segundos"
                  type="number"
                  value={state.chatDelay}
                  onChange={(e) => set('chatDelay', Number(e.target.value))}
                  min={0}
                  style={{ ...inputStyle, maxWidth: 120 }}
                  id={`${fid}-delay`}
                />
              </div>

              <div>
                <span style={labelStyle}>{kloelT(`Posicao do chat`)}</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
                  <Radio
                    checked={state.chatPosition === 'bottom-right'}
                    onChange={() => set('chatPosition', 'bottom-right')}
                    label={kloelT(`Canto inferior direito`)}
                  />
                  <Radio
                    checked={state.chatPosition === 'bottom-left'}
                    onChange={() => set('chatPosition', 'bottom-left')}
                    label={kloelT(`Canto inferior esquerdo`)}
                  />
                </div>
              </div>

              <div>
                <label htmlFor={`${fid}-chatcolor`} style={labelStyle}>
                  {kloelT(`Cor do chat`)}
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <input
                    id={`${fid}-chatcolor`}
                    type="color"
                    value={state.chatColor}
                    onChange={(e) => set('chatColor', e.target.value)}
                    style={{
                      width: 36,
                      height: 36,
                      border: `1px solid ${BORDER}`,
                      borderRadius: 6,
                      backgroundColor: 'transparent',
                      cursor: 'pointer',
                      padding: 2,
                    }}
                  />
                  <input
                    aria-label="Cor do chat"
                    type="text"
                    value={state.chatColor}
                    onChange={(e) => set('chatColor', e.target.value)}
                    style={{
                      ...inputStyle,
                      maxWidth: 120,
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 12,
                    }}
                  />
                </div>
              </div>

              <ToggleRow
                label={kloelT(`Oferecer desconto via chat`)}
                checked={state.chatOfferDiscount}
                onChange={(v) => set('chatOfferDiscount', v)}
              />

              {state.chatOfferDiscount && (
                <div>
                  <label style={labelStyle} htmlFor={`${fid}-discount-code`}>
                    {kloelT(`Codigo do desconto`)}
                  </label>
                  <input
                    type="text"
                    value={state.chatDiscountCode}
                    onChange={(e) => set('chatDiscountCode', e.target.value)}
                    placeholder={kloelT(`Ex: BEMVINDO10`)}
                    style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace" }}
                    id={`${fid}-discount-code`}
                  />
                </div>
              )}

              <div>
                <label style={labelStyle} htmlFor={`${fid}-phone`}>
                  {kloelT(`Telefone de suporte`)}
                </label>
                <input
                  aria-label="Telefone de suporte"
                  type="text"
                  value={state.chatSupportPhone}
                  onChange={(e) => set('chatSupportPhone', e.target.value)}
                  placeholder={kloelT(`+55 11 99999-9999`)}
                  style={inputStyle}
                  id={`${fid}-phone`}
                />
              </div>
            </div>
          )}

          <hr style={dividerStyle} />

          {/* ── Section 4: Cupom ── */}
          <h3 style={sectionTitleStyle}>{kloelT(`Cupom`)}</h3>
          <ToggleRow
            label={kloelT(`Permitir cupom de desconto`)}
            checked={state.enableCoupon}
            onChange={(v) => set('enableCoupon', v)}
          />

          <hr style={dividerStyle} />

          {/* ── Section 5: Timer ── */}
          <h3 style={sectionTitleStyle}>{kloelT(`Timer`)}</h3>
          <ToggleRow
            label={kloelT(`Ativar timer de urgencia`)}
            checked={state.enableTimer}
            onChange={(v) => set('enableTimer', v)}
          />

          {state.enableTimer && (
            <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <label style={labelStyle} htmlFor={`${fid}-minutes`}>
                  {kloelT(`Minutos`)}
                </label>
                <input
                  type="number"
                  value={state.timerMinutes}
                  onChange={(e) => set('timerMinutes', Number(e.target.value))}
                  min={1}
                  style={{ ...inputStyle, maxWidth: 120 }}
                  id={`${fid}-minutes`}
                />
              </div>
              <div>
                <label style={labelStyle} htmlFor={`${fid}-timer-msg`}>
                  {kloelT(`Mensagem do timer`)}
                </label>
                <input
                  aria-label={kloelT(`Mensagem do timer`)}
                  type="text"
                  value={state.timerMessage}
                  onChange={(e) => set('timerMessage', e.target.value)}
                  placeholder={kloelT(`Oferta encerra em 15 minutos.`)}
                  style={inputStyle}
                  id={`${fid}-timer-msg`}
                />
              </div>
            </div>
          )}

          <hr style={dividerStyle} />

          {/* ── Section 6: Social Proof ── */}
          <h3 style={sectionTitleStyle}>{kloelT(`Social Proof`)}</h3>
          <ToggleRow
            label={kloelT(`Ativar prova social`)}
            checked={state.socialProofEnabled}
            onChange={(v) => set('socialProofEnabled', v)}
          />

          {state.socialProofEnabled && (
            <div style={{ marginTop: 20 }}>
              <label style={labelStyle} htmlFor={`${fid}-custom-names`}>
                {kloelT(`Nomes personalizados (um por linha)`)}
              </label>
              <textarea
                value={state.socialProofCustomNames}
                onChange={(e) => set('socialProofCustomNames', e.target.value)}
                placeholder={kloelT(`Maria S. de Sao Paulo\nJoao P. de Curitiba\nAna L. de Recife`)}
                style={textareaStyle}
                id={`${fid}-custom-names`}
              />
            </div>
          )}

          <hr style={dividerStyle} />

          {/* ── Section 7: Etapas ── */}
          <h3 style={sectionTitleStyle}>{kloelT(`Etapas`)}</h3>
          <ToggleRow
            label={kloelT(`Exibir etapas no checkout`)}
            checked={state.enableSteps}
            onChange={(v) => set('enableSteps', v)}
          />

          <hr style={dividerStyle} />

          {/* ── Section 8: Pixels ── */}
          <h3 style={sectionTitleStyle}>{kloelT(`Pixels de Rastreamento`)}</h3>
          <PixelsSection configId={config?.id || null} planId={planId} />

          <hr style={dividerStyle} />

          {/* ── Save Button ── */}
          <button
            type="button"
            onClick={() => onSave(state)}
            style={{
              width: '100%',
              backgroundColor: EMBER,
              color: TEXT_ON_ACCENT,
              border: 'none',
              borderRadius: 6,
              padding: '14px 24px',
              fontFamily: "'Sora', sans-serif",
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'opacity 0.15s ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.opacity = '0.9';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.opacity = '1';
            }}
          >
            <Save size={16} aria-hidden="true" />

            {kloelT(`Salvar configuracoes`)}
          </button>
        </div>
      </div>
    </div>
  );
}
