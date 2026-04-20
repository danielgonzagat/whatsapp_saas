'use client';

// PULSE:OK — public checkout hooks use one-shot POST calls (order creation, coupon validation, upsell accept/decline).
// These do not read from SWR caches, so no invalidation is needed on the client side.

import { API_BASE } from '@/lib/http';
import { useCallback, useEffect, useRef, useState } from 'react';
import { mutate } from 'swr';

/* ─── Types ────────────────────────────────────────────────────────────────── */

export interface OrderStatusData {
  /** Id property. */
  id: string;
  /** Order number property. */
  orderNumber: string;
  /** Status property. */
  status: string;
  /** Payment property. */
  payment?: {
    status: string;
    pixQrCode?: string;
    pixCopyPaste?: string;
    pixExpiresAt?: string;
    boletoUrl?: string;
    boletoBarcode?: string;
    boletoExpiresAt?: string;
  };
}

/** Create order data shape. */
export interface CreateOrderData {
  /** Plan id property. */
  planId: string;
  /** Workspace id property. */
  workspaceId: string;
  /** Checkout code property. */
  checkoutCode?: string;
  /** Captured lead id property. */
  capturedLeadId?: string;
  /** Device fingerprint property. */
  deviceFingerprint?: string;
  /** Customer name property. */
  customerName: string;
  /** Customer email property. */
  customerEmail: string;
  /** Customer cpf property. */
  customerCPF?: string;
  /** Customer phone property. */
  customerPhone?: string;
  /** Shipping address property. */
  shippingAddress: Record<string, unknown>;
  /** Shipping method property. */
  shippingMethod?: string;
  /** Shipping price property. */
  shippingPrice?: number;
  /** Order quantity property. */
  orderQuantity?: number;
  /** Subtotal in cents property. */
  subtotalInCents: number;
  /** Discount in cents property. */
  discountInCents?: number;
  /** Bump total in cents property. */
  bumpTotalInCents?: number;
  /** Total in cents property. */
  totalInCents: number;
  /** Coupon code property. */
  couponCode?: string;
  /** Coupon discount property. */
  couponDiscount?: number;
  /** Accepted bumps property. */
  acceptedBumps?: string[];
  /** Payment method property. */
  paymentMethod: 'CREDIT_CARD' | 'PIX' | 'BOLETO';
  /** Installments property. */
  installments?: number;
  /** Card holder name property. */
  cardHolderName?: string;
  /** Affiliate id property. */
  affiliateId?: string;
  /** Utm source property. */
  utmSource?: string;
  /** Utm medium property. */
  utmMedium?: string;
  /** Utm campaign property. */
  utmCampaign?: string;
  /** Utm content property. */
  utmContent?: string;
  /** Utm term property. */
  utmTerm?: string;
}

/** Coupon result shape. */
export interface CouponResult {
  /** Valid property. */
  valid: boolean;
  /** Code property. */
  code?: string;
  /** Discount type property. */
  discountType?: 'PERCENTAGE' | 'FIXED';
  /** Discount value property. */
  discountValue?: number;
  /** Discount amount property. */
  discountAmount?: number;
  /** Message property. */
  message?: string;
}

function createCheckoutApiRequest(path: string, init?: RequestInit): Request {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return new Request(`${API_BASE}${normalizedPath}`, init);
}

/* ─── useOrderStatus ───────────────────────────────────────────────────────── */

export function useOrderStatus(orderId: string, pollIntervalMs = 3000) {
  const [data, setData] = useState<OrderStatusData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!orderId) {
      return;
    }

    const fetchStatus = async () => {
      try {
        const res = await fetch(
          createCheckoutApiRequest(`/checkout/public/order/${orderId}/status`),
        );
        if (!res.ok) {
          throw new Error('Erro ao buscar status do pedido');
        }
        const json: OrderStatusData = await res.json();
        setData(json);
        setLoading(false);

        // Stop polling once paid, canceled, or refunded
        if (['PAID', 'CANCELED', 'REFUNDED'].includes(json.status)) {
          stopPolling();
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Erro desconhecido');
        setLoading(false);
      }
    };

    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, pollIntervalMs);

    return () => stopPolling();
  }, [orderId, pollIntervalMs, stopPolling]);

  return { data, error, loading, stopPolling };
}

/* ─── createOrder ──────────────────────────────────────────────────────────── */

export async function createOrder(data: CreateOrderData) {
  const res = await fetch(
    createCheckoutApiRequest('/checkout/public/order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    }),
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Erro ao criar pedido');
  }

  const result = await res.json();
  mutate((key: unknown) => typeof key === 'string' && key.startsWith('/checkout'));
  return result;
}

/* ─── validateCoupon ───────────────────────────────────────────────────────── */

export async function validateCoupon(
  workspaceId: string,
  code: string,
  planId: string,
  orderValue: number,
): Promise<CouponResult> {
  const res = await fetch(
    createCheckoutApiRequest('/checkout/public/validate-coupon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, code, planId, orderValue }),
    }),
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Cupom invalido');
  }

  return res.json();
}

/* ─── acceptUpsell / declineUpsell ─────────────────────────────────────────── */

export async function acceptUpsell(orderId: string, upsellId: string) {
  const res = await fetch(
    createCheckoutApiRequest(`/checkout/public/upsell/${orderId}/accept/${upsellId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }),
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Erro ao aceitar oferta');
  }

  return res.json();
}

/** Decline upsell. */
export async function declineUpsell(orderId: string, upsellId: string) {
  const res = await fetch(
    createCheckoutApiRequest(`/checkout/public/upsell/${orderId}/decline/${upsellId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }),
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Erro ao recusar oferta');
  }

  return res.json();
}
