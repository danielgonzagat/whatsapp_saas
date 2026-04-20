'use client';

import { kloelError } from '@/lib/i18n/t';
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { createContext, useContext } from 'react';
import type { ProductEditorPlanView } from './product-nerve-center.view-models';

interface PlanData {
  id: string;
  name: string;
  priceInCents?: number;
  [key: string]: unknown;
}

interface CheckoutData {
  id: string;
  [key: string]: unknown;
}

interface CouponData {
  id: string;
  code?: string;
  type?: string;
  val?: number | string;
  [key: string]: unknown;
}

interface BumpData {
  id: string;
  [key: string]: unknown;
}

/** Product nerve center context value shape. */
export interface ProductNerveCenterContextValue {
  // Identity
  productId: string;

  // Product data
  p: Record<string, unknown> & { name?: string; id?: string };
  /** Refresh product property. */
  refreshProduct: () => Promise<void>;
  /** Update product property. */
  updateProduct: (id: string, body: Record<string, unknown>) => Promise<unknown>;

  // Plans
  rawPlans: PlanData[];
  /** Plans property. */
  PLANS: ProductEditorPlanView[];
  /** Plans loading property. */
  plansLoading: boolean;
  /** Update plan property. */
  updatePlan: (planId: string, data: Record<string, unknown>) => Promise<unknown>;
  /** Delete plan property. */
  deletePlan: (planId: string) => Promise<void>;
  /** Create plan property. */
  createPlan: (body: { name: string; [key: string]: unknown }) => Promise<unknown>;
  /** Duplicate plan property. */
  duplicatePlan: (plan: PlanData) => Promise<unknown>;

  // Checkouts
  rawCheckouts: CheckoutData[];
  /** Create checkout property. */
  createCheckout: (body: Record<string, unknown>) => Promise<unknown>;
  /** Duplicate checkout property. */
  duplicateCheckout: (id: string) => Promise<unknown>;
  /** Delete checkout property. */
  deleteCheckout: (id: string) => Promise<void>;
  /** Sync checkout links property. */
  syncCheckoutLinks: (checkoutId: string, planIds: string[]) => Promise<unknown>;

  // Coupons
  COUPONS: CouponData[];
  /** Coupons loading property. */
  couponsLoading: boolean;
  /** Load coupons property. */
  loadCoupons: () => Promise<unknown>;

  // Order bumps
  bumps: BumpData[];
  /** Create bump property. */
  createBump: (body: { [key: string]: unknown }) => Promise<unknown>;

  // Navigation
  openCheckoutEditor: (focus: string, planId?: string | null) => void;
  /** Set modal property. */
  setModal: (v: string | null) => void;
  /** Copied property. */
  copied: string | null;
  /** Cp property. */
  cp: (text: string, id: string) => void;
  /** Flash action feedback property. */
  flashActionFeedback: (id: string) => void;

  // Props passthrough
  initialFocus?: string;
  /** Initial com sub property. */
  initialComSub?: string;
  /** Router property. */
  router: AppRouterInstance;
}

const ProductNerveCenterContext = createContext<ProductNerveCenterContextValue | null>(null);

/** Product nerve center provider. */
export function ProductNerveCenterProvider({
  value,
  children,
}: {
  value: ProductNerveCenterContextValue;
  children: React.ReactNode;
}) {
  return (
    <ProductNerveCenterContext.Provider value={value}>
      {children}
    </ProductNerveCenterContext.Provider>
  );
}

/** Use nerve center context. */
export function useNerveCenterContext(): ProductNerveCenterContextValue {
  const ctx = useContext(ProductNerveCenterContext);
  if (!ctx) {
    throw kloelError('useNerveCenterContext must be used inside ProductNerveCenterProvider');
  }
  return ctx;
}
