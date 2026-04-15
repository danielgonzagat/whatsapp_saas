'use client';

import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { PublicCheckoutConfig } from '@/lib/public-checkout-contract';
import { Ed, ValidationInput } from './checkout-theme-shared';
import { CheckoutSocialIdentitySection } from './CheckoutSocialIdentitySection';
import type { CheckoutVisualTheme } from './checkout-theme-tokens';
import type {
  CheckoutSocialIdentitySnapshot,
  CheckoutSocialProvider,
} from '../hooks/useCheckoutSocialIdentity';

type FormState = {
  name: string;
  email: string;
  cpf: string;
  phone: string;
  cep: string;
  street: string;
  number: string;
  neighborhood: string;
  complement: string;
  city: string;
  state: string;
  destinatario: string;
};

type SharedProps = {
  theme: CheckoutVisualTheme;
  config?: PublicCheckoutConfig;
  step: number;
  setStep: Dispatch<SetStateAction<number>>;
  form: FormState;
  submitError: string;
  updateField: (
    field: keyof FormState,
  ) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
};

type IdentityColumnProps = SharedProps & {
  loadingStep: boolean;
  goStep: (target: number) => void | Promise<void>;
  socialIdentity: CheckoutSocialIdentitySnapshot | null;
  socialLoadingProvider: CheckoutSocialProvider | null;
  socialError: string;
  googleAvailable: boolean;
  googleButtonRef: RefObject<HTMLDivElement | null>;
  shippingInCents: number;
  fmtBrl: (value: number) => string;
};

