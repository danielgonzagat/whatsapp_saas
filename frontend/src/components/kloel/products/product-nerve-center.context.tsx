'use client';

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

export interface ProductNerveCenterContextValue {
  // Identity
  productId: string;

  // Product data
  p: Record<string, unknown> & { name?: string; id?: string };
  refreshProduct: () => Promise<void>;
  updateProduct: (id: string, body: Record<string, unknown>) => Promise<unknown>;

  // Plans
  rawPlans: PlanData[];
  PLANS: ProductEditorPlanView[];
  plansLoading: boolean;
  updatePlan: (planId: string, data: Record<string, unknown>) => Promise<unknown>;
  deletePlan: (planId: string) => Promise<void>;
  createPlan: (body: { name: string; [key: string]: unknown }) => Promise<unknown>;
  duplicatePlan: (plan: PlanData) => Promise<unknown>;

  // Checkouts
  rawCheckouts: CheckoutData[];
  createCheckout: (body: Record<string, unknown>) => Promise<unknown>;
  duplicateCheckout: (id: string) => Promise<unknown>;
  deleteCheckout: (id: string) => Promise<void>;
  syncCheckoutLinks: (checkoutId: string, planIds: string[]) => Promise<unknown>;

  // Coupons
  COUPONS: CouponData[];
  couponsLoading: boolean;
  loadCoupons: () => Promise<unknown>;

  // Order bumps
  bumps: BumpData[];
  createBump: (body: { [key: string]: unknown }) => Promise<unknown>;

  // Navigation
  openCheckoutEditor: (focus: string, planId?: string | null) => void;
  setModal: (v: string | null) => void;
  copied: string | null;
  cp: (text: string, id: string) => void;
  flashActionFeedback: (id: string) => void;

  // Props passthrough
  initialFocus?: string;
  initialComSub?: string;
  router: AppRouterInstance;
}

const ProductNerveCenterContext = createContext<ProductNerveCenterContextValue | null>(null);

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

export function useNerveCenterContext(): ProductNerveCenterContextValue {
  const ctx = useContext(ProductNerveCenterContext);
  if (!ctx) {
    throw new Error('useNerveCenterContext must be used inside ProductNerveCenterProvider');
  }
  return ctx;
}
