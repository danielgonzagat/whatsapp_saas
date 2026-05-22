'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { Mail, MessageCircle, Users } from 'lucide-react';

const PRODUCT_TYPES = [
  { id: 'digital', label: 'Digital' },
  { id: 'physical', label: 'Físico' },
  { id: 'subscription', label: 'Assinatura' },
  { id: 'service', label: 'Serviço' },
] as const;

const CHANNELS = [
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { id: 'instagram', label: 'Instagram', icon: Users },
  { id: 'messenger', label: 'Messenger', icon: MessageCircle },
  { id: 'email', label: 'E-mail', icon: Mail },
] as const;

const AI_USE_CASES = [
  { id: 'sales', label: 'Venda' },
  { id: 'support', label: 'Atendimento' },
  { id: 'recovery', label: 'Recuperação' },
] as const;

interface OnboardingProductConfigProps {
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
}

export function OnboardingProductConfig({
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
}: OnboardingProductConfigProps) {
  return (
    <div style={{ marginTop: 24, display: 'grid', gap: 16 }}>
      <div>
        <p style={{ margin: '0 0 8px', color: colors.text.silver, fontSize: 13, fontWeight: 600 }}>
          {kloelT('Tipo de produto')}
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 8,
          }}
        >
          {PRODUCT_TYPES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onProductTypeChange(item.id)}
              style={{
                borderRadius: 6,
                border: `1px solid ${productType === item.id ? colors.ember.primary : colors.background.border}`,
                background: productType === item.id ? 'rgba(232, 93, 48, 0.08)' : colors.background.surface,
                color: colors.text.silver,
                padding: '10px 12px',
                fontSize: 13,
              }}
            >
              {kloelT(item.label)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p style={{ margin: '0 0 8px', color: colors.text.silver, fontSize: 13, fontWeight: 600 }}>
          {kloelT('Canal principal')}
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 8,
          }}
        >
          {CHANNELS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onPrimaryChannelChange(item.id)}
                style={{
                  alignItems: 'center',
                  borderRadius: 6,
                  border: `1px solid ${primaryChannel === item.id ? colors.ember.primary : colors.background.border}`,
                  background:
                    primaryChannel === item.id ? 'rgba(232, 93, 48, 0.08)' : colors.background.surface,
                  color: colors.text.silver,
                  display: 'flex',
                  gap: 8,
                  justifyContent: 'center',
                  padding: '10px 12px',
                  fontSize: 13,
                }}
              >
                <Icon size={15} />
                {kloelT(item.label)}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p style={{ margin: '0 0 8px', color: colors.text.silver, fontSize: 13, fontWeight: 600 }}>
          {kloelT('Estrutura atual')}
        </p>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: colors.text.silver,
            fontSize: 13,
          }}
        >
          <input
            type="checkbox"
            checked={hasProduct}
            onChange={(event) => onHasProductChange(event.target.checked)}
          />
          {kloelT('Já tenho produto')}
        </label>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: colors.text.silver,
            fontSize: 13,
            marginTop: 8,
          }}
        >
          <input
            type="checkbox"
            checked={hasCheckout}
            onChange={(event) => onHasCheckoutChange(event.target.checked)}
          />
          {kloelT('Já tenho checkout')}
        </label>
      </div>

      <div>
        <p style={{ margin: '0 0 8px', color: colors.text.silver, fontSize: 13, fontWeight: 600 }}>
          {kloelT('Uso inicial da IA')}
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 8,
          }}
        >
          {AI_USE_CASES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onAiUseCaseChange(item.id)}
              style={{
                borderRadius: 6,
                border: `1px solid ${aiUseCase === item.id ? colors.ember.primary : colors.background.border}`,
                background: aiUseCase === item.id ? 'rgba(232, 93, 48, 0.08)' : colors.background.surface,
                color: colors.text.silver,
                padding: '10px 8px',
                fontSize: 13,
              }}
            >
              {kloelT(item.label)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
