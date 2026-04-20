'use client';

import type { PublicCheckoutConfig } from '@/lib/public-checkout-contract';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type {
  CheckoutSocialIdentitySnapshot,
  CheckoutSocialProvider,
} from '../hooks/useCheckoutSocialIdentity';
import { CheckoutSocialIdentitySection } from './CheckoutSocialIdentitySection';
import { ValidationInput } from './checkout-theme-shared';
import type { CheckoutVisualTheme } from './checkout-theme-tokens';

export type LeadFormState = {
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

export type LeadFieldChange = (
  field: keyof LeadFormState,
) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;

interface FieldProps {
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
}

export function LeadField({
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
}: FieldProps) {
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

interface IdentityPanelProps {
  theme: CheckoutVisualTheme;
  config?: PublicCheckoutConfig;
  fid: string;
  form: LeadFormState;
  updateField: LeadFieldChange;
  submitError: string;
  step: number;
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
  labelStyle: React.CSSProperties;
  renderHeader: () => React.ReactNode;
  renderAction: (children: React.ReactNode, loading?: boolean) => React.ReactNode;
}

export function IdentityPanel({
  theme,
  config,
  fid,
  form,
  updateField,
  submitError,
  step,
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
  labelStyle,
  renderHeader,
  renderAction,
}: IdentityPanelProps) {
  return (
    <>
      {renderHeader()}
      <CheckoutSocialIdentitySection
        theme={theme}
        facebookAvailable={facebookAvailable}
        facebookSdkReady={facebookSdkReady}
        googleAvailable={googleAvailable}
        googleButtonRef={googleButtonRef}
        onFacebookClick={triggerFacebookSignIn}
        socialIdentity={socialIdentity}
        loadingProvider={socialLoadingProvider}
        error={socialError}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <LeadField
          theme={theme}
          label="Nome completo"
          id={`${fid}-name`}
          value={form.name}
          onChange={updateField('name')}
          placeholder="ex.: Maria de Almeida Cruz"
          labelStyle={labelStyle}
        />
        <LeadField
          theme={theme}
          label="E-mail"
          id={`${fid}-email`}
          value={form.email}
          onChange={updateField('email')}
          placeholder="ex.: maria@gmail.com"
          type="email"
          labelStyle={labelStyle}
        />
        <LeadField
          theme={theme}
          label="CPF"
          id={`${fid}-cpf`}
          value={form.cpf}
          onChange={updateField('cpf')}
          placeholder="000.000.000-00"
          labelStyle={labelStyle}
          wrapperStyle={{ width: 'fit-content', minWidth: 220 }}
        />
        <div>
          <label htmlFor={`${fid}-phone`} style={labelStyle}>
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
                id={`${fid}-phone`}
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
      {renderAction(config?.btnStep1Text || 'Ir para Entrega', loadingStep)}
    </>
  );
}

interface DeliveryPanelProps {
  theme: CheckoutVisualTheme;
  config?: PublicCheckoutConfig;
  fid: string;
  form: LeadFormState;
  updateField: LeadFieldChange;
  submitError: string;
  step: number;
  goStep: (target: number) => void | Promise<void>;
  labelStyle: React.CSSProperties;
  renderHeader: () => React.ReactNode;
  renderAction: (children: React.ReactNode) => React.ReactNode;
}

export function DeliveryPanel({
  theme,
  config,
  fid,
  form,
  updateField,
  submitError,
  step,
  goStep,
  labelStyle,
  renderHeader,
  renderAction,
}: DeliveryPanelProps) {
  return (
    <>
      {renderHeader()}
      <p style={{ fontSize: 13, color: theme.mutedText, marginBottom: 16 }}>
        Cadastre o endereço para envio
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <LeadField
          theme={theme}
          label="CEP"
          id={`${fid}-cep`}
          value={form.cep}
          onChange={updateField('cep')}
          placeholder="00000-000"
          labelStyle={labelStyle}
          wrapperStyle={{ minWidth: 180 }}
        />
        <LeadField
          theme={theme}
          label="Endereço"
          id={`${fid}-street`}
          value={form.street}
          onChange={updateField('street')}
          placeholder="Rua, avenida..."
          labelStyle={labelStyle}
        />
        <div style={{ display: 'flex', gap: 12 }}>
          <LeadField
            theme={theme}
            label="Número"
            id={`${fid}-number`}
            value={form.number}
            onChange={updateField('number')}
            placeholder="Nº"
            labelStyle={labelStyle}
            wrapperStyle={{ flex: '0 0 35%' }}
          />
          <LeadField
            theme={theme}
            label="Bairro"
            id={`${fid}-neighborhood`}
            value={form.neighborhood}
            onChange={updateField('neighborhood')}
            placeholder="Bairro"
            labelStyle={labelStyle}
            wrapperStyle={{ flex: 1 }}
          />
        </div>
        <LeadField
          theme={theme}
          label="Complemento (opcional)"
          id={`${fid}-complement`}
          value={form.complement}
          onChange={updateField('complement')}
          placeholder="Apto, bloco..."
          labelStyle={labelStyle}
        />
        <div style={{ display: 'flex', gap: 12 }}>
          <LeadField
            theme={theme}
            label="Cidade"
            id={`${fid}-city`}
            value={form.city}
            onChange={updateField('city')}
            placeholder="Cidade"
            labelStyle={labelStyle}
            wrapperStyle={{ flex: 1 }}
          />
          <LeadField
            theme={theme}
            label="UF"
            id={`${fid}-state`}
            value={form.state}
            onChange={updateField('state')}
            placeholder="UF"
            labelStyle={labelStyle}
            wrapperStyle={{ flex: '0 0 28%' }}
          />
        </div>
        <LeadField
          theme={theme}
          label="Destinatário"
          id={`${fid}-destinatario`}
          value={form.destinatario}
          onChange={updateField('destinatario')}
          placeholder="Nome do destinatário"
          labelStyle={labelStyle}
        />
      </div>
      {submitError && step === 2 ? (
        <div style={{ marginTop: 14, fontSize: 13, color: theme.errorText }}>{submitError}</div>
      ) : null}
      {renderAction(config?.btnStep2Text || 'Ir para Pagamento')}
    </>
  );
}
