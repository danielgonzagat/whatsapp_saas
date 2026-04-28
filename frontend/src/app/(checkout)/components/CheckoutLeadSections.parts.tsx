'use client';

import { t } from '@/lib/i18n/t';
import type { PublicCheckoutConfig } from '@/lib/public-checkout-contract';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type {
  CheckoutSocialIdentitySnapshot,
  CheckoutSocialProvider,
} from '../hooks/useCheckoutSocialIdentity';
import { CheckoutSocialIdentitySection } from './CheckoutSocialIdentitySection';
import { ValidationInput } from './checkout-theme-shared';
import type { CheckoutVisualTheme } from './checkout-theme-tokens';

/** Lead form state type. */
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

/** Lead field change type. */
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

function getLeadFieldInputProps(
  id: string,
  label: string,
): Pick<React.ComponentProps<typeof ValidationInput>, 'name' | 'autoComplete' | 'inputMode'> {
  const normalized = `${id} ${label}`
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

  if (normalized.includes('email')) {
    return { name: 'email', autoComplete: 'email', inputMode: 'email' };
  }

  if (
    normalized.includes('telefone') ||
    normalized.includes('celular') ||
    normalized.includes('whatsapp')
  ) {
    return { name: 'phone', autoComplete: 'tel', inputMode: 'tel' };
  }

  if (normalized.includes('cep')) {
    return { name: 'postalCode', autoComplete: 'postal-code', inputMode: 'numeric' };
  }

  if (
    normalized.includes('endereco') ||
    normalized.includes('logradouro') ||
    normalized.includes('rua')
  ) {
    return { name: 'addressLine1', autoComplete: 'address-line1' };
  }

  if (normalized.includes('numero')) {
    return { name: 'addressLine2', autoComplete: 'address-line2' };
  }

  if (normalized.includes('bairro')) {
    return { name: 'neighborhood' };
  }

  if (normalized.includes('complemento')) {
    return { name: 'addressLine3', autoComplete: 'address-line3' };
  }

  if (normalized.includes('cidade')) {
    return { name: 'city', autoComplete: 'address-level2' };
  }

  if (normalized.includes('estado')) {
    return { name: 'state', autoComplete: 'address-level1' };
  }

  if (normalized.includes('destinatario')) {
    return { name: 'recipient' };
  }

  if (normalized.includes('cpf')) {
    return { name: 'cpf', inputMode: 'numeric' };
  }

  if (normalized.includes('nome')) {
    return { name: 'name', autoComplete: 'name' };
  }

  return { name: id.split('-').pop() || 'field' };
}

/** Lead field. */
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
  const inputProps = getLeadFieldInputProps(id, label);

  return (
    <div style={wrapperStyle}>
      <label htmlFor={id} style={labelStyle}>
        {label}
      </label>
      <ValidationInput
        theme={theme.input}
        id={id}
        {...inputProps}
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
  appleAvailable: boolean;
  facebookSdkReady: boolean;
  triggerFacebookSignIn: () => Promise<void>;
  triggerAppleSignIn: () => void;
  googleAvailable: boolean;
  googleButtonRef: RefObject<HTMLDivElement | null>;
  labelStyle: React.CSSProperties;
  renderHeader: () => React.ReactNode;
  renderAction: (children: React.ReactNode, loading?: boolean) => React.ReactNode;
}

/** Identity panel. */
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
  appleAvailable,
  facebookSdkReady,
  triggerFacebookSignIn,
  triggerAppleSignIn,
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
        appleAvailable={appleAvailable}
        facebookSdkReady={facebookSdkReady}
        googleAvailable={googleAvailable}
        googleButtonRef={googleButtonRef}
        onFacebookClick={triggerFacebookSignIn}
        onAppleClick={triggerAppleSignIn}
        socialIdentity={socialIdentity}
        loadingProvider={socialLoadingProvider}
        error={socialError}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <LeadField
          theme={theme}
          label={t(`Nome completo`)}
          id={`${fid}-name`}
          value={form.name}
          onChange={updateField('name')}
          placeholder={t(`ex.: Maria de Almeida Cruz`)}
          labelStyle={labelStyle}
        />
        <LeadField
          theme={theme}
          label={t(`E-mail`)}
          id={`${fid}-email`}
          value={form.email}
          onChange={updateField('email')}
          placeholder={t(`ex.: maria@gmail.com`)}
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
                name="phone"
                value={form.phone}
                onChange={updateField('phone')}
                placeholder={t(`(00) 00000-0000`)}
                autoComplete="tel"
                inputMode="tel"
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

/** Delivery panel. */
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
        {t(`Cadastre o endereço para envio`)}
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
          label={t(`Endereço`)}
          id={`${fid}-street`}
          value={form.street}
          onChange={updateField('street')}
          placeholder={t(`Rua, avenida...`)}
          labelStyle={labelStyle}
        />
        <div style={{ display: 'flex', gap: 12 }}>
          <LeadField
            theme={theme}
            label={t(`Número`)}
            id={`${fid}-number`}
            value={form.number}
            onChange={updateField('number')}
            placeholder={t(`Nº`)}
            labelStyle={labelStyle}
            wrapperStyle={{ flex: '0 0 35%' }}
          />
          <LeadField
            theme={theme}
            label={t(`Bairro`)}
            id={`${fid}-neighborhood`}
            value={form.neighborhood}
            onChange={updateField('neighborhood')}
            placeholder={t(`Bairro`)}
            labelStyle={labelStyle}
            wrapperStyle={{ flex: 1 }}
          />
        </div>
        <LeadField
          theme={theme}
          label={t(`Complemento (opcional)`)}
          id={`${fid}-complement`}
          value={form.complement}
          onChange={updateField('complement')}
          placeholder={t(`Apto, bloco...`)}
          labelStyle={labelStyle}
        />
        <div style={{ display: 'flex', gap: 12 }}>
          <LeadField
            theme={theme}
            label={t(`Cidade`)}
            id={`${fid}-city`}
            value={form.city}
            onChange={updateField('city')}
            placeholder={t(`Cidade`)}
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
          label={t(`Destinatário`)}
          id={`${fid}-destinatario`}
          value={form.destinatario}
          onChange={updateField('destinatario')}
          placeholder={t(`Nome do destinatário`)}
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
