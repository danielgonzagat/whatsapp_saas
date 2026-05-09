'use client';

import { kloelT } from '@/lib/i18n/t';
import { Copy } from 'lucide-react';
import { type CSSProperties, type RefObject } from 'react';
import {
  C,
  labelStyle,
  MONO,
  sectionStyle,
  sectionTitleStyle,
  smallBtnStyle,
  inputStyle,
} from './checkout-editor-shared';

export interface PaymentMethodSelectorProps {
  checkoutPublicUrl: string;
  embedCopied: boolean;
  copied: boolean;
  copyEmbedCode: () => void;
  copyLink: () => void;
  highlightedSection: string | null;
  highlightActive: boolean;
  paymentWidgetRef: RefObject<HTMLDivElement | null>;
}

function sectionCardStyle(
  key: string,
  highlightActive: boolean,
  highlightedSection: string | null,
): CSSProperties {
  return {
    ...sectionStyle,
    ...(highlightActive && highlightedSection === key
      ? { border: `1px solid ${C.ember}`, boxShadow: `0 0 0 1px ${C.ember}22 inset` }
      : null),
  };
}

export function PaymentMethodSelector({
  checkoutPublicUrl,
  embedCopied,
  copied,
  copyEmbedCode,
  copyLink,
  highlightedSection,
  highlightActive,
  paymentWidgetRef,
}: PaymentMethodSelectorProps) {
  return (
    <div ref={paymentWidgetRef} style={sectionCardStyle('payment-widget', highlightActive, highlightedSection)}>
      <h3 style={sectionTitleStyle}>{kloelT('Widget de Pagamento')}</h3>
      <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.7, margin: '0 0 14px' }}>
        {kloelT(
          'Incorpore este checkout em paginas externas usando um iframe pronto. O embed usa o checkout publico ja configurado neste plano.',
        )}
      </p>
      <div
        style={{
          padding: 12,
          borderRadius: 6,
          backgroundColor: C.elevated,
          border: `1px solid ${C.border}`,
          marginBottom: 12,
        }}
      >
        <div style={{ ...labelStyle, marginBottom: 6 }}>
          {kloelT('URL publica do checkout')}
        </div>
        <div
          style={{ fontFamily: MONO, fontSize: 12, color: C.text, wordBreak: 'break-all' }}
        >
          {checkoutPublicUrl}
        </div>
      </div>
      <textarea
        readOnly
        value={[
          '<div style="width:100%;max-width:560px;margin:0 auto;">',
          '  <iframe src="' + checkoutPublicUrl + '"',
          '    loading="lazy"',
          '    style="width:100%;min-height:920px;border:0;border-radius:16px;background:colors.background.void;"',
          '    allow="payment *; clipboard-write">',
          '  </iframe>',
          '</div>',
        ].join('\n')}
        rows={7}
        style={{
          ...inputStyle,
          fontFamily: MONO,
          fontSize: 12,
          resize: 'vertical',
          minHeight: 160,
          marginBottom: 12,
        }}
      />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={copyEmbedCode} style={smallBtnStyle}>
          <Copy style={{ width: 14, height: 14 }} aria-hidden="true" />
          {embedCopied ? 'Widget copiado!' : 'Copiar codigo do widget'}
        </button>
        <button type="button" onClick={copyLink} style={smallBtnStyle}>
          <Copy style={{ width: 14, height: 14 }} aria-hidden="true" />
          {copied ? 'Link copiado!' : 'Copiar link publico'}
        </button>
      </div>
    </div>
  );
}