export function CheckoutLeadSections(props: IdentityColumnProps) {
  const {
    theme,
    config,
    step,
    setStep,
    form,
    submitError,
    updateField,
    loadingStep,
    goStep,
    socialIdentity,
    socialLoadingProvider,
    socialError,
    googleAvailable,
    googleButtonRef,
    shippingInCents,
    fmtBrl,
  } = props;
  const labelStyle = {
    display: 'block',
    fontSize: 14,
    fontWeight: 500,
    color: theme.mode === 'NOIR' ? theme.mutedText : theme.text,
    marginBottom: 6,
  } satisfies React.CSSProperties;
  const cardBase = {
    background: theme.cardBackground,
    border: `1px solid ${theme.cardBorder}`,
    boxShadow: theme.cardShadow,
    borderRadius: theme.input.radius === 6 ? 6 : 12,
    padding: '24px 20px',
    animation: 'fadeIn 0.3s',
  } satisfies React.CSSProperties;
  const doneCard = {
    background: theme.mutedCardBackground,
    borderRadius: theme.input.radius === 6 ? 6 : 12,
    padding: 20,
    marginTop: step > 2 ? 20 : 0,
  } satisfies React.CSSProperties;
  const doneText = {
    fontSize: 13,
    color: theme.mutedText,
    lineHeight: 1.6,
  } satisfies React.CSSProperties;
  return (
    <div className="ck-col" style={{ flex: '0 0 34%', minWidth: 280 }}>
      {step > 1 ? (
        <div style={doneCard}>
          <DoneHeader theme={theme} title="Identificação" number={1} onEdit={() => setStep(1)} />
          <div style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>
            {form.name || 'Nome'}
          </div>
          <div style={doneText}>
            {form.email}
            <br />
            CPF {form.cpf}
          </div>
          {socialIdentity ? (
            <div style={{ marginTop: 8, fontSize: 11, color: theme.mutedText, fontWeight: 600 }}>
              Via {socialIdentity.provider === 'google' ? 'Google' : socialIdentity.provider}
            </div>
          ) : null}
        </div>
      ) : (
        <div style={cardBase}>
          <ActiveHeader theme={theme} title="Identificação Rápida" number={1} />
          <CheckoutSocialIdentitySection
            theme={theme}
            googleAvailable={googleAvailable}
            googleButtonRef={googleButtonRef}
            socialIdentity={socialIdentity}
            loadingProvider={socialLoadingProvider}
            error={socialError}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field
              theme={theme}
              label="Nome completo"
              id="checkout-name"
              value={form.name}
              onChange={updateField('name')}
              placeholder="ex.: Maria de Almeida Cruz"
              labelStyle={labelStyle}
            />
            <Field
              theme={theme}
              label="E-mail"
              id="checkout-email"
              value={form.email}
              onChange={updateField('email')}
              placeholder="ex.: maria@gmail.com"
              type="email"
              labelStyle={labelStyle}
            />
            <Field
              theme={theme}
              label="CPF"
              id="checkout-cpf"
              value={form.cpf}
              onChange={updateField('cpf')}
              placeholder="000.000.000-00"
              labelStyle={labelStyle}
              wrapperStyle={{ width: 'fit-content', minWidth: 220 }}
            />
            <div>
              <label htmlFor="checkout-phone" style={labelStyle}>
                {config?.phoneLabel || 'Celular / WhatsApp'}
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 14px',
                    background: theme.phonePrefixBackground,
                    border: `1px solid ${theme.phonePrefixBorder}`,
                    borderRadius: theme.input.radius,
                    fontSize: 14,
                    fontWeight: 600,
                    color: theme.phonePrefixText,
                    flexShrink: 0,
                  }}
                >
                  +55
                </div>
                <div style={{ flex: 1 }}>
                  <ValidationInput
                    theme={theme.input}
                    id="checkout-phone"
                    value={form.phone}
                    onChange={updateField('phone')}
                    placeholder="(00) 00000-0000"
                  />
                </div>
              </div>
            </div>
          </div>
          {submitError && step === 1 ? (
            <div style={{ marginTop: 14, fontSize: 13, color: theme.errorText }}>{submitError}</div>
          ) : null}
          <ActionButton theme={theme} loading={loadingStep} onClick={() => void goStep(2)}>
            {config?.btnStep1Text || 'Ir para Entrega'}
          </ActionButton>
        </div>
      )}

      {step >= 2 ? (
        step > 2 ? (
          <div style={doneCard}>
            <DoneHeader theme={theme} title="Entrega" number={2} onEdit={() => setStep(2)} />
            <div style={doneText}>
              <strong style={{ color: theme.text }}>Endereço para entrega:</strong>
              <br />
              {form.street || 'Endereço'}, {form.number || 'S/N'} - {form.neighborhood}
              <br />
              {form.complement ? (
                <>
                  <span>Complemento: {form.complement}</span>
                  <br />
                </>
              ) : null}
              {[form.city, form.state].filter(Boolean).join(' - ')} | CEP {form.cep}
              <br />
              <strong style={{ display: 'block', marginTop: 8, color: theme.text }}>
                Forma de entrega:
              </strong>
              {shippingInCents === 0
                ? 'Frete padrão Grátis'
                : `Frete padrão ${fmtBrl(shippingInCents)}`}
            </div>
          </div>
        ) : (
          <div style={{ ...cardBase, marginTop: 20 }}>
            <ActiveHeader theme={theme} title="Entrega" number={2} />
            <p style={{ fontSize: 13, color: theme.mutedText, marginBottom: 16 }}>
              Cadastre o endereço para envio
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field
                theme={theme}
                label="CEP"
                id="checkout-cep"
                value={form.cep}
                onChange={updateField('cep')}
                placeholder="00000-000"
                labelStyle={labelStyle}
                wrapperStyle={{ minWidth: 180 }}
              />
              <Field
                theme={theme}
                label="Endereço"
                id="checkout-street"
                value={form.street}
                onChange={updateField('street')}
                placeholder="Rua, avenida..."
                labelStyle={labelStyle}
              />
              <div style={{ display: 'flex', gap: 12 }}>
                <Field
                  theme={theme}
                  label="Número"
                  id="checkout-number"
                  value={form.number}
                  onChange={updateField('number')}
                  placeholder="Nº"
                  labelStyle={labelStyle}
                  wrapperStyle={{ flex: '0 0 35%' }}
                />
                <Field
                  theme={theme}
                  label="Bairro"
                  id="checkout-neighborhood"
                  value={form.neighborhood}
                  onChange={updateField('neighborhood')}
                  placeholder="Bairro"
                  labelStyle={labelStyle}
                  wrapperStyle={{ flex: 1 }}
                />
              </div>
              <Field
                theme={theme}
                label="Complemento (opcional)"
                id="checkout-complement"
                value={form.complement}
                onChange={updateField('complement')}
                placeholder="Apto, bloco..."
                labelStyle={labelStyle}
              />
              <div style={{ display: 'flex', gap: 12 }}>
                <Field
                  theme={theme}
                  label="Cidade"
                  id="checkout-city"
                  value={form.city}
                  onChange={updateField('city')}
                  placeholder="Cidade"
                  labelStyle={labelStyle}
                  wrapperStyle={{ flex: 1 }}
                />
                <Field
                  theme={theme}
                  label="UF"
                  id="checkout-state"
                  value={form.state}
                  onChange={updateField('state')}
                  placeholder="UF"
                  labelStyle={labelStyle}
                  wrapperStyle={{ flex: '0 0 28%' }}
                />
              </div>
              <Field
                theme={theme}
                label="Destinatário"
                id="checkout-destinatario"
                value={form.destinatario}
                onChange={updateField('destinatario')}
                placeholder="Nome do destinatário"
                labelStyle={labelStyle}
              />
            </div>
            {submitError && step === 2 ? (
              <div style={{ marginTop: 14, fontSize: 13, color: theme.errorText }}>
                {submitError}
              </div>
            ) : null}
            <ActionButton theme={theme} onClick={() => void goStep(3)}>
              {config?.btnStep2Text || 'Ir para Pagamento'}
            </ActionButton>
          </div>
        )
      ) : (
        <div style={{ ...cardBase, marginTop: 20, opacity: 0.35 }}>
          <ActiveHeader theme={theme} title="Entrega" number={2} locked />
          <p style={{ fontSize: 13, color: theme.mutedText, marginTop: 4 }}>
            Preencha suas informações pessoais para continuar
          </p>
        </div>
      )}
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
  type,
  disabled,
  style,
}: {
  theme: CheckoutVisualTheme;
  label: string;
  id: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  labelStyle: React.CSSProperties;
  wrapperStyle?: React.CSSProperties;
  type?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
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
        type={type}
        disabled={disabled}
        style={style}
      />
    </div>
  );
}

