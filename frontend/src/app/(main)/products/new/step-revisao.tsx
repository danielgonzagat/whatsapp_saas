'use client';

import { kloelT } from '@/lib/i18n/t';
import { monitorCard } from './shared-styles';
import { ReviewSection } from './review-section';
import {
  BILLING_TYPE_LABEL_MAP,
  FORMAT_LABEL_MAP,
  PAYMENT_TYPE_LABEL_MAP,
  SHIPPING_RESPONSIBLE_LABEL_MAP,
  type FormState,
} from './types';
import { colors, typography } from '@/lib/design-tokens';

interface StepRevisaoProps {
  form: FormState;
  needsPhysical: boolean;
  onEditStep: (step: number) => void;
}

export function StepRevisao({ form, needsPhysical, onEditStep }: StepRevisaoProps) {
  return (
    <div style={monitorCard}>
      <h2
        style={{
          fontSize: 18,
          fontWeight: 600,
          fontFamily: typography.fontFamily.display,
          color: colors.text.starlight,
          margin: '0 0 24px 0',
        }}
      >
        {kloelT('Revisao do Produto')}
      </h2>

      <ReviewSection
        title={kloelT('Detalhes')}
        onEdit={() => onEditStep(1)}
        items={[
          { label: 'Nome', value: form.name },
          {
            label: 'Descricao',
            value: form.description ? `${form.description.slice(0, 120)}...` : '',
          },
          { label: 'Categoria', value: form.category },
          { label: 'Tags', value: form.tags.join(', ') },
          { label: 'Formato', value: FORMAT_LABEL_MAP[form.format] },
        ]}
      />

      <ReviewSection
        title={kloelT('Configuracao de Vendas')}
        onEdit={() => onEditStep(2)}
        items={[
          {
            label: 'Preco',
            value: `R$ ${Number.parseFloat(form.price || '0')
              .toFixed(2)
              .replace('.', ',')}`,
            highlight: true,
          },
          { label: 'Tipo de pagamento', value: PAYMENT_TYPE_LABEL_MAP[form.paymentType] },
          {
            label: 'Comissao afiliado',
            value: form.affiliateCommission ? `${form.affiliateCommission}%` : '',
          },
          { label: 'Garantia', value: `${form.guaranteeDays} dias` },
          {
            label: 'Checkout',
            value: form.checkoutType === 'standard' ? 'Standard' : 'Conversacional',
          },
          { label: 'Facebook Pixel', value: form.facebookPixelId },
          { label: 'GTM ID', value: form.googleTagManagerId },
        ]}
      />

      {needsPhysical && (
        <ReviewSection
          title={kloelT('Embalagem')}
          onEdit={() => onEditStep(3)}
          items={[
            { label: 'Tipo', value: form.packageType },
            {
              label: 'Dimensoes',
              value:
                form.width || form.height || form.depth
                  ? `${form.width || 0} x ${form.height || 0} x ${form.depth || 0} cm`
                  : '',
            },
            { label: 'Peso', value: form.weight ? `${form.weight} kg` : '' },
          ]}
        />
      )}

      {needsPhysical && (
        <ReviewSection
          title={kloelT('Entrega')}
          onEdit={() => onEditStep(4)}
          items={[
            {
              label: 'Responsavel',
              value: SHIPPING_RESPONSIBLE_LABEL_MAP[form.shippingResponsible],
            },
            {
              label: 'Prazo de despacho',
              value: `${form.dispatchTime} dia(s) util(is)`,
            },
            { label: 'Transportadoras', value: form.carriers.join(', ') },
          ]}
        />
      )}

      <ReviewSection
        title={kloelT('Afiliacao')}
        onEdit={() => onEditStep(5)}
        items={[
          {
            label: 'Afiliados',
            value: form.affiliatesEnabled ? 'Habilitado' : 'Desabilitado',
          },
          ...(form.affiliatesEnabled
            ? [
                {
                  label: 'Comissao',
                  value: form.affiliateCommissionPercent
                    ? `${form.affiliateCommissionPercent}%`
                    : '',
                },
                {
                  label: 'Aprovacao',
                  value: form.affiliateApprovalMode === 'auto' ? 'Automatica' : 'Manual',
                },
              ]
            : []),
        ]}
      />

      <ReviewSection
        title={kloelT('Pagamento')}
        onEdit={() => onEditStep(6)}
        items={[
          { label: 'Tipo de cobranca', value: BILLING_TYPE_LABEL_MAP[form.billingType] },
          ...(form.billingType !== 'free'
            ? [
                { label: 'Max. parcelas', value: `${form.maxInstallments}x` },
                {
                  label: 'Sem juros',
                  value: `${form.interestFreeInstallments}x`,
                },
              ]
            : []),
        ]}
      />
    </div>
  );
}
