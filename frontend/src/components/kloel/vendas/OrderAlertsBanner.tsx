import { colors } from '@/lib/design-tokens';
import { kloelT } from '@/lib/i18n/t';
import { SORA } from './utils';

interface OrderAlert {
  id: string;
  type: string;
  severity: string;
  message: string;
  orderId?: string;
  resolved: boolean;
  createdAt: string;
}

interface OrderAlertsBannerProps {
  alerts: OrderAlert[];
  alertCounts: Record<string, number> | null;
  onGenerate: () => void;
  onResolve: (id: string) => void;
}

export function OrderAlertsBanner({
  alerts,
  alertCounts,
  onGenerate,
  onResolve,
}: OrderAlertsBannerProps) {
  if (alerts.length === 0) return null;

  return (
    <div
      style={{
        background: 'rgba(239,68,68,0.06)',
        border: '1px solid rgba(239,68,68,0.3)',
        borderRadius: 6,
        padding: '12px 16px',
        marginBottom: 16,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: alerts.length > 1 ? 8 : 0,
        }}
      >
        <svg
          width={16}
          height={16}
          viewBox="0 0 24 24"
          fill="none"
          stroke={colors.semantic.error}
          strokeWidth={2}
          aria-hidden="true"
        >
          <path
            d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
          />
          <line x1={12} y1={9} x2={12} y2={13} />
          <line x1={12} y1={17} x2={12.01} y2={17} />
        </svg>
        <span style={{ fontSize: 12, color: colors.semantic.error, fontFamily: SORA, flex: 1 }}>
          {alerts.length} alerta{alerts.length > 1 ? 's' : ''}:
          {alertCounts?.missingTracking ? ` ${alertCounts.missingTracking} sem rastreio` : ''}
          {alertCounts?.possibleLost ? ` ${alertCounts.possibleLost} possivel extravio` : ''}
          {alertCounts?.chargebacks ? ` ${alertCounts.chargebacks} chargeback` : ''}
        </span>
        <button
          type="button"
          onClick={onGenerate}
          style={{
            background: 'none',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 6,
            color: colors.semantic.error,
            fontSize: 10,
            fontWeight: 600,
            padding: '4px 10px',
            cursor: 'pointer',
            fontFamily: SORA,
          }}
        >
          {kloelT('Atualizar')}
        </button>
      </div>
      {alerts.slice(0, 3).map((alert) => (
        <div
          key={alert.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 0',
            borderTop: '1px solid rgba(239,68,68,0.1)',
          }}
        >
          <span style={{ fontSize: 11, color: colors.semantic.error, fontFamily: SORA, flex: 1 }}>
            {alert.message}
          </span>
          <button
            type="button"
            onClick={() => onResolve(alert.id)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--app-text-secondary)',
              fontSize: 10,
              cursor: 'pointer',
              fontFamily: SORA,
              textDecoration: 'underline',
              padding: 0,
            }}
          >
            {kloelT('Resolver')}
          </button>
        </div>
      ))}
    </div>
  );
}
