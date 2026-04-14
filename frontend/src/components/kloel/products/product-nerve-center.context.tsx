'use client';

import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { createContext, useContext } from 'react';
import type { ProductEditorPlanView } from './product-nerve-center.view-models';

export interface ProductNerveCenterContextValue {
  // Identity
  productId: string;

  // Product data
  p: any;
  refreshProduct: () => Promise<void>;
  updateProduct: (id: string, body: any) => Promise<any>;

  // Plans
  rawPlans: any[];
  PLANS: ProductEditorPlanView[];
  plansLoading: boolean;
  updatePlan: (planId: string, data: any) => Promise<any>;
  deletePlan: (planId: string) => Promise<void>;
  createPlan: (body: any) => Promise<any>;
  duplicatePlan: (plan: any) => Promise<any>;

  // Checkouts
  rawCheckouts: any[];
  createCheckout: (body: any) => Promise<any>;
  duplicateCheckout: (id: string) => Promise<any>;
  deleteCheckout: (id: string) => Promise<void>;
  syncCheckoutLinks: (checkoutId: string, planIds: string[]) => Promise<any>;

  // Coupons
  COUPONS: any[];
  couponsLoading: boolean;
  loadCoupons: () => Promise<any>;

  // Order bumps
  bumps: any[];
  createBump: (body: any) => Promise<any>;

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
  if (!ctx) throw new Error('useNerveCenterContext must be used inside ProductNerveCenterProvider');
  return ctx;
}
