'use client';
import { kloelT } from '@/lib/i18n/t';
import { Save } from 'lucide-react';
import { type CSSProperties, useState, useId } from 'react';
import { CheckoutCheckbox as Checkbox } from '@/components/products/checkout/CheckoutCheckbox';
import { CheckoutRadio as Radio } from '@/components/products/checkout/CheckoutRadio';
import { CheckoutToggleRow as ToggleRow } from '@/components/products/checkout/CheckoutToggleRow';
import { PixelsSection } from '@/components/products/checkout/CheckoutPixelsSection';

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

function createInitialCheckoutConfigState(
  config: CheckoutConfigInput | null | undefined,
): CheckoutConfigState {
  const { enableBoleto: _enableBoleto, ...safeConfig } = config ?? {};
  return {
    checkoutName: '',
    enableCreditCard: false,
    enablePix: false,
    chatEnabled: false,
    chatWelcomeMessage: '',
    chatDelay: 5,
    chatPosition: 'bottom-right',
    chatColor: 'colors.ember.primary',
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
    ...safeConfig,
    enableBoleto: false,
  };
}

/* ── Design Tokens ── */

const VOID = 'var(--bg-void, colors.background.void)';
const SURFACE = 'var(--bg-space, colors.background.surface)';
const ELEVATED = 'var(--bg-nebula, colors.background.elevated)';
const BORDER = 'var(--border-space, colors.border.space)';
const TEXT = 'var(--text-starlight, colors.text.silver)';
const SECONDARY = 'var(--text-moonlight, colors.text.muted)';
const FAINT = 'var(--text-dust, colors.text.dim)';
const TEXT_ON_ACCENT = 'var(--app-text-on-accent)';
const EMBER = 'colors.ember.primary';

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

/* ── Main Component ── */

export function CheckoutConfigPage({ planId, config, onSave }: Props) {
  const fid = useId();
  const [state, setState] = useState<CheckoutConfigState>(() =>
    createInitialCheckoutConfigState(config),
  );

  const set = (key: string, value: unknown) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };
  const saveState = {
    ...state,
    enableBoleto: false,
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
              checked={false}
              onChange={() => set('enableBoleto', false)}
              label={kloelT(`Boleto indisponivel no checkout Stripe atual`)}
              disabled
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
            onClick={() => onSave(saveState)}
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
