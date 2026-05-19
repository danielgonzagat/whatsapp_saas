'use client';

import { useSaleDetail } from '@/hooks/useSales';
import { IC } from './VendasView.icons';
import { Badge } from './Badge';
import { DetailActions } from './DetailActions';
import { SORA, MONO, SALE_STATUS, SUB_STATUS, ORDER_STATUS, fmtBRL, fmtDate } from './utils';
import type { SaleItem, SubscriptionItem, OrderItem, DetailItemData } from './types';

interface DetailModalProps {
  detailId: string | null;
  detailType: 'sale' | 'sub' | 'order';
  sales: SaleItem[];
  subscriptions: SubscriptionItem[];
  orders: OrderItem[];
  onClose: () => void;
  onRefund: (id: string) => void;
  onPauseSub: (id: string) => void;
  onResumeSub: (id: string) => void;
  onCancelSub: (id: string) => void;
  onChangePlan: (id: string) => void;
  onOpenShipModal: (id: string) => void;
  onReturnOrder: (id: string) => void;
  actionLoading: boolean;
}

function getTitle(detailType: 'sale' | 'sub' | 'order'): string {
  switch (detailType) {
    case 'order':
      return 'Detalhes do pedido';
    case 'sub':
      return 'Detalhes da assinatura';
    default:
      return 'Detalhes da venda';
  }
}

function getBadgeConfig(detailType: 'sale' | 'sub' | 'order') {
  switch (detailType) {
    case 'order':
      return ORDER_STATUS;
    case 'sub':
      return SUB_STATUS;
    default:
      return SALE_STATUS;
  }
}

type DetailRow = { l: string; v: string | number; c?: string };

function buildDetailRows(item: DetailItemData, detailType: 'sale' | 'sub' | 'order'): DetailRow[] {
  const candidates: (false | DetailRow)[] = [
    { l: 'Valor', v: fmtBRL(item.amount || 0), c: 'colors.ember.primary' },
    item.paymentMethod ? { l: 'Metodo', v: item.paymentMethod } : false,
    { l: 'Data', v: fmtDate(item.createdAt || item.startedAt || new Date()) },
    detailType === 'sub' && item.nextBillingAt
      ? { l: 'Proxima cobranca', v: fmtDate(item.nextBillingAt) }
      : false,
    detailType === 'sub'
      ? { l: 'LTV', v: fmtBRL(item.totalPaid || 0), c: 'colors.ember.primary' }
      : false,
    detailType === 'order'
      ? { l: 'Rastreamento', v: item.trackingCode || 'Aguardando' }
      : false,
    detailType === 'order' && item.addressState
      ? { l: 'Destino', v: `${item.addressCity || ''}, ${item.addressState}` }
      : false,
    { l: 'ID', v: item.id },
  ];
  return candidates.filter((x): x is DetailRow => Boolean(x));
}

export function DetailModal({
  detailId,
  detailType,
  sales,
  subscriptions,
  orders,
  onClose,
  onRefund,
  onPauseSub,
  onResumeSub,
  onCancelSub,
  onChangePlan,
  onOpenShipModal,
  onReturnOrder,
  actionLoading,
}: DetailModalProps) {
  const { sale: freshSale } = useSaleDetail(detailId && detailType === 'sale' ? detailId : null);

  if (!detailId) {
    return null;
  }

  const cached: DetailItemData | undefined =
    detailType === 'sale'
      ? sales.find((s) => s.id === detailId)
      : detailType === 'sub'
        ? subscriptions.find((s) => s.id === detailId)
        : orders.find((o) => o.id === detailId);

  const item: DetailItemData | undefined =
    detailType === 'sale' && freshSale ? (freshSale as DetailItemData) : cached;

  if (!item) {
    return null;
  }

  const rows = buildDetailRows(item, detailType);
  const badgeConfig = getBadgeConfig(detailType);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          (e.currentTarget as HTMLElement).click();
        }
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--app-bg-primary)',
          border: '1px solid var(--app-border-primary)',
          borderRadius: 6,
          width: 520,
          maxHeight: '80vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            (e.currentTarget as HTMLElement).click();
          }
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
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--app-text-primary)',
              fontFamily: SORA,
            }}
          >
            {getTitle(detailType)}
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--app-text-tertiary)',
              cursor: 'pointer',
            }}
          >
            {IC.x(16)}
          </button>
        </div>
        <div style={{ padding: 20 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 20,
            }}
          >
            <div>
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: 'var(--app-text-primary)',
                  display: 'block',
                  fontFamily: SORA,
                }}
              >
                {item.customerName || item.leadPhone || item.productName || 'Cliente'}
              </span>
              <span
                style={{ fontSize: 12, color: 'var(--app-text-tertiary)', fontFamily: SORA }}
              >
                {item.customerEmail || item.planName || item.addressState || ''}
              </span>
            </div>
            <Badge status={item.status || ''} config={badgeConfig} />
          </div>

          <div
            style={{
              background: 'var(--app-bg-card)',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 6,
              padding: 16,
              marginBottom: 16,
            }}
          >
            {rows.map((r, i, arr) => (
              <div
                key={r.l}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '10px 0',
                  borderBottom:
                    i < arr.length - 1 ? '1px solid var(--app-border-subtle)' : 'none',
                }}
              >
                <span
                  style={{ fontSize: 12, color: 'var(--app-text-secondary)', fontFamily: SORA }}
                >
                  {r.l}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: r.c || 'var(--app-text-primary)',
                    fontFamily: r.c ? MONO : SORA,
                  }}
                >
                  {r.v}
                </span>
              </div>
            ))}
          </div>

          <DetailActions
            detailType={detailType}
            itemStatus={item.status || ''}
            itemId={item.id}
            hasTrackingCode={Boolean(item.trackingCode)}
            trackingCode={item.trackingCode}
            actionLoading={actionLoading}
            onRefund={onRefund}
            onPauseSub={onPauseSub}
            onResumeSub={onResumeSub}
            onCancelSub={onCancelSub}
            onChangePlan={onChangePlan}
            onOpenShipModal={onOpenShipModal}
            onReturnOrder={onReturnOrder}
          />
        </div>
      </div>
    </div>
  );
}

