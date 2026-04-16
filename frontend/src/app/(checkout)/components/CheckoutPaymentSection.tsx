'use client';

import { useId, type Dispatch, type SetStateAction } from 'react';
import type { PublicCheckoutConfig } from '@/lib/public-checkout-contract';
import { Bc, Cc, Px, ValidationInput } from './checkout-theme-shared';
import type { CheckoutVisualTheme } from './checkout-theme-tokens';

type FormState = {
  cpf: string;
  name: string;
  cardNumber: string;
  cardExp: string;
  cardCvv: string;
  cardName: string;
  cardCpf: string;
  installments: string;
};

type Props = {
  theme: CheckoutVisualTheme;
  config?: PublicCheckoutConfig;
  step: number;
  payMethod: 'card' | 'pix' | 'boleto';
  setPayMethod: Dispatch<SetStateAction<'card' | 'pix' | 'boleto'>>;
  supportsCard: boolean;
  supportsPix: boolean;
  supportsBoleto: boolean;
  form: FormState;
  updateField: (
    field: keyof FormState,
  ) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  installmentOptions: Array<{ value: number; label: string }>;
  totalWithInterest: number;
  fmtBrl: (value: number) => string;
  submitError: string;
  isSubmitting: boolean;
  finalizeOrder: () => void | Promise<void>;
};

export function CheckoutPaymentSection(props: Props) {
  const fid = useId();
  const {
    theme,
    config,
    step,
    payMethod,
    setPayMethod,
    supportsCard,
    supportsPix,
    supportsBoleto,
    form,
    updateField,
    installmentOptions,
    totalWithInterest,
    fmtBrl,
    submitError,
    isSubmitting,
    finalizeOrder,
  } = props;
  const labelStyle = {
    display: 'block',
    fontSize: 14,
    fontWeight: 500,
    color: theme.mode === 'NOIR' ? theme.mutedText : theme.text,
    marginBottom: 6,
  } satisfies React.CSSProperties;
  const activeCard = {
    background: theme.cardBackground,
    border: `1px solid ${theme.cardBorder}`,
    boxShadow: theme.cardShadow,
    borderRadius: theme.input.radius === 6 ? 6 : 12,
    padding: '24px 20px',
    animation: 'fadeIn 0.3s',
  } satisfies React.CSSProperties;

  if (step < 3) {
    return (
      <div className="ck-col" style={{ flex: '0 0 34%', minWidth: 280 }}>
        <div style={{ ...activeCard, opacity: 0.35 }}>
          <SectionHeader theme={theme} title="Pagamento" number={3} locked />
          <p style={{ fontSize: 13, color: theme.mutedText, marginTop: 4 }}>
            Preencha suas informações de entrega para continuar
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="ck-col" style={{ flex: '0 0 34%', minWidth: 280 }}>
      <div style={activeCard}>
        <SectionHeader theme={theme} title="Pagamento" number={3} />
        <p style={{ fontSize: 13, color: theme.mutedText, marginBottom: 16 }}>
          Escolha uma forma de pagamento
        </p>
        {supportsCard ? (
          <PaymentOption
            theme={theme}
            selected={payMethod === 'card'}
            icon={<Cc />}
            title="Cartão de crédito"
            onClick={() => setPayMethod('card')}
          >
            {renderCardForm(theme, labelStyle, form, updateField, installmentOptions, fid)}
          </PaymentOption>
        ) : null}
        {supportsPix ? (
          <PaymentOption
            theme={theme}
            selected={payMethod === 'pix'}
            icon={<Px />}
            title="Pix"
            onClick={() => setPayMethod('pix')}
          >
            <p style={{ fontSize: 14, color: theme.text, lineHeight: 1.6, marginBottom: 8 }}>
              A confirmação de pagamento é realizada em poucos minutos. Utilize o aplicativo do seu
              banco para pagar.
            </p>
            <div style={{ fontSize: 15, color: theme.mutedText }}>
              Valor no Pix: {fmtBrl(totalWithInterest)}
            </div>
          </PaymentOption>
        ) : null}
        {supportsBoleto ? (
          <PaymentOption
            theme={theme}
            selected={payMethod === 'boleto'}
            icon={<Bc />}
            title="Boleto"
            onClick={() => setPayMethod('boleto')}
          >
            <p style={{ fontSize: 14, color: theme.text, lineHeight: 1.6 }}>
              O boleto será gerado após a confirmação dos seus dados.
            </p>
          </PaymentOption>
        ) : null}
        {submitError && step === 3 ? (
          <div style={{ marginTop: 14, fontSize: 13, color: theme.errorText }}>{submitError}</div>
        ) : null}
        <button
          type="button"
          onClick={() => void finalizeOrder()}
          style={{
            width: '100%',
            marginTop: 20,
            padding: 16,
            background: theme.accent,
            border: 'none',
            borderRadius: theme.input.radius,
            color: theme.buttonText,
            fontSize: 18,
            fontWeight: 700,
          }}
        >
          {isSubmitting ? 'Processando...' : config?.btnFinalizeText || 'Finalizar compra'}
        </button>
      </div>
    </div>
  );
}

export function CheckoutSuccessModal({
  theme,
  show,
  orderNumber,
}: {
  theme: CheckoutVisualTheme;
  show: boolean;
  orderNumber: string;
}) {
  if (!show) return null;
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: theme.modalOverlay,
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          background: theme.modalBackground,
          borderRadius: 16,
          padding: '36px 32px',
          maxWidth: 400,
          width: '100%',
          textAlign: 'center',
          animation: 'modalIn 0.3s',
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: theme.accent,
            color: 'rgb(255, 255, 255)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
          }}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgb(255, 255, 255)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h3 style={{ fontSize: 22, fontWeight: 700, marginBottom: 10, color: theme.modalText }}>
          Pedido confirmado!
        </h3>
        <p style={{ fontSize: 14, color: theme.mutedText, lineHeight: 1.6 }}>
          Seu pedido foi realizado com sucesso.
        </p>
        <div
          style={{
            marginTop: 16,
            padding: '10px 20px',
            background: theme.successBackground,
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            color: theme.successText,
            fontFamily: 'monospace',
          }}
        >
          {orderNumber || 'Pedido confirmado'}
        </div>
      </div>
    </div>
  );
}

