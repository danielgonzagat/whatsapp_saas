'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import Link from 'next/link';
import { OnboardingRolePicker } from './OnboardingRolePicker';
import { OnboardingProductConfig } from './OnboardingProductConfig';

interface OnboardingFormProps {
  selected: string | null;
  onSelect: (id: string) => void;
  productType: string;
  onProductTypeChange: (id: string) => void;
  primaryChannel: string;
  onPrimaryChannelChange: (id: string) => void;
  hasProduct: boolean;
  onHasProductChange: (value: boolean) => void;
  hasCheckout: boolean;
  onHasCheckoutChange: (value: boolean) => void;
  aiUseCase: string;
  onAiUseCaseChange: (id: string) => void;
  loading: boolean;
  error: string;
  onContinue: () => void;
}

export function OnboardingForm({
  selected,
  onSelect,
  productType,
  onProductTypeChange,
  primaryChannel,
  onPrimaryChannelChange,
  hasProduct,
  onHasProductChange,
  hasCheckout,
  onHasCheckoutChange,
  aiUseCase,
  onAiUseCaseChange,
  loading,
  error,
  onContinue,
}: OnboardingFormProps) {
  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '48px 32px',
      }}
      className="lg:w-1/2 lg:px-16"
    >
      <div style={{ maxWidth: 420, margin: '0 auto', width: '100%' }}>
        <span
          style={{
            display: 'block',
            marginBottom: 48,
            fontFamily: "'Sora', sans-serif",
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: '0.12em',
            color: colors.text.silver,
          }}
        >
          {kloelT('KLOEL')}
        </span>

        <h1
          style={{
            fontFamily: "'Sora', sans-serif",
            fontSize: 28,
            fontWeight: 600,
            color: colors.text.silver,
            letterSpacing: '0.02em',
            marginBottom: 8,
          }}
        >
          {kloelT(`Antes de tudo...`)}
        </h1>
        <p
          style={{
            fontFamily: "'Sora', sans-serif",
            fontSize: 15,
            color: colors.text.muted,
            marginBottom: 32,
            maxWidth: 360,
          }}
        >
          {kloelT(`Queremos te conhecer melhor para personalizar sua experiência com o Kloel.`)}
        </p>

        <OnboardingRolePicker selected={selected} onSelect={onSelect} />

        <OnboardingProductConfig
          productType={productType}
          onProductTypeChange={onProductTypeChange}
          primaryChannel={primaryChannel}
          onPrimaryChannelChange={onPrimaryChannelChange}
          hasProduct={hasProduct}
          onHasProductChange={onHasProductChange}
          hasCheckout={hasCheckout}
          onHasCheckoutChange={onHasCheckoutChange}
          aiUseCase={aiUseCase}
          onAiUseCaseChange={onAiUseCaseChange}
        />

        {error ? (
          <p
            style={{
              marginTop: 16,
              color: colors.state.error,
              fontSize: 13,
              fontFamily: "'Sora', sans-serif",
            }}
          >
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={onContinue}
          disabled={!selected || loading}
          style={{
            marginTop: 32,
            width: '100%',
            padding: '14px 0',
            borderRadius: 6,
            border: 'none',
            background: selected ? colors.text.silver : colors.background.elevated,
            color: selected ? colors.background.void : colors.text.dim,
            fontSize: 15,
            fontWeight: 600,
            fontFamily: "'Sora', sans-serif",
            cursor: selected ? 'pointer' : 'default',
            transition: 'all 250ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            boxShadow: 'none',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? kloelT('Entrando...') : kloelT('CONTINUAR')}
        </button>

        <p
          style={{
            marginTop: 16,
            textAlign: 'center',
            fontSize: 14,
            color: colors.text.muted,
            fontFamily: "'Sora', sans-serif",
          }}
        >
          {kloelT(`Já tem uma conta?`)}{' '}
          <Link
            href="/login"
            style={{ fontWeight: 600, color: colors.text.silver, textDecoration: 'none' }}
          >
            {kloelT(`Acesse já`)}
          </Link>
        </p>

        <div
          style={{
            marginTop: 48,
            display: 'flex',
            gap: 16,
            fontSize: 12,
            color: colors.text.dim,
            fontFamily: "'Sora', sans-serif",
          }}
        >
          <Link href="/terms" style={{ color: colors.text.dim, textDecoration: 'none' }}>
            {kloelT(`Central de ajuda`)}
          </Link>
          <span>{kloelT('•')}</span>
          <Link href="/terms" style={{ color: colors.text.dim, textDecoration: 'none' }}>
            {kloelT(`Termos e condições`)}
          </Link>
        </div>
      </div>
    </div>
  );
}
