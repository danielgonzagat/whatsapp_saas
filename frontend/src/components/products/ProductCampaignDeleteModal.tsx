'use client';
import { PRODUCT_CAMPAIGNS_COPY, type Campaign, SORA, V } from './ProductCampaignsTab.constants';

export function ProductCampaignDeleteModal({
  campaignPendingDelete,
  deleting,
  onConfirm,
  onCancel,
}: {
  campaignPendingDelete: Campaign | null;
  deleting: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!campaignPendingDelete) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0,0,0,.7)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: V.s,
          border: `1px solid ${V.b}`,
          borderRadius: 12,
          padding: '24px 28px',
          maxWidth: 420,
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h3
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: V.t,
              margin: 0,
              fontFamily: SORA,
            }}
          >
            {PRODUCT_CAMPAIGNS_COPY.deleteTitle}
          </h3>
          <p style={{ margin: 0, fontSize: 13, color: V.t2, fontFamily: SORA }}>
            {PRODUCT_CAMPAIGNS_COPY.deleteDescription}
          </p>
          <p style={{ margin: 0, fontSize: 12, color: V.t3, fontFamily: MONO }}>
            {campaignPendingDelete.name}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '8px 16px',
              background: 'none',
              border: `1px solid ${V.b}`,
              borderRadius: 6,
              color: V.t2,
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: SORA,
            }}
          >
            {PRODUCT_CAMPAIGNS_COPY.cancel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting === campaignPendingDelete.id}
            style={{
              padding: '8px 16px',
              background: V.em,
              border: 'none',
              borderRadius: 6,
              color: V.ta,
              fontSize: 12,
              fontWeight: 700,
              cursor: deleting === campaignPendingDelete.id ? 'not-allowed' : 'pointer',
              fontFamily: SORA,
              opacity: deleting === campaignPendingDelete.id ? 0.5 : 1,
            }}
          >
            {deleting === campaignPendingDelete.id
              ? PRODUCT_CAMPAIGNS_COPY.deleting
              : PRODUCT_CAMPAIGNS_COPY.confirmDelete}
          </button>
        </div>
      </div>
    </div>
  );
}
