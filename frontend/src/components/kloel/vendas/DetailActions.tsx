import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { IC } from './VendasView.icons';
import { SORA } from './utils';

interface DetailActionsProps {
  detailType: 'sale' | 'sub' | 'order';
  itemStatus: string;
  itemId: string;
  hasTrackingCode: boolean;
  trackingCode: string | undefined;
  actionLoading: boolean;
  onRefund: (id: string) => void;
  onPauseSub: (id: string) => void;
  onResumeSub: (id: string) => void;
  onCancelSub: (id: string) => void;
  onChangePlan: (id: string) => void;
  onOpenShipModal: (id: string) => void;
  onReturnOrder: (id: string) => void;
}

export function DetailActions({
  detailType,
  itemStatus,
  itemId,
  hasTrackingCode,
  trackingCode,
  actionLoading,
  onRefund,
  onPauseSub,
  onResumeSub,
  onCancelSub,
  onChangePlan,
  onOpenShipModal,
  onReturnOrder,
}: DetailActionsProps) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {detailType === 'sale' && itemStatus === 'paid' && (
        <ActionButton
          onClick={() => onRefund(itemId)}
          disabled={actionLoading}
          icon={IC.undo(12)}
          label={actionLoading ? 'Processando...' : 'Reembolsar'}
        />
      )}
      {detailType === 'sub' && itemStatus === 'ACTIVE' && (
        <>
          <ActionButton
            onClick={() => onPauseSub(itemId)}
            disabled={actionLoading}
            icon={IC.pause(12)}
            label={kloelT('Pausar')}
          />
          <button
            type="button"
            onClick={() => onChangePlan(itemId)}
            disabled={actionLoading}
            style={emphasizedStyle}
          >
            {kloelT('Mudar plano')}
          </button>
          <ActionButton
            onClick={() => onCancelSub(itemId)}
            disabled={actionLoading}
            icon={IC.x(12)}
            label={kloelT('Cancelar')}
            color={colors.semantic.error}
          />
        </>
      )}
      {detailType === 'sub' && itemStatus === 'PAUSED' && (
        <button
          type="button"
          onClick={() => onResumeSub(itemId)}
          disabled={actionLoading}
          style={{
            flex: 1,
            padding: '10px 16px',
            background: 'colors.ember.primary',
            border: 'none',
            borderRadius: 6,
            color: 'var(--app-text-on-accent)',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: SORA,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          {IC.play(12)} {kloelT('Retomar')}
        </button>
      )}
      {detailType === 'order' && itemStatus === 'PROCESSING' && (
        <button
          type="button"
          onClick={() => {
            onOpenShipModal(itemId);
          }}
          style={{
            flex: 1,
            padding: '10px 16px',
            background: 'colors.ember.primary',
            border: 'none',
            borderRadius: 6,
            color: 'var(--app-text-on-accent)',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: SORA,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          {IC.truck(12)} {kloelT('Marcar como enviado')}
        </button>
      )}
      {detailType === 'order' &&
        (itemStatus === 'SHIPPED' || itemStatus === 'DELIVERED') && (
          <ActionButton
            onClick={() => onReturnOrder(itemId)}
            disabled={actionLoading}
            icon={IC.undo(12)}
            label={kloelT('Devolver')}
          />
        )}
      {detailType === 'order' && hasTrackingCode && (
        <ActionButton
          onClick={() =>
            window.open(
              `https://www.linkcorreios.com.br/?id=${trackingCode}`,
              '_blank',
              'noopener,noreferrer',
            )
          }
          icon={IC.map(12)}
          label={kloelT('Rastrear')}
        />
      )}
    </div>
  );
}

function ActionButton({
  onClick,
  disabled,
  icon,
  label,
  color,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        padding: '10px 16px',
        background: 'none',
        border: '1px solid var(--app-border-primary)',
        borderRadius: 6,
        color: color || 'var(--app-text-secondary)',
        fontSize: 12,
        cursor: 'pointer',
        fontFamily: SORA,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {icon} {label}
    </button>
  );
}

const emphasizedStyle: React.CSSProperties = {
  flex: 1,
  padding: '10px 16px',
  background: 'none',
  border: '1px solid colors.ember.primary',
  borderRadius: 6,
  color: 'colors.ember.primary',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: SORA,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
};
