'use client';
import { colors } from '@/lib/design-tokens';
import { kloelT } from '@/lib/i18n/t';
import {
  SORA,
  BG_CARD,
  BG_ELEVATED,
  BORDER,
  GREEN,
} from './ProdutosView.shared';
import type React from 'react';

export default function AffiliateApplyDialog({
  item,
  requestingId,
  copiedAffiliate,
  onRequestAffiliation,
  onCopyLink,
}: {
  item: {
    id: string;
    name?: string;
    affiliateLink?: string;
    requestStatus?: string;
  };
  requestingId: string | null;
  copiedAffiliate: boolean;
  onRequestAffiliation: (productId: string) => void;
  onCopyLink: (link: string) => void;
}) {
  const isPending = item.requestStatus === 'PENDING';
  const hasLink = !!item.affiliateLink;

  return (
    <div style={{ textAlign: 'center', padding: '24px 0' }}>
      {hasLink ? (
        <button
          type="button"
          onClick={() => onCopyLink(item.affiliateLink || '')}
          style={{
            padding: '14px 40px',
            background: GREEN,
            color: colors.text.silver,
            border: 'none',
            borderRadius: 6,
            fontFamily: SORA,
            fontSize: 15,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: `0 0 30px ${GREEN}40`,
          }}
        >
          {copiedAffiliate ? kloelT('Link copiado') : kloelT('Copiar link de afiliado')}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onRequestAffiliation(item.id)}
          disabled={requestingId === item.id || isPending}
          style={{
            padding: '14px 40px',
            background: isPending ? BG_ELEVATED : GREEN,
            color: colors.text.silver,
            border: 'none',
            borderRadius: 6,
            fontFamily: SORA,
            fontSize: 15,
            fontWeight: 700,
            cursor: isPending ? 'default' : 'pointer',
            boxShadow: isPending ? 'none' : `0 0 30px ${GREEN}40`,
          }}
        >
          {requestingId === item.id
            ? kloelT('Enviando...')
            : isPending
              ? kloelT('Solicitacao enviada')
              : kloelT('Solicitar afiliacao')}
        </button>
      )}
    </div>
  );
}