function ActiveHeader({
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
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

function DoneHeader({
  theme,
  title,
  number,
  onEdit,
}: {
  theme: CheckoutVisualTheme;
  title: string;
  number: number;
  onEdit: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <div
        style={{
          width: 26,
          height: 26,
          borderRadius: 16,
          background: theme.accent,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ color: theme.buttonText, fontSize: 13, fontWeight: 700 }}>{number}</span>
      </div>
      <span style={{ fontSize: 18, fontWeight: 700, color: theme.accent }}>{title}</span>
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke={theme.accent}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <button
        type="button"
        onClick={onEdit}
        style={{ marginLeft: 'auto', background: 'none', border: 'none', padding: 4 }}
      >
        <Ed stroke={theme.input.editStroke} />
      </button>
    </div>
  );
}

function ActionButton({
  theme,
  loading = false,
  onClick,
  children,
}: {
  theme: CheckoutVisualTheme;
  loading?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        marginTop: 20,
        padding: 15,
        background: theme.accent,
        border: 'none',
        borderRadius: theme.input.radius,
        color: theme.buttonText,
        fontSize: 17,
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {loading ? (
        <div
          style={{
            width: 20,
            height: 20,
            border: `2px solid ${theme.spinnerTrack}`,
            borderTopColor: theme.spinnerForeground,
            borderRadius: 16,
            animation: 'spin 0.6s linear infinite',
          }}
        />
      ) : (
        children
      )}
    </button>
  );
}
