'use client';

import { kloelT } from '@/lib/i18n/t';
import type { PublicCheckoutConfig } from '@/lib/public-checkout-contract';
import { type Dispatch, type RefObject, type SetStateAction, useId } from 'react';
import type {
  CheckoutSocialIdentitySnapshot,
  CheckoutSocialProvider,
} from '../hooks/useCheckoutSocialIdentity';
import {
  DeliveryPanel,
  IdentityPanel,
  type LeadFieldChange,
  type LeadFormState,
} from './CheckoutLeadSections.parts';
import { Ed } from './checkout-theme-shared';
import type { CheckoutVisualTheme } from './checkout-theme-tokens';

type FormState = LeadFormState;

type SharedProps = {
  theme: CheckoutVisualTheme;
  config?: PublicCheckoutConfig;
  step: number;
  setStep: Dispatch<SetStateAction<number>>;
  form: FormState;
  submitError: string;
  updateField: LeadFieldChange;
};

type IdentityColumnProps = SharedProps & {
  loadingStep: boolean;
  goStep: (target: number) => void | Promise<void>;
  socialIdentity: CheckoutSocialIdentitySnapshot | null;
  socialLoadingProvider: CheckoutSocialProvider | null;
  socialError: string;
  facebookAvailable: boolean;
  facebookSdkReady: boolean;
  triggerFacebookSignIn: () => Promise<void>;
  googleAvailable: boolean;
  googleButtonRef: RefObject<HTMLDivElement | null>;
  shippingInCents: number;
  fmtBrl: (value: number) => string;
};

/** Checkout lead sections. */
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
    facebookAvailable,
    facebookSdkReady,
    triggerFacebookSignIn,
    googleAvailable,
    googleButtonRef,
    shippingInCents,
    fmtBrl,
  } = props;
  const fid = useId();
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

  const renderIdentityHeader = () => (
    <ActiveHeader theme={theme} title={kloelT(`Identificação Rápida`)} number={1} />
  );
  const renderDeliveryHeader = () => (
    <ActiveHeader theme={theme} title={kloelT(`Entrega`)} number={2} />
  );
  const renderIdentityAction = (children: React.ReactNode, loading = false) => (
    <ActionButton theme={theme} loading={loading} onClick={() => void goStep(2)}>
      {children}
    </ActionButton>
  );
  const renderDeliveryAction = (children: React.ReactNode) => (
    <ActionButton theme={theme} onClick={() => void goStep(3)}>
      {children}
    </ActionButton>
  );

  return (
    <div className="ck-col" style={{ flex: '0 0 34%', minWidth: 280 }}>
      {step > 1 ? (
        <div style={doneCard}>
          <DoneHeader
            theme={theme}
            title={kloelT(`Identificação`)}
            number={1}
            onEdit={() => setStep(1)}
          />
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
              {kloelT(`Via`)}{' '}
              {socialIdentity.provider === 'google' ? 'Google' : socialIdentity.provider}
            </div>
          ) : null}
        </div>
      ) : (
        <div style={cardBase}>
          <IdentityPanel
            theme={theme}
            config={config}
            fid={fid}
            form={form}
            updateField={updateField}
            submitError={submitError}
            step={step}
            loadingStep={loadingStep}
            goStep={goStep}
            socialIdentity={socialIdentity}
            socialLoadingProvider={socialLoadingProvider}
            socialError={socialError}
            facebookAvailable={facebookAvailable}
            facebookSdkReady={facebookSdkReady}
            triggerFacebookSignIn={triggerFacebookSignIn}
            googleAvailable={googleAvailable}
            googleButtonRef={googleButtonRef}
            labelStyle={labelStyle}
            renderHeader={renderIdentityHeader}
            renderAction={renderIdentityAction}
          />
        </div>
      )}

      {step >= 2 ? (
        step > 2 ? (
          <div style={doneCard}>
            <DoneHeader
              theme={theme}
              title={kloelT(`Entrega`)}
              number={2}
              onEdit={() => setStep(2)}
            />
            <div style={doneText}>
              <strong style={{ color: theme.text }}>{kloelT(`Endereço para entrega:`)}</strong>
              <br />
              {form.street || 'Endereço'}, {form.number || 'S/N'} - {form.neighborhood}
              <br />
              {form.complement ? (
                <>
                  <span>
                    {kloelT(`Complemento:`)} {form.complement}
                  </span>
                  <br />
                </>
              ) : null}
              {[form.city, form.state].filter(Boolean).join(' - ')} {kloelT(`| CEP`)} {form.cep}
              <br />
              <strong style={{ display: 'block', marginTop: 8, color: theme.text }}>
                {kloelT(`Forma de entrega:`)}
              </strong>
              {shippingInCents === 0
                ? 'Frete padrão Grátis'
                : `Frete padrão ${fmtBrl(shippingInCents)}`}
            </div>
          </div>
        ) : (
          <div style={{ ...cardBase, marginTop: 20 }}>
            <DeliveryPanel
              theme={theme}
              config={config}
              fid={fid}
              form={form}
              updateField={updateField}
              submitError={submitError}
              step={step}
              goStep={goStep}
              labelStyle={labelStyle}
              renderHeader={renderDeliveryHeader}
              renderAction={renderDeliveryAction}
            />
          </div>
        )
      ) : (
        <div style={{ ...cardBase, marginTop: 20, opacity: 0.35 }}>
          <ActiveHeader theme={theme} title={kloelT(`Entrega`)} number={2} locked />
          <p style={{ fontSize: 13, color: theme.mutedText, marginTop: 4 }}>
            {kloelT(`Preencha suas informações pessoais para continuar`)}
          </p>
        </div>
      )}
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
        aria-hidden="true"
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
