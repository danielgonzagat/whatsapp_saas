'use client';

import { buildCheckoutLinksForPlan } from '@/lib/checkout-links';
import { Bt, M, Modal, V } from './product-nerve-center.shared';
import type { ProductEditorPlanView } from './product-nerve-center.view-models';

interface ProductNerveCenterLinksModalProps {
  planId: string;
  plans: ProductEditorPlanView[];
  copied: string | null;
  onCopyLink: (url: string, feedbackId: string) => void;
  onClose: () => void;
}

export function ProductNerveCenterLinksModal({
  planId,
  plans,
  copied,
  onCopyLink,
  onClose,
}: ProductNerveCenterLinksModalProps) {
  const plan = plans.find((entry) => entry.id === planId);
  if (!plan) {
    return null;
  }

  const checkoutLinks = buildCheckoutLinksForPlan(plan);

  return (
    <Modal title="Links disponíveis" onClose={onClose}>
      <div style={{ display: 'grid', gap: 10 }}>
        {checkoutLinks.length === 0 ? (
          <div
            style={{
              padding: '18px 16px',
              background: V.e,
              borderRadius: 6,
              border: `1px solid ${V.b}`,
              display: 'grid',
              gap: 6,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 600, color: V.t }}>
              Nenhum checkout vinculado a este plano
            </span>
            <span style={{ fontSize: 11, color: V.t2, lineHeight: 1.6 }}>
              Abra a aba <strong style={{ color: V.t }}>Checkouts</strong>, edite um checkout e
              selecione este plano para gerar links públicos de compra.
            </span>
          </div>
        ) : null}
        {checkoutLinks.map((link) => (
          <div
            key={link.id}
            style={{
              padding: '12px 16px',
              background: V.e,
              borderRadius: 6,
              border: `1px solid ${V.b}`,
            }}
          >
            <span style={{ fontSize: 10, color: V.t3, display: 'block', marginBottom: 4 }}>
              {link.isPrimary ? 'CHECKOUT PRINCIPAL' : 'CHECKOUT VINCULADO'}
            </span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: V.t,
                display: 'block',
                marginBottom: 6,
              }}
            >
              {link.checkoutName}
            </span>
            <span
              style={{
                fontSize: 11,
                color: V.t2,
                display: 'block',
                marginBottom: 10,
                lineHeight: 1.5,
              }}
            >
              {link.paymentMethods.length
                ? `Métodos liberados: ${link.paymentMethods.join(' · ')}`
                : 'Checkout sem meios de pagamento ativos.'}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Bt
                onClick={() => onCopyLink(String(link.url), `link-${plan.id}-${link.id}`)}
                style={{ padding: '5px 12px' }}
              >
                {copied === `link-${plan.id}-${link.id}` ? 'Copiado' : 'Copiar'}
              </Bt>
              <span
                style={{
                  fontFamily: M,
                  fontSize: 11,
                  color: V.em,
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {link.url}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
