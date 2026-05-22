import { Badge } from './Badge';
import { SORA, MONO, SALE_STATUS, PAY_METHODS, fmtBRL, fmtDate } from './utils';
import type { SaleItem } from './types';

interface MobileSaleRowProps {
  sale: SaleItem;
  isLast: boolean;
  onOpenDetail: (id: string, type: 'sale' | 'sub' | 'order') => void;
}

export function MobileSaleRow({ sale, isLast, onOpenDetail }: MobileSaleRowProps) {
  return (
    <button
      type="button"
      onClick={() => onOpenDetail(sale.id, 'sale')}
      style={{
        width: '100%',
        border: 'none',
        background: 'transparent',
        padding: '14px 16px',
        borderBottom: isLast ? 'none' : '1px solid var(--app-border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--app-text-primary)',
              display: 'block',
              fontFamily: SORA,
            }}
          >
            {sale.leadPhone || 'Cliente'}
          </span>
          <span style={{ fontSize: 10, color: 'var(--app-text-tertiary)' }}>
            {sale.productName || 'Produto'}
          </span>
        </div>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 13,
            fontWeight: 600,
            color: 'colors.ember.primary',
          }}
        >
          {fmtBRL(sale.amount)}
        </span>
      </div>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}
      >
        <div>
          {sale.paymentMethod && (
            <span
              style={{
                fontSize: 10,
                color: PAY_METHODS[sale.paymentMethod] || 'var(--app-text-secondary)',
                background: `${PAY_METHODS[sale.paymentMethod] || 'var(--app-text-secondary)'}12`,
                padding: '3px 8px',
                borderRadius: 4,
                fontWeight: 600,
                textTransform: 'uppercase',
                fontFamily: MONO,
              }}
            >
              {sale.paymentMethod}
            </span>
          )}
        </div>
        <Badge status={sale.status} config={SALE_STATUS} />
        <span style={{ fontSize: 11, color: 'var(--app-text-tertiary)' }}>
          {fmtDate(sale.createdAt || new Date())}
        </span>
      </div>
    </button>
  );
}

interface DesktopSaleRowProps {
  sale: SaleItem;
  isLast: boolean;
  onOpenDetail: (id: string, type: 'sale' | 'sub' | 'order') => void;
}

export function DesktopSaleRow({ sale, isLast, onOpenDetail }: DesktopSaleRowProps) {
  return (
    <button
      type="button"
      onClick={() => onOpenDetail(sale.id, 'sale')}
      aria-label={`Abrir detalhes da venda ${sale.id}`}
      style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1.5fr 1fr 1fr 0.8fr 0.8fr',
        gap: 12,
        padding: '12px 16px',
        borderBottom: isLast ? 'none' : '1px solid var(--app-border-subtle)',
        cursor: 'pointer',
        transition: 'background .1s',
        textAlign: 'left',
        border: 'none',
        background: 'transparent',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--app-bg-hover)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'none';
      }}
    >
      <div>
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--app-text-primary)',
            display: 'block',
            fontFamily: SORA,
          }}
        >
          {sale.leadPhone || 'Cliente'}
        </span>
        <span style={{ fontSize: 10, color: 'var(--app-text-tertiary)' }}>
          {sale.leadId?.slice(0, 8) || ''}
        </span>
      </div>
      <span
        style={{
          fontSize: 12,
          color: 'var(--app-text-secondary)',
          alignSelf: 'center',
          fontFamily: SORA,
        }}
      >
        {sale.productName || 'Produto'}
      </span>
      <span
        style={{
          fontFamily: MONO,
          fontSize: 13,
          fontWeight: 600,
          color: 'colors.ember.primary',
          alignSelf: 'center',
        }}
      >
        {fmtBRL(sale.amount)}
      </span>
      <div style={{ alignSelf: 'center' }}>
        {sale.paymentMethod && (
          <span
            style={{
              fontSize: 10,
              color: PAY_METHODS[sale.paymentMethod] || 'var(--app-text-secondary)',
              background: `${PAY_METHODS[sale.paymentMethod] || 'var(--app-text-secondary)'}12`,
              padding: '3px 8px',
              borderRadius: 4,
              fontWeight: 600,
              textTransform: 'uppercase',
              fontFamily: MONO,
            }}
          >
            {sale.paymentMethod}
          </span>
        )}
      </div>
      <div style={{ alignSelf: 'center' }}>
        <Badge status={sale.status} config={SALE_STATUS} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--app-text-tertiary)', alignSelf: 'center' }}>
        {fmtDate(sale.createdAt || new Date())}
      </span>
    </button>
  );
}
