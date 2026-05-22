'use client';
import { colors } from '@/lib/design-tokens';

import { kloelT } from '@/lib/i18n/t';

export const dynamic = 'force-dynamic';

import { type CheckoutConfig, useCheckoutEditor } from '@/hooks/useCheckoutEditor';
import { buildPayUrl, isValidCheckoutCode } from '@/lib/subdomains';
import { useParams, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeCheckoutCode } from './checkout-editor-utils';
import {
  C,
  CheckoutEditorLoadingOverlay,
  CheckoutPreviewLoadingOverlay,
  DEVICES,
  type DeviceId,
} from './checkout-editor-shared';
import { CheckoutEditorHeader } from './CheckoutEditorHeader';
import { PlanSummarySection } from './PlanSummarySection';
import { PaymentMethodSelector } from './PaymentMethodSelector';
import { BillingFormSection } from './BillingFormSection';
import { OrderConfirmationSection } from './OrderConfirmationSection';

export default function CheckoutEditorPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const planId = params?.planId as string;
  const requestedFocus = searchParams?.get('focus') || '';
  const source = searchParams?.get('source') || '';
  const productId = searchParams?.get('productId') || '';
  const productName = searchParams?.get('productName') || '';

  const { config, isLoading, updateConfig } = useCheckoutEditor(planId);

  const [device, setDevice] = useState<DeviceId>('desktop');
  const [saveFeedback, setSaveFeedback] = useState<'saving' | 'saved' | null>(null);
  const [copied, setCopied] = useState(false);
  const [embedCopied, setEmbedCopied] = useState(false);
  const [highlightedSection, setHighlightedSection] = useState<string | null>(null);
  const [highlightActive, setActive] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const embedCopiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentHost = typeof window !== 'undefined' ? window.location.host : undefined;
  const normalizedReferenceCode = normalizeCheckoutCode(config.referenceCode);
  const checkoutPublicUrl = isValidCheckoutCode(normalizedReferenceCode)
    ? buildPayUrl(`/${normalizedReferenceCode}`, currentHost)
    : buildPayUrl(`/${config.slug || planId}`, currentHost);
  const [previewUrl, setPreviewUrl] = useState('');
  const appearanceRef = useRef<HTMLDivElement>(null);
  const couponRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<HTMLDivElement>(null);
  const stockRef = useRef<HTMLDivElement>(null);
  const orderBumpsRef = useRef<HTMLDivElement>(null);
  const paymentWidgetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPreviewUrl(`${window.location.origin}/checkout/preview/${planId}?preview=true`);
  }, [planId]);

  useEffect(
    () => () => {
      if (saveFeedbackTimer.current) {
        clearTimeout(saveFeedbackTimer.current);
      }
      if (copiedTimer.current) {
        clearTimeout(copiedTimer.current);
      }
      if (embedCopiedTimer.current) {
        clearTimeout(embedCopiedTimer.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (isLoading || !requestedFocus) {
      return;
    }
    const focusMap: Record<
      string,
      { ref: React.RefObject<HTMLDivElement | null>; highlight: string }
    > = {
      'checkout-appearance': { ref: appearanceRef, highlight: 'appearance' },
      'payment-widget': { ref: paymentWidgetRef, highlight: 'payment-widget' },
      coupon: { ref: couponRef, highlight: 'coupon' },
      urgency: { ref: timerRef, highlight: 'urgency' },
      'order-bump': { ref: orderBumpsRef, highlight: 'order-bump' },
    };
    const target = focusMap[requestedFocus];
    if (!target?.ref.current) {
      return;
    }
    const timer = setTimeout(() => {
      target.ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setHighlightedSection(target.highlight);
      setActive(true);
    }, 120);
    const clearTimer = setTimeout(() => setActive(false), 2600);
    return () => {
      clearTimeout(timer);
      clearTimeout(clearTimer);
    };
  }, [isLoading, requestedFocus]);

  const refreshPreview = useCallback(() => {
    if (refreshTimer.current) {
      clearTimeout(refreshTimer.current);
    }
    refreshTimer.current = setTimeout(() => {
      if (iframeRef.current) {
        iframeRef.current.src = iframeRef.current.src;
      }
    }, 800);
  }, []);

  const patch = useCallback(
    async (p: Partial<CheckoutConfig>) => {
      setSaveFeedback('saving');
      try {
        await updateConfig(p);
        setSaveFeedback('saved');
        if (saveFeedbackTimer.current) {
          clearTimeout(saveFeedbackTimer.current);
        }
        saveFeedbackTimer.current = setTimeout(() => setSaveFeedback(null), 2000);
        refreshPreview();
      } catch (error) {
        setSaveFeedback(null);
        throw error;
      }
    },
    [updateConfig, refreshPreview],
  );

  const copyLink = useCallback(() => {
    navigator.clipboard.writeText(checkoutPublicUrl);
    setCopied(true);
    if (copiedTimer.current) {
      clearTimeout(copiedTimer.current);
    }
    copiedTimer.current = setTimeout(() => setCopied(false), 2000);
  }, [checkoutPublicUrl]);

  const copyEmbedCode = useCallback(() => {
    const embedCode = [
      '<div style="width:100%;max-width:560px;margin:0 auto;">',
      `  <iframe src="${checkoutPublicUrl}"`,
      '    loading="lazy"',
      '    style="width:100%;min-height:920px;border:0;border-radius:16px;background:colors.background.void;"',
      '    allow="payment *; clipboard-write">',
      '  </iframe>',
      '</div>',
    ].join('\n');
    navigator.clipboard.writeText(embedCode);
    setEmbedCopied(true);
    if (embedCopiedTimer.current) {
      clearTimeout(embedCopiedTimer.current);
    }
    embedCopiedTimer.current = setTimeout(() => setEmbedCopied(false), 2000);
  }, [checkoutPublicUrl]);

  useEffect(() => {
    return () => {
      if (refreshTimer.current) {
        clearTimeout(refreshTimer.current);
      }
    };
  }, []);

  const deviceWidth = DEVICES.find((d) => d.id === device)?.width || '100%';
  const showPreviewLoading = isLoading || !previewUrl;
  const productReturnHref = productId
    ? (() => {
        switch (requestedFocus) {
          case 'order-bump':
            return `/products/${productId}?tab=planos&planSub=bump&focus=order-bump`;
          case 'coupon':
            return `/products/${productId}?tab=cupons&modal=newCoupon&focus=coupon`;
          case 'urgency':
            return `/products/${productId}?tab=ia&focus=urgency`;
          case 'payment-widget':
            return `/products/${productId}?tab=checkouts&focus=payment-widget`;
          default:
            return `/products/${productId}?tab=checkouts&focus=checkout-appearance`;
        }
      })()
    : null;

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: C.void }}
    >
      <CheckoutEditorHeader
        config={config}
        isLoading={isLoading}
        device={device}
        setDevice={setDevice}
        saveFeedback={saveFeedback}
        copied={copied}
        embedCopied={embedCopied}
        copyLink={copyLink}
        copyEmbedCode={copyEmbedCode}
        productReturnHref={productReturnHref}
        source={source}
        productId={productId}
        productName={productName}
        requestedFocus={requestedFocus}
        planId={planId}
      />

      {/* ═══════ SPLIT VIEW ═══════ */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* ─── LEFT: EDIT PANEL ─── */}
        <div
          style={{
            width: 420,
            minWidth: 420,
            overflowY: 'auto',
            borderRight: `1px solid ${C.border}`,
            padding: 20,
            backgroundColor: C.void,
            position: 'relative',
          }}
        >
          <div
            style={{
              opacity: isLoading ? 0 : 1,
              pointerEvents: isLoading ? 'none' : 'auto',
              transition: 'opacity 180ms ease',
            }}
          >
            <PlanSummarySection
              config={config}
              patch={patch}
              source={source}
              requestedFocus={requestedFocus}
              productName={productName}
              productReturnHref={productReturnHref}
              iframeRef={iframeRef}
              appearanceRef={appearanceRef}
              highlightedSection={highlightedSection}
              highlightActive={highlightActive}
            />

            <BillingFormSection
              config={config}
              patch={patch}
              highlightedSection={highlightedSection}
              highlightActive={highlightActive}
              couponRef={couponRef}
              timerRef={timerRef}
              stockRef={stockRef}
            />

            <OrderConfirmationSection
              config={config}
              patch={patch}
              highlightedSection={highlightedSection}
              highlightActive={highlightActive}
              orderBumpsRef={orderBumpsRef}
            />

            <PaymentMethodSelector
              checkoutPublicUrl={checkoutPublicUrl}
              embedCopied={embedCopied}
              copied={copied}
              copyEmbedCode={copyEmbedCode}
              copyLink={copyLink}
              highlightedSection={highlightedSection}
              highlightActive={highlightActive}
              paymentWidgetRef={paymentWidgetRef}
            />
          </div>
          {isLoading && (
            <CheckoutEditorLoadingOverlay
              showContextCard={Boolean(source === 'products' || requestedFocus)}
            />
          )}
        </div>

        {/* ─── RIGHT: LIVE PREVIEW ─── */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.background.surface,
            overflow: 'hidden',
            padding: 20,
            position: 'relative',
          }}
        >
          <div
            style={{
              width: deviceWidth,
              maxWidth: '100%',
              height: '100%',
              borderRadius: 6,
              overflow: 'hidden',
              border: `1px solid ${C.border}`,
              backgroundColor: colors.background.void,
              transition: 'width 300ms ease',
              opacity: showPreviewLoading ? 0 : 1,
              pointerEvents: showPreviewLoading ? 'none' : 'auto',
            }}
          >
            <iframe
              ref={iframeRef}
              src={previewUrl}
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
              }}
              title={kloelT('Checkout Preview')}
            />
          </div>
          {showPreviewLoading && <CheckoutPreviewLoadingOverlay />}
        </div>
      </div>
    </div>
  );
}