function renderCardForm(
  theme: CheckoutVisualTheme,
  labelStyle: React.CSSProperties,
  form: FormState,
  updateField: (
    field: keyof FormState,
  ) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void,
  installmentOptions: Array<{ value: number; label: string }>,
  fid: string,
) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Field
        theme={theme}
        label="Número do cartão"
        id={`${fid}-card-number`}
        value={form.cardNumber}
        onChange={updateField('cardNumber')}
        placeholder="1234 1234 1234 1234"
        labelStyle={labelStyle}
      />
      <div style={{ display: 'flex', gap: 12 }}>
        <Field
          theme={theme}
          label="Validade"
          id={`${fid}-card-exp`}
          value={form.cardExp}
          onChange={updateField('cardExp')}
          placeholder="MM/AA"
          labelStyle={labelStyle}
          wrapperStyle={{ flex: 1 }}
        />
        <Field
          theme={theme}
          label="CVV"
          id={`${fid}-card-cvv`}
          value={form.cardCvv}
          onChange={updateField('cardCvv')}
          placeholder="123"
          labelStyle={labelStyle}
          wrapperStyle={{ flex: '0 0 36%' }}
        />
      </div>
      <Field
        theme={theme}
        label="Nome do titular"
        id={`${fid}-card-name`}
        value={form.cardName}
        onChange={updateField('cardName')}
        placeholder="Nome completo"
        labelStyle={labelStyle}
      />
      <Field
        theme={theme}
        label="CPF do titular"
        id={`${fid}-card-cpf`}
        value={form.cardCpf}
        onChange={updateField('cardCpf')}
        placeholder="000.000.000-00"
        labelStyle={labelStyle}
      />
      <div>
        <label htmlFor={`${fid}-installments`} style={labelStyle}>
          Parcelamento
        </label>
        <select
          id={`${fid}-installments`}
          value={form.installments}
          onChange={updateField('installments')}
          style={{
            width: '100%',
            padding: '13px 16px',
            background: theme.input.background,
            border: `1px solid ${theme.input.border}`,
            borderRadius: theme.input.radius,
            fontSize: 15,
            color: theme.text,
            fontFamily: "'DM Sans', sans-serif",
            outline: 'none',
          }}
        >
          {installmentOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function PaymentOption({
  theme,
  selected,
  icon,
  title,
  onClick,
  children,
}: {
  theme: CheckoutVisualTheme;
  selected: boolean;
  icon: React.ReactNode;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        border: `1px solid ${selected ? theme.accent : theme.cardBorder}`,
        borderRadius: 12,
        padding: '16px 18px',
        marginBottom: 12,
        cursor: 'pointer',
        transition: 'border-color 0.2s',
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          (e.currentTarget as HTMLElement).click();
        }
      }}
    >
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: selected ? 14 : 0 }}
      >
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: 16,
            border: selected ? `5px solid ${theme.accent}` : `2px solid ${theme.cardBorder}`,
          }}
        />
        {icon}
        <span style={{ fontSize: 15, fontWeight: 600, color: theme.text }}>{title}</span>
      </div>
      {selected ? children : null}
    </div>
  );
}

function SectionHeader({
  theme,
  title,
  number,
  locked,
}: {
  theme: CheckoutVisualTheme;
  title: string;
  number: number;
  locked?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
      <div
        style={{
          width: 26,
          height: 26,
          borderRadius: 16,
          background: locked ? theme.step.lockedBubbleBg : theme.step.activeBubbleBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ color: theme.buttonText, fontSize: 13, fontWeight: 700 }}>{number}</span>
      </div>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: theme.text }}>{title}</h2>
    </div>
  );
}

function Field({
  theme,
  label,
  id,
  value,
  onChange,
  placeholder,
  labelStyle,
  wrapperStyle,
}: {
  theme: CheckoutVisualTheme;
  label: string;
  id: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  labelStyle: React.CSSProperties;
  wrapperStyle?: React.CSSProperties;
}) {
  return (
    <div style={wrapperStyle}>
      <label htmlFor={id} style={labelStyle}>
        {label}
      </label>
      <ValidationInput
        theme={theme.input}
        id={id}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
      />
    </div>
  );
}
