'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { API_BASE } from '@/lib/http';

/* ─── Types ────────────────────────────────────────────────────────────────── */

export interface OrderStatusData {
  id: string;
  orderNumber: string;
  status: string;
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

export interface CreateOrderData {
  planId: string;
  workspaceId: string;
  customerName: string;
  customerEmail: string;
  customerCPF?: string;
  customerPhone?: string;
  shippingAddress: Record<string, unknown>;
  shippingMethod?: string;
  shippingPrice?: number;
  subtotalInCents: number;
  discountInCents?: number;
  bumpTotalInCents?: number;
  totalInCents: number;
  couponCode?: string;
  couponDiscount?: number;
  acceptedBumps?: string[];
  paymentMethod: 'CREDIT_CARD' | 'PIX' | 'BOLETO';
  installments?: number;
  affiliateId?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
}

export interface CouponResult {
  valid: boolean;
  code: string;
  discountType: 'PERCENTAGE' | 'FIXED';
  discountValue: number;
  discountAmount: number;
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
    if (!orderId) return;

    const fetchStatus = async () => {
      try {
        const res = await fetch(`${API_BASE}/checkout/public/order/${orderId}/status`);
        if (!res.ok) throw new Error('Erro ao buscar status do pedido');
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
  const res = await fetch(`${API_BASE}/checkout/public/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Erro ao criar pedido');
  }

  return res.json();
}

/* ─── validateCoupon ───────────────────────────────────────────────────────── */

export async function validateCoupon(
  workspaceId: string,
  code: string,
  planId: string,
  orderValue: number,
): Promise<CouponResult> {
  const res = await fetch(`${API_BASE}/checkout/public/validate-coupon`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceId, code, planId, orderValue }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Cupom invalido');
  }

  return res.json();
}

/* ─── acceptUpsell / declineUpsell ─────────────────────────────────────────── */

export async function acceptUpsell(orderId: string, upsellId: string) {
  const res = await fetch(`${API_BASE}/checkout/public/upsell/${orderId}/accept/${upsellId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Erro ao aceitar oferta');
  }

  return res.json();
}

export async function declineUpsell(orderId: string, upsellId: string) {
  const res = await fetch(`${API_BASE}/checkout/public/upsell/${orderId}/decline/${upsellId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Erro ao recusar oferta');
  }

  return res.json();
}
