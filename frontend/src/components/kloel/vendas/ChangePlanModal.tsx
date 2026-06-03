'use client';

import { SORA } from './utils';

export interface ChangePlanOption {
  id: string;
  name: string;
  price: number;
}

const brl = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Number.isFinite(value) ? value : 0,
  );

/**
 * Real plan picker for "Mudar plano". Lists the product's actual ProductPlans
 * (fetched from `/products/:productId/plans`) so the change sends a real
 * `newPlanId` — the backend looks the plan up and rejects unknown ids with 404.
 * Replaces the previous prompt()-based free-typing that sent the subscription
 * id as the plan id and always 404'd.
 */
export function ChangePlanModal({
  open,
  plans,
  currentPlanId,
  loading,
  error,
  onSelect,
  onClose,
}: {
  open: boolean;
  plans: ChangePlanOption[];
  currentPlanId?: string | undefined;
  loading: boolean;
  error: string | null;
  onSelect: (planId: string) => void;
  onClose: () => void;
}) {
  if (!open) {
    return null;
  }
  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(4px)',
        fontFamily: SORA,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Mudar plano da assinatura"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        style={{
          background: 'var(--app-bg-primary)',
          border: '1px solid var(--app-border-primary)',
          borderRadius: 6,
          width: 440,
          maxWidth: '92vw',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--app-border-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--app-text-primary)' }}>
            Mudar plano da assinatura
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--app-text-tertiary)',
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
        <div style={{ padding: 20 }}>
          <p
            style={{
              fontSize: 12,
              color: 'var(--app-text-secondary)',
              lineHeight: 1.6,
              margin: '0 0 14px',
            }}
          >
            Selecione o novo plano. A cobrança seguinte passa a usar o valor do plano escolhido.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {plans.length === 0 ? (
              <div
                style={{
                  padding: '16px 14px',
                  background: 'var(--app-bg-card)',
                  border: '1px solid var(--app-border-primary)',
                  borderRadius: 6,
                  textAlign: 'center',
                  fontSize: 12,
                  color: 'var(--app-text-secondary)',
                }}
              >
                Este produto não possui outros planos cadastrados. Crie um plano no produto antes de
                trocar a assinatura.
              </div>
            ) : (
              plans.map((plan) => {
                const isCurrent = plan.id === currentPlanId;
                return (
                  <button
                    type="button"
                    key={plan.id}
                    disabled={loading || isCurrent}
                    onClick={() => onSelect(plan.id)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 10,
                      width: '100%',
                      textAlign: 'left',
                      background: 'var(--app-bg-card)',
                      border: `1px solid ${isCurrent ? 'var(--app-accent-medium)' : 'var(--app-border-primary)'}`,
                      borderRadius: 6,
                      padding: '12px 14px',
                      cursor: loading || isCurrent ? 'default' : 'pointer',
                      opacity: loading && !isCurrent ? 0.6 : 1,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: 'var(--app-text-primary)',
                      }}
                    >
                      {plan.name || 'Plano'}
                      {isCurrent && (
                        <span style={{ fontSize: 10, color: 'var(--app-text-tertiary)', marginLeft: 8 }}>
                          (atual)
                        </span>
                      )}
                    </span>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        fontFamily: "'JetBrains Mono',monospace",
                        color: 'var(--app-text-primary)',
                      }}
                    >
                      {brl(plan.price)}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          {error && (
            <div
              style={{
                marginTop: 12,
                padding: '8px 12px',
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 6,
                fontSize: 12,
                color: 'rgb(239,68,68)',
              }}
            >
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
