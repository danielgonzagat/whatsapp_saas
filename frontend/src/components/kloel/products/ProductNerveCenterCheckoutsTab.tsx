'use client';

import { kloelT } from '@/lib/i18n/t';
import { useToast } from '@/components/kloel/ToastProvider';
import { useCheckoutConfig } from '@/hooks/useCheckoutPlans';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import { useEffect, useId, useState } from 'react';
import { useNerveCenterContext } from './product-nerve-center.context';
import {
  Bg,
  Bt,
  Dv,
  Fd,
  IconActionButton,
  M,
  Modal,
  PanelLoadingState,
  Tg,
  V,
  cs,
  formatBrlCents,
  is,
  type JsonRecord,
  type JsonValue,
} from './product-nerve-center.shared';
import type { ProductEditorCheckoutView } from './product-nerve-center.view-models';
import { colors } from '@/lib/design-tokens';

interface ProductNerveCenterCheckoutsTabProps {
  ckEdit: string | null;
  setCkEdit: (value: string | null) => void;
  checkouts: ProductEditorCheckoutView[];
  rawCheckouts: JsonRecord[];
  rawPlans: JsonRecord[];
  copied: string | null;
  onDuplicateCheckout: (checkoutId: string) => void | Promise<void>;
  onDeleteCheckout: (checkoutId: string) => void | Promise<void>;
  onCreateCheckout: () => void | Promise<void>;
  syncCheckoutLinks: (checkoutId: string, planIds: string[]) => Promise<unknown>;
  updatePlan: (planId: string, payload: JsonRecord) => Promise<unknown>;
}

/** Product nerve center checkouts tab. */
import { ProductNerveCenterCheckoutsTab } from "./ProductNerveCenterCheckoutsTab";
