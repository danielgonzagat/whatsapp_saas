'use client';

// PULSE:OK — All writes call mutateProd()/refreshProduct() for SWR cache invalidation. setTimeout calls are UI feedback resets after real API saves, not fake_save facades.

import { MediaPreviewBox } from '@/components/kloel/MediaPreviewBox';
import { useToast } from '@/components/kloel/ToastProvider';
import { ProductUrlsTab } from '@/components/products/ProductUrlsTab';
import { useCheckoutConfig, useCheckoutPlans, useOrderBumps } from '@/hooks/useCheckoutPlans';
import { usePersistentImagePreview } from '@/hooks/usePersistentImagePreview';
import { useProduct, useProductMutations, useProducts } from '@/hooks/useProducts';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import { apiFetch } from '@/lib/api';
import { buildPublicCheckoutEntryUrl, getPrimaryCheckoutLinkForPlan } from '@/lib/checkout-links';
import { readFileAsDataUrl, uploadGenericMedia } from '@/lib/media-upload';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef, useCallback, useMemo, useId } from 'react';
import { mutate } from 'swr';
import { ProductNerveCenterAfterPayTab } from './ProductNerveCenterAfterPayTab';
import { ProductNerveCenterAvalTab } from './ProductNerveCenterAvalTab';
import { ProductNerveCenterCampanhasTab } from './ProductNerveCenterCampanhasTab';
import { ProductNerveCenterCheckoutsTab } from './ProductNerveCenterCheckoutsTab';
import { ProductNerveCenterComissaoTab } from './ProductNerveCenterComissaoTab';
import { ProductNerveCenterCuponsTab } from './ProductNerveCenterCuponsTab';
import { ProductNerveCenterIATab } from './ProductNerveCenterIATab';
import { ProductNerveCenterLinksModal } from './ProductNerveCenterLinksModal';
import { ProductNerveCenterPlanosTab } from './ProductNerveCenterPlanosTab';
import {
  type ProductNerveCenterContextValue,
  ProductNerveCenterProvider,
} from './product-nerve-center.context';
import {
  CurrencyStepperField,
  IntegerStepperField,
  PercentStepperField,
  SelectField,
} from './product-nerve-center.inputs';
import {
  Bg,
  Bt,
  Dv,
  Fd,
  M,
  Modal,
  NP,
  PanelLoadingState,
  S,
  SkeletonBlock,
  TabBar,
  Tg,
  V,
  cs,
  formatBrlCents,
  is,
  unwrapApiPayload,
} from './product-nerve-center.shared';
import {
  type ProductEditorPlanView,
  mapProductEditorCheckouts,
  mapProductEditorPlans,
} from './product-nerve-center.view-models';

const D_RE = /[^\d,.-]/g;
const D_3___D_RE = /\.(?=\d{3}(\D|$))/g;
const D_RE_2 = /\D/g;

/* ═══════════════════════════════════════════════════
   V — KLOEL Terminator palette (Nerve Center)
   ═══════════════════════════════════════════════════ */
const R$ = formatBrlCents;
const _parseCurrencyInput = (value: string) => {
  const normalized = String(value || '')
    .replace(D_RE, '')
    .replace(D_3___D_RE, '')
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};
const _formatCurrencyMask = (value: string) => {
  const digits = String(value || '').replace(D_RE_2, '');
  const cents = Number(digits || '0');
  return cents.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};
const _sanitizePositiveInteger = (value: string, fallback = 1) => {
  const parsed = Number.parseInt(String(value || '').replace(D_RE_2, ''), 10);
  return String(Number.isFinite(parsed) && parsed > 0 ? parsed : fallback);
};
const INSTALLMENT_OPTIONS = Array.from({ length: 12 }, (_, index) => String(index + 1));
const _SHIPPING_LABELS: Record<string, string> = {
  NONE: 'Sem frete',
  FREE: 'Frete grátis',
  FIXED: 'Frete fixo',
  VARIABLE: 'Frete variável',
};
const PLAN_SHIPPING_OPTIONS = [
  { value: 'FREE', label: 'Frete grátis' },
  { value: 'FIXED', label: 'Frete fixo' },
  { value: 'VARIABLE', label: 'Frete variável' },
] as const;
const COMMISSION_TYPE_OPTIONS = [
  { value: 'AMOUNT', label: 'Valor (R$)' },
  { value: 'PERCENT', label: 'Porcentagem (%)' },
] as const;

const normalizeZipCodeInput = (value: string) => {
  const digits = String(value || '')
    .replace(D_RE_2, '')
    .slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
};

const parsePercentValue = (value: string, fallback = 1) => {
  const parsed = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatPlanRangeLabel = (plans: Array<{ priceInCents?: number }>) => {
  const values = (plans || [])
    .map((plan) => Number(plan?.priceInCents || 0))
    .filter((value) => value > 0)
    .sort((left, right) => left - right);

  if (values.length === 0) return 'Sem planos';
  if (values[0] === values[values.length - 1]) return R$(values[0]);
  return `${R$(values[0])} ate ${R$(values[values.length - 1])}`;
};

const buildPlanSelectionPriceLabel = (plan: { priceInCents?: number }) => {
  const cents = Math.max(0, Math.round(Number(plan?.priceInCents || 0)));
  return R$(cents);
};

const usePrefersReducedMotion = () => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncPreference = () => setPrefersReducedMotion(mediaQuery.matches);

    syncPreference();
    mediaQuery.addEventListener?.('change', syncPreference);
    return () => mediaQuery.removeEventListener?.('change', syncPreference);
  }, []);

  return prefersReducedMotion;
};

/* ═══════════════════════════════════════════════════
   PLACEHOLDER DATA — empty arrays until backend endpoints
   are connected. Replace with real API calls.
   ═══════════════════════════════════════════════════ */

// Checkout mock removed — using real plan data from useCheckoutPlans

// Affiliates: GET /api/products/:id/affiliates — uses /affiliate endpoints
// Coproducers: managed through /products/:id/commissions with role COPRODUCER
// Campaigns: GET /api/products/:id/campaigns — uses campaigns API

/* ═══════════════════════════════════════════════════
   PROPS
   ═══════════════════════════════════════════════════ */
interface ProductData {
  name?: string;
  description?: string;
  category?: string;
  price?: number;
  imageUrl?: string;
  format?: string;
  active?: boolean;
  tags?: string | string[];
  slug?: string;
  warrantyDays?: number;
  salesPageUrl?: string;
  thankyouUrl?: string;
  thankyouPixUrl?: string;
  thankyouBoletoUrl?: string;
  reclameAquiUrl?: string;
  supportEmail?: string;
  [key: string]: unknown;
}

interface PlanData {
  id: string;
  name?: string;
  priceInCents?: number;
  quantity?: number;
  maxInstallments?: number;
  sales?: number;
  checkoutConfig?: Record<string, unknown>;
  compareAtPrice?: number;
  shippingPrice?: number;
  freeShipping?: boolean;
  [key: string]: unknown;
}

interface CheckoutData {
  id: string;
  checkoutLinks?: Array<{
    planId?: string;
    plan?: { id?: string };
    isActive?: boolean;
    slug?: string;
    referenceCode?: string;
  }>;
  [key: string]: unknown;
}

interface CouponData {
  id: string;
  code?: string;
  discountType?: string;
  discountValue?: number;
  usedCount?: number;
  maxUses?: number;
  active?: boolean;
  expiresAt?: string;
}

interface BumpData {
  id: string;
  title?: string;
  productName?: string;
  description?: string;
  priceInCents?: number;
  compareAtPrice?: number;
  active?: boolean;
}

interface CheckoutProductData {
  id: string;
  name?: string;
  slug?: string;
  description?: string;
  images?: string[];
  imageUrl?: string;
  category?: string;
  price?: number;
  plans?: PlanData[];
}

interface ProductNerveCenterProps {
  productId: string;
  onBack: () => void;
  initialTab?: string;
  initialPlanSub?: string;
  initialComSub?: string;
  initialModal?: string;
  initialFocus?: string;
}

/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════ */
export default function ProductNerveCenter({
  productId,
  onBack,
  initialTab,
  initialPlanSub,
  initialComSub,
  initialModal,
  initialFocus,
}: ProductNerveCenterProps) {
  const fid = useId();
  const router = useRouter();
  const { showToast } = useToast();
  const { isMobile } = useResponsiveViewport();
  const prefersReducedMotion = usePrefersReducedMotion();
  const rootShellPadding = isMobile
    ? '16px 16px calc(env(safe-area-inset-bottom, 0px) + 40px)'
    : '28px 28px 48px';
  const tabContentBottomGutter = isMobile
    ? 'calc(env(safe-area-inset-bottom, 0px) + 96px)'
    : '120px';
  /* ── data hooks ── */
  const { product: rawProduct, isLoading: prodLoading, mutate: mutateProd } = useProduct(productId);
  const { products: workspaceProductsRaw } = useProducts();
  const p = (rawProduct || {}) as ProductData;
  const { updateProduct } = useProductMutations();
  const {
    plans: rawPlans,
    checkouts: rawCheckouts,
    isLoading: plansLoading,
    createPlan,
    deletePlan,
    duplicatePlan,
    updatePlan,
    createCheckout,
    duplicateCheckout,
    deleteCheckout,
    syncCheckoutLinks,
  } = useCheckoutPlans(rawProduct);
  const [workspaceCheckoutProducts, setWorkspaceCheckoutProducts] = useState<CheckoutProductData[]>(
    [],
  );
  const [workspaceCheckoutProductsLoading, setWorkspaceCheckoutProductsLoading] = useState(false);

  /* ── navigation state ── */
  const [tab, setTab] = useState(initialTab || 'dados');
  const [selPlan, setSelPlan] = useState<string | null>(null);
  const [planSub, setPlanSub] = useState(initialPlanSub || 'loja');
  const [copied, setCopied] = useState<string | null>(null);
  const [modal, setModal] = useState<string | null>(initialModal || null);
  const [productSaved, setProductSaved] = useState(false);
  const [ckEdit, setCkEdit] = useState<string | null>(null);

  /* ── plan detail editing state (lifted to survive parent re-renders) ── */
  const {
    config: planCheckoutConfig,
    updateConfig: updatePlanCheckoutConfig,
    isLoading: planCheckoutLoading,
  } = useCheckoutConfig(selPlan);
  const [planName, setPlanName] = useState('');
  const [planPriceCents, setPlanPriceCents] = useState(0);
  const [planQty, setPlanQty] = useState(1);
  const [planInst, setPlanInst] = useState(1);
  const [planShippingMode, setPlanShippingMode] = useState('FREE');
  const [planFixedShippingCents, setPlanFixedShippingCents] = useState(0);
  const [planOriginZip, setPlanOriginZip] = useState('');
  const [planShippingRangeMinCents, setPlanShippingRangeMinCents] = useState(0);
  const [planShippingRangeMaxCents, setPlanShippingRangeMaxCents] = useState(0);
  const [planUseKloelShipping, setPlanUseKloelShipping] = useState(false);
  const [planVisible, setPlanVisible] = useState(true);
  const [planImageUrl, setPlanImageUrl] = useState('');
  const [planImagePreviewUrl, setPlanImagePreviewUrl] = useState('');
  const [planImageUploading, setPlanImageUploading] = useState(false);
  const [planImageCleared, setPlanImageCleared] = useState(false);
  const [planCustomCommission, setPlanCustomCommission] = useState(false);
  const [planCommissionType, setPlanCommissionType] = useState('PERCENT');
  const [planCommissionAmountCents, setPlanCommissionAmountCents] = useState(0);
  const [planCommissionPercent, setPlanCommissionPercent] = useState('30');
  const [planPaymentConfig, setPlanPaymentConfig] = useState({
    enableCreditCard: true,
    enablePix: true,
    enableBoleto: false,
    enableCoupon: true,
    showCouponPopup: false,
    autoCouponCode: '',
  });
  const [planSaving, setPlanSaving] = useState(false);
  const [planSaved, setPlanSaved] = useState(false);
  const [planError, setPlanError] = useState('');
  const planConfigInitRef = useRef(false);

  /* ── edit form state (Dados tab) ── */
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editWarranty, setEditWarranty] = useState(7);
  const [editSalesUrl, setEditSalesUrl] = useState('');
  const [editThankUrl, setEditThankUrl] = useState('');
  const [editThankPix, setEditThankPix] = useState('');
  const [editThankBoleto, setEditThankBoleto] = useState('');
  const [editReclame, setEditReclame] = useState('');
  const [editSupportEmail, setEditSupportEmail] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [editFormat, setEditFormat] = useState('DIGITAL');
  const [saving, setSaving] = useState(false);
  const imgStorageKey = `kloel_edit_img_${productId}`;
  const [editImageUrl, setEditImageUrl] = useState('');
  const [imageCleared, setImageCleared] = useState(false);
  const [imgUploading, setImgUploading] = useState(false);
  const userChangedImage = useRef(false);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const {
    previewUrl: editPreviewUrl,
    hasLocalPreview,
    clearPreview: clearEditPreview,
    setPreviewUrl: setEditPreviewUrl,
  } = usePersistentImagePreview({ storageKey: imgStorageKey });

  useEffect(() => {
    if (hasLocalPreview) {
      userChangedImage.current = true;
    }
  }, [hasLocalPreview]);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  /* ── URLs state ── */
  const [urls, setUrls] = useState<Array<Record<string, unknown>>>([]);
  const [_urlsLoading, setUrlsLoading] = useState(false);

  const [coupons, setCoupons] = useState<CouponData[]>([]);
  const [couponsLoading, setCouponsLoading] = useState(false);

  /* ── Order bumps for selected plan ── */
  const { bumps, createBump } = useOrderBumps(selPlan);

  /* ── New plan form ── */
  const [newPlanName, setNewPlanName] = useState('');
  const [newPlanPriceCents, setNewPlanPriceCents] = useState(0);
  const [newPlanQty, setNewPlanQty] = useState(1);
  const [newPlanInst, setNewPlanInst] = useState(12);

  /* ── New coupon form ── */
  const [newCouponCode, setNewCouponCode] = useState('');
  const [newCouponType, setNewCouponType] = useState('%');
  const [newCouponVal, setNewCouponVal] = useState('');
  const [newCouponMax, setNewCouponMax] = useState('');
  const [newCouponExpiresAt, setNewCouponExpiresAt] = useState('');

  /* ── New bump form ── */
  const [newBumpProductId, setNewBumpProductId] = useState('');
  const [newBumpPlanId, setNewBumpPlanId] = useState('');

  /* ── Sync form from product data ── */
  useEffect(() => {
    if (p?.name) {
      setEditName(p.name || '');
      setEditDesc(p.description || '');
      setEditCategory(p.category || '');
      setEditTags(Array.isArray(p.tags) ? p.tags.join(', ') : p.tags || '');
      setEditWarranty(Math.max(7, Number(p.warrantyDays || 7)));
      setEditSalesUrl(p.salesPageUrl || '');
      setEditThankUrl(p.thankyouUrl || '');
      setEditThankPix(p.thankyouPixUrl || '');
      setEditThankBoleto(p.thankyouBoletoUrl || '');
      setEditReclame(p.reclameAquiUrl || '');
      setEditSupportEmail(p.supportEmail || '');
      setEditActive(p.active !== false);
      setEditFormat(p.format || 'DIGITAL');
      if (!userChangedImage.current && !hasLocalPreview) {
        const persistedImageUrl = p.imageUrl || '';
        setEditImageUrl((current) => persistedImageUrl || current || '');
        setImageCleared(false);
      }
    }
  }, [
    p?.id,
    p?.name,
    p?.description,
    p?.category,
    p?.tags,
    p?.warrantyDays,
    p?.salesPageUrl,
    p?.thankyouUrl,
    p?.thankyouPixUrl,
    p?.thankyouBoletoUrl,
    p?.reclameAquiUrl,
    p?.supportEmail,
    p?.active,
    p?.imageUrl,
    p?.format,
    hasLocalPreview,
  ]);

  useEffect(() => {
    if (!productId) return;
    setWorkspaceCheckoutProductsLoading(true);
    apiFetch('/checkout/products')
      .then((response: unknown) => {
        const data = unwrapApiPayload<CheckoutProductData[]>(response);
        setWorkspaceCheckoutProducts(Array.isArray(data) ? data : []);
      })
      .catch(() => setWorkspaceCheckoutProducts([]))
      .finally(() => setWorkspaceCheckoutProductsLoading(false));
  }, [productId]);

  /* ── Fetch URLs on tab ── */
  useEffect(() => {
    if (tab === 'urls' && productId) {
      setUrlsLoading(true);
      apiFetch(`/products/${productId}/urls`)
        .then((res) => {
          const d = (res?.data ?? res) as
            | { urls?: Record<string, unknown>[] }
            | Record<string, unknown>[];
          setUrls(
            Array.isArray(d)
              ? (d as Record<string, unknown>[])
              : (d as { urls?: Record<string, unknown>[] })?.urls || [],
          );
        })
        .catch(() => setUrls([]))
        .finally(() => setUrlsLoading(false));
    }
  }, [tab, productId]);

  const loadCoupons = useCallback(() => {
    if (!productId) return Promise.resolve([]);
    setCouponsLoading(true);
    return apiFetch(`/products/${productId}/coupons`)
      .then((res: unknown) => {
        const data = unwrapApiPayload<CouponData[]>(res);
        const nextCoupons = Array.isArray(data) ? data : [];
        setCoupons(nextCoupons);
        return nextCoupons;
      })
      .catch(() => {
        setCoupons([]);
        return [];
      })
      .finally(() => setCouponsLoading(false));
  }, [productId]);

  useEffect(() => {
    if (tab !== 'cupons' || !productId) return;
    void loadCoupons();
  }, [tab, productId, loadCoupons]);

  const refreshProduct = useCallback(async () => {
    await mutateProd();
  }, [mutateProd]);

  /* ── Mapped plans ── */
  const PLANS = useMemo(() => mapProductEditorPlans(rawPlans), [rawPlans]);

  /* ── Mapped checkouts ── */
  const CKS = useMemo(() => mapProductEditorCheckouts(rawCheckouts), [rawCheckouts]);

  /* ── Mapped coupons ── */
  const COUPONS = coupons.map((c) => ({
    id: c.id,
    code: c.code || '',
    type: c.discountType === 'FIXED' ? 'R$' : '%',
    val: c.discountValue || 0,
    used: c.usedCount || 0,
    max: c.maxUses || null,
    on: c.active !== false,
    expiresAt: c.expiresAt || null,
  }));

  useEffect(() => {
    const needsPlanContext =
      initialTab === 'planos' && (!!initialPlanSub || initialModal === 'newBump');
    if (!needsPlanContext || selPlan || PLANS.length === 0) return;
    setSelPlan(PLANS[0].id);
  }, [initialTab, initialPlanSub, initialModal, selPlan, PLANS]);

  /* ── Plan detail state sync (lifted from PlanDetail) ── */
  const selectedPlanObj = selPlan ? PLANS.find((p) => p.id === selPlan) : null;
  const currentPlanRaw: PlanData = selPlan
    ? ((rawPlans || []) as PlanData[]).find((c) => c.id === selPlan) || ({} as PlanData)
    : ({} as PlanData);

  useEffect(() => {
    if (!selectedPlanObj) return;
    setPlanName(selectedPlanObj.name);
    setPlanPriceCents(selectedPlanObj.price);
    setPlanQty(Math.max(1, selectedPlanObj.qty));
    setPlanInst(Math.max(1, selectedPlanObj.inst));
    setPlanShippingMode(
      selectedPlanObj.freeShip ? 'FREE' : currentPlanRaw.shippingPrice ? 'FIXED' : 'FREE',
    );
    setPlanFixedShippingCents(Math.max(0, Number(currentPlanRaw.shippingPrice || 0)));
    setPlanVisible(selectedPlanObj.vis);
    setPlanError('');
    planConfigInitRef.current = false;
  }, [
    selectedPlanObj?.id,
    selectedPlanObj?.name,
    selectedPlanObj?.price,
    selectedPlanObj?.qty,
    selectedPlanObj?.inst,
    selectedPlanObj?.freeShip,
    selectedPlanObj?.vis,
    currentPlanRaw.shippingPrice,
  ]);

  useEffect(() => {
    if (!planCheckoutConfig) return;
    if (planConfigInitRef.current) return;
    planConfigInitRef.current = true;
    setPlanPaymentConfig({
      enableCreditCard: planCheckoutConfig.enableCreditCard !== false,
      enablePix: planCheckoutConfig.enablePix !== false,
      enableBoleto: !!planCheckoutConfig.enableBoleto,
      enableCoupon: planCheckoutConfig.enableCoupon !== false,
      showCouponPopup: !!planCheckoutConfig.showCouponPopup,
      autoCouponCode: String(planCheckoutConfig.autoCouponCode || '').toUpperCase(),
    });
    setPlanImageUrl(
      String(planCheckoutConfig.productImage || currentPlanRaw?.checkoutConfig?.productImage || ''),
    );
    setPlanImagePreviewUrl('');
    setPlanImageCleared(false);
    setPlanShippingMode(
      String(
        planCheckoutConfig.shippingMode ||
          (selectedPlanObj?.freeShip ? 'FREE' : currentPlanRaw.shippingPrice ? 'FIXED' : 'FREE'),
      ),
    );
    setPlanOriginZip(normalizeZipCodeInput(String(planCheckoutConfig.shippingOriginZip || '')));
    setPlanShippingRangeMinCents(
      Math.max(0, Number(planCheckoutConfig.shippingVariableMinInCents || 0)),
    );
    setPlanShippingRangeMaxCents(
      Math.max(0, Number(planCheckoutConfig.shippingVariableMaxInCents || 0)),
    );
    setPlanUseKloelShipping(Boolean(planCheckoutConfig.shippingUseKloelCalculator));
    setPlanCustomCommission(Boolean(planCheckoutConfig.affiliateCustomCommissionEnabled));
    setPlanCommissionType(String(planCheckoutConfig.affiliateCustomCommissionType || 'PERCENT'));
    setPlanCommissionAmountCents(
      Math.max(0, Number(planCheckoutConfig.affiliateCustomCommissionAmountInCents || 0)),
    );
    setPlanCommissionPercent(
      String(
        planCheckoutConfig.affiliateCustomCommissionPercent ?? p.commissionPercent ?? 30,
      ).replace('.', ','),
    );
  }, [planCheckoutConfig]);

  useEffect(() => {
    if (planSub !== 'pagamento' || !productId) return;
    void loadCoupons();
  }, [planSub, productId, loadCoupons]);

  const selectedPlanCoupon = useMemo(
    () => COUPONS.find((coupon) => coupon.code === planPaymentConfig.autoCouponCode),
    [COUPONS, planPaymentConfig.autoCouponCode],
  );
  const patchPlanPaymentConfig = useCallback(
    (patch: Partial<typeof planPaymentConfig>) =>
      setPlanPaymentConfig((prev) => ({ ...prev, ...patch })),
    [],
  );

  /* ── Mapped URLs ── */
  const _URLS = urls.map((u) => ({
    id: String(u?.id ?? ''),
    desc: String(u?.description ?? u?.label ?? ''),
    url: String(u?.url ?? ''),
    sales: Number(u?.salesCount ?? 0),
  }));

  const recommendedProducts = useMemo(() => {
    const currentTags = new Set(
      String(Array.isArray(p.tags) ? p.tags.join(',') : p.tags || '')
        .split(',')
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    );
    const currentCategory = String(p.category || '').toLowerCase();

    return ((workspaceProductsRaw as ProductData[]) || [])
      .filter((candidate) => candidate?.id && candidate.id !== productId)
      .map((candidate) => {
        const candidateTags = String(
          Array.isArray(candidate.tags) ? candidate.tags.join(',') : candidate.tags || '',
        )
          .split(',')
          .map((tag) => tag.trim().toLowerCase())
          .filter(Boolean);
        const sharedTags = candidateTags.filter((tag) => currentTags.has(tag)).length;
        const sameCategory =
          currentCategory && String(candidate.category || '').toLowerCase() === currentCategory
            ? 2
            : 0;
        const higherTicket = Number(candidate.price || 0) >= Number(p.price || 0) ? 1 : 0;
        return {
          ...candidate,
          score: sharedTags * 2 + sameCategory + higherTicket,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }, [workspaceProductsRaw, productId, p.tags, p.category, p.price]);

  /* ── Helpers ── */
  const cp = (t: string, id: string) => {
    navigator.clipboard?.writeText(t);
    setCopied(id);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(null), 2000);
  };

  const flashActionFeedback = useCallback((id: string) => {
    setCopied(id);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(null), 2000);
  }, []);

  const handleDuplicatePlan = useCallback(
    async (planId: string) => {
      const sourcePlan = ((rawPlans || []) as PlanData[]).find(
        (candidate) => candidate.id === planId,
      );
      if (!sourcePlan?.name) return;

      try {
        await duplicatePlan({
          ...sourcePlan,
          name: sourcePlan.name,
        });
        flashActionFeedback(`duplicate-${planId}`);
      } catch (error) {
        console.error(error);
      }
    },
    [duplicatePlan, flashActionFeedback, rawPlans],
  );

  const handleDuplicateCheckout = useCallback(
    async (checkoutId: string) => {
      try {
        await duplicateCheckout(checkoutId);
        flashActionFeedback(`duplicate-${checkoutId}`);
      } catch (error) {
        console.error(error);
      }
    },
    [duplicateCheckout, flashActionFeedback],
  );

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (initialPlanSub) setPlanSub(initialPlanSub);
  }, [initialPlanSub]);

  useEffect(() => {
    setModal(initialModal || null);
  }, [initialModal]);

  useEffect(() => {
    if (
      !['checkout-appearance', 'payment-widget'].includes(initialFocus || '') ||
      tab !== 'checkouts' ||
      ckEdit ||
      !PLANS[0]?.id
    )
      return;
    setCkEdit(PLANS[0].id);
  }, [initialFocus, tab, ckEdit, PLANS]);

  const handleImageUpload = async (file: File) => {
    userChangedImage.current = true;
    setImageCleared(false);
    const dataUrl = await readFileAsDataUrl(file);
    setEditPreviewUrl(dataUrl);
    setImgUploading(true);
    try {
      const uploadedUrl = await uploadGenericMedia(file, { folder: 'products' });
      if (uploadedUrl) {
        setEditImageUrl(uploadedUrl);
      }
    } catch (e) {
      console.error('Image upload failed:', e);
    } finally {
      setImgUploading(false);
    }
  };

  const handlePlanImageUpload = async (file: File) => {
    setPlanImageCleared(false);
    const dataUrl = await readFileAsDataUrl(file);
    setPlanImagePreviewUrl(dataUrl);
    setPlanImageUploading(true);
    try {
      const uploadedUrl = await uploadGenericMedia(file, { folder: 'plans' });
      if (uploadedUrl) {
        setPlanImageUrl(uploadedUrl);
      }
    } catch (error) {
      console.error('Plan image upload failed:', error);
      showToast('Erro ao enviar imagem do plano', 'error');
    } finally {
      setPlanImageUploading(false);
    }
  };

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await updateProduct(productId, {
        name: editName,
        description: editDesc,
        category: editCategory,
        tags: editTags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        format: editFormat,
        warrantyDays: Math.max(7, Number(editWarranty || 7)),
        salesPageUrl: editSalesUrl,
        thankyouUrl: editThankUrl,
        thankyouPixUrl: editThankPix,
        thankyouBoletoUrl: editThankBoleto,
        reclameAquiUrl: editReclame,
        supportEmail: editSupportEmail,
        active: editActive,
        imageUrl: imageCleared ? null : editImageUrl || undefined,
      });
      await mutateProd();
      clearEditPreview();
      userChangedImage.current = false;
      setImageCleared(false);
      setProductSaved(true);
      // PULSE:OK — UI feedback reset after mutateProd() confirms the real product save.
      setTimeout(() => setProductSaved(false), 2000);
      showToast('Produto salvo', 'success');
    } catch (e) {
      console.error('Save error:', e);
      showToast(e instanceof Error ? e.message : 'Erro ao salvar produto', 'error');
    } finally {
      setSaving(false);
    }
  }, [
    productId,
    editName,
    editDesc,
    editCategory,
    editTags,
    editFormat,
    editWarranty,
    editSalesUrl,
    editThankUrl,
    editThankPix,
    editThankBoleto,
    editReclame,
    editSupportEmail,
    editActive,
    editImageUrl,
    imageCleared,
    updateProduct,
    mutateProd,
    clearEditPreview,
    showToast,
  ]);

  // stubSave removed — all save handlers now call real API

  /* ── Create plan handler ── */
  const handleCreatePlan = async () => {
    if (!newPlanName) return;
    const parsedPriceInCents = Math.max(0, Math.round(newPlanPriceCents));
    const quantity = Math.max(1, Math.round(Number(newPlanQty || 1)));
    const maxInstallments = Math.min(12, Math.max(1, Math.round(Number(newPlanInst || 12))));
    const res = (await createPlan({
      name: newPlanName,
      priceInCents: parsedPriceInCents > 0 ? parsedPriceInCents : getFallbackPlanPriceInCents(),
      quantity,
      maxInstallments,
      brandName: editName || p.name || newPlanName,
    })) as { id?: string; data?: { id?: string } } | null;
    const createdPlanId = res?.id || res?.data?.id || null;
    if (createdPlanId) {
      setSelPlan(createdPlanId);
      setPlanSub('loja');
    }
    setNewPlanName('');
    setNewPlanPriceCents(0);
    setNewPlanQty(1);
    setNewPlanInst(12);
    setModal(null);
  };

  /* ── Create coupon handler ── */
  const handleCreateCoupon = async () => {
    if (!newCouponCode) return;
    try {
      await unwrapApiPayload(
        await apiFetch(`/products/${productId}/coupons`, {
          method: 'POST',
          body: {
            code: newCouponCode.toUpperCase(),
            discountType: newCouponType === 'R$' ? 'FIXED' : 'PERCENT',
            discountValue: Number.parseFloat(newCouponVal || '0') || 0,
            maxUses: newCouponMax ? Number.parseInt(newCouponMax, 10) : undefined,
            expiresAt: newCouponExpiresAt || undefined,
          },
        }),
      );
      mutate((key: unknown) => typeof key === 'string' && key.startsWith('/products'));
      setNewCouponCode('');
      setNewCouponVal('');
      setNewCouponMax('');
      setNewCouponExpiresAt('');
      await loadCoupons();
      setModal(null);
      showToast('Cupom criado', 'success');
    } catch (e) {
      console.error(e);
      showToast(e instanceof Error ? e.message : 'Erro ao criar cupom', 'error');
    }
  };

  const handleDeleteCoupon = async (couponId: string) => {
    if (!confirm('Excluir cupom deste produto?')) return;
    await unwrapApiPayload(
      await apiFetch(`/products/${productId}/coupons/${couponId}`, {
        method: 'DELETE',
      }),
    );
    await loadCoupons();
  };

  /* ── Create bump handler ── */
  const handleCreateBump = async () => {
    const selectedCheckoutProduct = workspaceCheckoutProducts.find(
      (product) => product.id === newBumpProductId,
    );
    const selectedBumpPlan = (selectedCheckoutProduct?.plans || []).find(
      (plan) => plan.id === newBumpPlanId,
    );
    if (!selectedCheckoutProduct || !selectedBumpPlan) return;
    try {
      await createBump({
        title: selectedBumpPlan.name || selectedCheckoutProduct.name,
        description: `Oferta adicional do plano ${selectedBumpPlan.name || selectedCheckoutProduct.name}.`,
        productName: selectedCheckoutProduct.name || selectedBumpPlan.name,
        image:
          selectedBumpPlan.checkoutConfig?.productImage ||
          selectedCheckoutProduct.imageUrl ||
          selectedCheckoutProduct.images?.[0] ||
          undefined,
        priceInCents: Math.max(0, Math.round(Number(selectedBumpPlan.priceInCents || 0))),
        compareAtPrice: selectedBumpPlan.compareAtPrice || undefined,
        checkboxLabel: 'Sim, eu quero!',
      });
      setNewBumpProductId('');
      setNewBumpPlanId('');
      setModal(null);
      showToast('Order bump criado', 'success');
    } catch (e) {
      console.error(e);
      showToast(e instanceof Error ? e.message : 'Erro ao criar order bump', 'error');
    }
  };

  const getFallbackPlanPriceInCents = useCallback(() => {
    const productPrice = Math.round(Number(p.price || 0) * 100);
    if (productPrice > 0) return productPrice;

    const existingPlanPrice = Number(rawPlans?.[0]?.priceInCents || 0);
    if (existingPlanPrice > 0) return existingPlanPrice;

    return 100;
  }, [p.price, rawPlans]);
  const currentImageUrl = editPreviewUrl || editImageUrl || (!imageCleared ? p.imageUrl : '');
  const primaryPlan = PLANS[0] || null;
  const primaryPlanId = primaryPlan?.id || null;
  const primaryCheckoutConfig =
    ((rawPlans || []) as PlanData[]).find((pl) => pl.id === primaryPlanId)?.checkoutConfig || {};

  const openCheckoutEditor = useCallback(
    (focus: string, planId?: string | null) => {
      const targetPlanId = planId || primaryPlanId;
      if (!targetPlanId) {
        setTab('checkouts');
        showToast('Crie um checkout para configurar este bloco.', 'error');
        return;
      }

      const linkedCheckoutId =
        ((rawCheckouts || []) as CheckoutData[]).find((checkoutCandidate) =>
          Array.isArray(checkoutCandidate?.checkoutLinks)
            ? checkoutCandidate.checkoutLinks.some(
                (link) =>
                  (link?.planId === targetPlanId || link?.plan?.id === targetPlanId) &&
                  link?.isActive !== false,
              )
            : false,
        )?.id ||
        rawCheckouts?.[0]?.id ||
        null;

      setTab('checkouts');
      if (linkedCheckoutId) {
        setCkEdit(linkedCheckoutId);
        return;
      }

      showToast(
        focus === 'coupon'
          ? 'Crie um checkout para aplicar cupons e regras comerciais.'
          : 'Crie um checkout para continuar essa configuração.',
        'error',
      );
    },
    [primaryPlanId, rawCheckouts, showToast],
  );

  const TABS = [
    { k: 'dados', l: 'Dados gerais' },
    { k: 'planos', l: 'Planos' },
    { k: 'checkouts', l: 'Checkouts' },
    { k: 'urls', l: 'Urls' },
    { k: 'comissao', l: 'Comissionamento / Afiliação' },
    { k: 'cupons', l: 'Cupons de Desconto' },
    { k: 'campanhas', l: 'Campanhas' },
    { k: 'avaliacoes', l: 'Avaliações' },
    { k: 'afterpay', l: 'After Pay' },
    { k: 'ia', l: 'IA' },
  ];
  const productPriceLabel = useMemo(() => formatPlanRangeLabel(rawPlans || []), [rawPlans]);
  const orderBumpProductOptions = useMemo(
    () =>
      workspaceCheckoutProducts
        .filter((product) => product?.id)
        .map((product) => ({
          ...product,
          coverImage:
            product.imageUrl ||
            product.images?.find((entry: string) => typeof entry === 'string' && entry.trim()) ||
            '',
          priceLabel: formatPlanRangeLabel(product.plans || []),
        })),
    [workspaceCheckoutProducts],
  );
  const selectedBumpProduct = useMemo(
    () => orderBumpProductOptions.find((product) => product.id === newBumpProductId) || null,
    [orderBumpProductOptions, newBumpProductId],
  );
  const orderBumpPlanOptions = useMemo(() => {
    if (!selectedBumpProduct) return [];
    return (selectedBumpProduct.plans || []).filter((plan) => plan.id !== selPlan);
  }, [selectedBumpProduct, selPlan]);

  /* ═══════════════════════════════════════════════════
     LOADING STATE
     ═══════════════════════════════════════════════════ */
  if (prodLoading) {
    return (
      <div
        style={{
          background: V.void,
          minHeight: '100vh',
          fontFamily: S,
          color: V.t,
          padding: rootShellPadding,
        }}
      >
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <div
            style={{
              display: 'flex',
              alignItems: isMobile ? 'stretch' : 'center',
              flexDirection: isMobile ? 'column' : 'row',
              gap: 10,
              marginBottom: 16,
            }}
          >
            <Bt>← Produtos</Bt>
            <SkeletonBlock width={180} height={12} />
          </div>
          <div
            style={{
              ...cs,
              padding: isMobile ? 16 : 20,
              display: 'flex',
              gap: isMobile ? 14 : 20,
              alignItems: isMobile ? 'flex-start' : 'center',
              flexDirection: isMobile ? 'column' : 'row',
              marginBottom: 20,
            }}
          >
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: 8,
                background: V.e,
                border: `1px solid ${V.b}`,
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1, display: 'grid', gap: 10 }}>
              <SkeletonBlock width="34%" height={14} />
              <SkeletonBlock width="56%" height={11} />
              <SkeletonBlock width="24%" height={11} />
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              gap: 1,
              borderBottom: `1px solid ${V.b}`,
              marginBottom: 20,
              overflow: 'hidden',
            }}
          >
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={`tab-skeleton-${index}`} style={{ padding: '8px 14px' }}>
                <SkeletonBlock width={72} height={10} />
              </div>
            ))}
          </div>
          <PanelLoadingState
            label="Carregando produto"
            description="Mantendo a estrutura do painel montada enquanto os dados comerciais, checkout e automações sincronizam."
          />
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════
     HEADER
     ═══════════════════════════════════════════════════ */
  function renderHeader() {
    const totalSales = PLANS.reduce((s: number, pl) => s + (pl.sales || 0), 0);
    return (
      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            display: 'flex',
            alignItems: isMobile ? 'stretch' : 'center',
            flexDirection: isMobile ? 'column' : 'row',
            gap: 10,
            marginBottom: 16,
          }}
        >
          <Bt onClick={onBack}>← Produtos</Bt>
          <span style={{ fontSize: 13, fontWeight: 600, color: V.t }}>
            {editName || p.name || 'Produto'}
          </span>
          <Bg color={editActive ? V.g : V.r}>{editActive ? 'ACTIVE' : 'INACTIVE'}</Bg>
        </div>
        <div
          style={{
            ...cs,
            borderRadius: isMobile ? 4 : cs.borderRadius,
            padding: isMobile ? 16 : 20,
            display: 'flex',
            gap: isMobile ? 16 : 20,
            alignItems: isMobile ? 'stretch' : 'center',
            flexDirection: isMobile ? 'column' : 'row',
          }}
        >
          <div
            onClick={() => imgInputRef.current?.click()}
            style={{
              width: 80,
              height: 80,
              borderRadius: isMobile ? 6 : 8,
              background: 'rgba(255,255,255,0.03)',
              border: `1px solid ${V.b}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
              padding: 6,
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                (e.currentTarget as HTMLElement).click();
              }
            }}
          >
            {currentImageUrl ? (
              <img
                src={currentImageUrl}
                alt=""
                style={{
                  objectFit: 'contain',
                  maxWidth: '100%',
                  maxHeight: '100%',
                  borderRadius: 4,
                }}
              />
            ) : (
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <svg
                  width={20}
                  height={20}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={V.t3}
                  strokeWidth={1.5}
                  aria-hidden="true"
                >
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                <span style={{ fontSize: 7, color: V.t3, marginTop: 2 }}>Foto</span>
              </span>
            )}
          </div>
          <input
            ref={imgInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImageUpload(f);
              e.target.value = '';
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1
              style={{
                fontSize: isMobile ? 16 : 18,
                fontWeight: 700,
                color: V.t,
                margin: '0 0 4px',
                fontFamily: S,
              }}
            >
              {editName || p.name || 'Produto'}
            </h1>
            <div
              style={{
                display: 'flex',
                gap: 10,
                flexWrap: 'wrap',
                fontSize: 12,
                color: V.t2,
              }}
            >
              <span>{editCategory || p.category || 'Sem categoria'}</span>
              <span style={{ fontFamily: M, fontWeight: 600, color: V.em }}>
                {productPriceLabel}
              </span>
              <span style={{ color: V.t3 }}>·</span>
              <span>
                {PLANS.length} plano{PLANS.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>
          <div style={{ textAlign: isMobile ? 'left' : 'right' }}>
            <span style={{ fontFamily: M, fontSize: 28, fontWeight: 700, color: V.em }}>
              {totalSales}
            </span>
            <span style={{ fontSize: 10, color: V.t3, marginLeft: 4 }}>vendas</span>
            <div
              aria-hidden
              style={{
                marginTop: 8,
                marginLeft: isMobile ? 0 : 'auto',
                width: 68,
                height: 2,
                borderRadius: 999,
                background: 'color-mix(in srgb, var(--app-accent) 34%, transparent)',
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════
     DADOS GERAIS TAB
     ═══════════════════════════════════════════════════ */
  function renderDadosTab() {
    return (
      <div
        style={{
          ...cs,
          borderRadius: isMobile ? 4 : cs.borderRadius,
          padding: isMobile ? 16 : 24,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: isMobile ? 'stretch' : 'center',
            flexDirection: isMobile ? 'column' : 'row',
            gap: 12,
            marginBottom: 20,
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 600, color: V.t, margin: 0 }}>Dados do produto</h2>
          <Bt primary onClick={save}>
            <svg
              width={12}
              height={12}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }}
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {productSaved ? 'Salvo!' : saving ? 'Salvando...' : 'Salvar'}
          </Bt>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            gap: isMobile ? 16 : 20,
            marginBottom: 20,
          }}
        >
          <div style={{ width: isMobile ? '100%' : 200, flexShrink: 0 }}>
            <MediaPreviewBox
              inputAriaLabel="Foto do produto"
              previewUrl={editPreviewUrl}
              fallbackUrl={imageCleared ? '' : editImageUrl || p.imageUrl}
              uploading={imgUploading}
              emptySubtitle="JPG/PNG/GIF · Max 10MB"
              emptyTitle="Arraste ou clique"
              onSelectFile={(file) => {
                void handleImageUpload(file);
              }}
              onClear={() => {
                userChangedImage.current = true;
                clearEditPreview();
                setEditImageUrl('');
                setImageCleared(true);
              }}
              theme={{
                accentColor: V.em,
                borderColor: V.b,
                frameBackground: 'rgba(255,255,255,0.03)',
                labelColor: V.t3,
                mutedColor: V.t3,
                textColor: V.t2,
              }}
              layout={{
                minHeight: 160,
                padding: 12,
                imageMaxWidth: '100%',
                imageMaxHeight: '100%',
                borderRadius: isMobile ? 6 : 8,
              }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Fd label="Nome" value={editName} onChange={setEditName} full />
            <Fd label="Descrição" full>
              <textarea
                style={{ ...is, height: 80, resize: 'vertical' }}
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
              />
            </Fd>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0 20px' }}>
          <Fd label="Categoria" value={editCategory} onChange={setEditCategory} />
          <Fd label="Formato">
            <select style={is} value={editFormat} onChange={(e) => setEditFormat(e.target.value)}>
              <option value="DIGITAL">Digital</option>
              <option value="PHYSICAL">Físico</option>
              <option value="HYBRID">Híbrido</option>
            </select>
          </Fd>
          <Fd label="Tags" value={editTags} onChange={setEditTags} />
          <IntegerStepperField
            label="Garantia (dias)"
            value={editWarranty}
            onChange={setEditWarranty}
            min={7}
            helper="Minimo legal de 7 dias para compras online."
          />
          <Fd label="URL página de vendas" value={editSalesUrl} onChange={setEditSalesUrl} full />
          <Fd label="URL obrigado" value={editThankUrl} onChange={setEditThankUrl} full />
          <Fd label="URL obrigado Pix" value={editThankPix} onChange={setEditThankPix} full />
          <Fd
            label="URL obrigado Boleto"
            value={editThankBoleto}
            onChange={setEditThankBoleto}
            full
          />
          <Fd label="URL Reclame Aqui" value={editReclame} onChange={setEditReclame} full />
          <Fd label="E-mail suporte" value={editSupportEmail} onChange={setEditSupportEmail} />
        </div>

        <Tg label="Disponível para venda?" checked={editActive} onChange={setEditActive} />
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════
     PLAN DETAIL — render function (pure, no hooks — state lives in parent)
     ═══════════════════════════════════════════════════ */
  function renderPlanDetailContent(plan: ProductEditorPlanView) {
    const primaryPlanCheckoutLink = getPrimaryCheckoutLinkForPlan(plan);
    const planPublicCheckoutUrl = primaryPlanCheckoutLink
      ? buildPublicCheckoutEntryUrl(
          primaryPlanCheckoutLink.slug,
          primaryPlanCheckoutLink.referenceCode,
        )
      : '';
    const subs = [
      { k: 'loja', l: 'Loja' },
      { k: 'pagamento', l: 'Pagamento' },
      { k: 'frete', l: 'Frete' },
      { k: 'afiliacao', l: 'Afiliação' },
      { k: 'bump', l: 'Order Bump' },
    ];
    const realBumps = ((bumps || []) as BumpData[]).map((b) => ({
      id: b.id,
      name: b.title || b.productName || 'Order Bump',
      desc: b.description || '',
      price: b.priceInCents || 0,
      oldPrice: b.compareAtPrice || 0,
      active: b.active !== false,
    }));
    return (
      <>
        <div
          style={{
            display: 'flex',
            alignItems: isMobile ? 'stretch' : 'center',
            flexDirection: isMobile ? 'column' : 'row',
            gap: 10,
            marginBottom: 16,
          }}
        >
          <Bt onClick={() => setSelPlan(null)}>← Planos</Bt>
          <span style={{ fontSize: 13, fontWeight: 600, color: V.t }}>{plan.name}</span>
          <Bg color={plan.active ? V.g : V.r}>{plan.active ? 'ATIVO' : 'OFF'}</Bg>
        </div>
        <div
          style={{
            ...cs,
            padding: isMobile ? 14 : 16,
            marginBottom: 16,
            display: 'flex',
            alignItems: isMobile ? 'stretch' : 'center',
            gap: isMobile ? 14 : 16,
            flexDirection: isMobile ? 'column' : 'row',
          }}
        >
          <div>
            <span style={{ fontFamily: M, fontSize: 28, fontWeight: 700, color: V.em }}>
              {R$(plan.price)}
            </span>
            <span style={{ display: 'block', fontSize: 10, color: V.t3 }}>
              {plan.qty} un · Até {plan.inst}x
            </span>
          </div>
          <NP w={120} h={22} intensity={Math.max(0.1, plan.sales / 100)} />
          <div
            style={{ marginLeft: isMobile ? 0 : 'auto', textAlign: isMobile ? 'left' : 'right' }}
          >
            <span style={{ fontFamily: M, fontSize: 20, fontWeight: 700, color: V.t }}>
              {plan.sales}
            </span>
            <span style={{ display: 'block', fontSize: 9, color: V.t3 }}>VENDAS</span>
          </div>
          <div
            style={{
              borderLeft: isMobile ? 'none' : `1px solid ${V.b}`,
              borderTop: isMobile ? `1px solid ${V.b}` : 'none',
              paddingLeft: isMobile ? 0 : 14,
              paddingTop: isMobile ? 12 : 0,
              width: isMobile ? '100%' : 'auto',
            }}
          >
            <span style={{ fontSize: 9, color: V.t3 }}>CHECKOUT</span>
            <br />
            <span style={{ fontFamily: M, fontSize: 11, color: V.em }}>
              {planPublicCheckoutUrl || 'Nenhum checkout vinculado'}
            </span>
          </div>
        </div>
        <TabBar tabs={subs} active={planSub} onSelect={setPlanSub} small />
        <div style={{ ...cs, padding: isMobile ? 16 : 20 }}>
          {planSub === 'loja' && (
            <>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: V.t, margin: '0 0 16px' }}>
                Config da loja
              </h3>
              <Tg
                label="Disponível para venda?"
                checked={plan.active}
                onChange={async (v: boolean) => {
                  try {
                    await updatePlan(selPlan!, { isActive: v });
                  } catch (e) {
                    console.error(e);
                  }
                }}
              />
              <Dv />
              <Fd label="Nome" value={planName} onChange={setPlanName} full />
              <div
                style={{
                  display: 'flex',
                  flexDirection: isMobile ? 'column' : 'row',
                  gap: isMobile ? 14 : 18,
                  alignItems: 'stretch',
                  marginBottom: 14,
                }}
              >
                <div style={{ width: isMobile ? '100%' : 184, flexShrink: 0 }}>
                  <MediaPreviewBox
                    inputAriaLabel="Foto do plano"
                    previewUrl={planImagePreviewUrl}
                    fallbackUrl={planImageCleared ? '' : planImageUrl}
                    uploading={planImageUploading}
                    emptySubtitle="JPG/PNG/WebP"
                    emptyTitle="Foto do plano"
                    onSelectFile={(file) => {
                      void handlePlanImageUpload(file);
                    }}
                    onClear={() => {
                      setPlanImagePreviewUrl('');
                      setPlanImageUrl('');
                      setPlanImageCleared(true);
                    }}
                    theme={{
                      accentColor: V.em,
                      borderColor: V.b,
                      frameBackground: 'rgba(255,255,255,0.03)',
                      labelColor: V.t3,
                      mutedColor: V.t3,
                      textColor: V.t2,
                    }}
                    layout={{
                      minHeight: 152,
                      padding: 12,
                      imageMaxWidth: '100%',
                      imageMaxHeight: '100%',
                      borderRadius: 8,
                    }}
                  />
                </div>
                <div
                  style={{
                    flex: 1,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 14,
                    alignContent: 'start',
                  }}
                >
                  <CurrencyStepperField
                    label="Valor (R$)"
                    cents={planPriceCents}
                    onChange={setPlanPriceCents}
                    minCents={0}
                  />
                  <IntegerStepperField
                    label="Qtd itens"
                    value={planQty}
                    onChange={setPlanQty}
                    min={1}
                  />
                </div>
              </div>
              <div style={{ ...cs, padding: 12, marginTop: 8, background: V.e }}>
                <span style={{ fontSize: 10, color: V.t3, display: 'block', marginBottom: 6 }}>
                  Checkout público gerado pelo Kloel
                </span>
                <span style={{ fontFamily: M, fontSize: 11, color: V.em }}>
                  {planPublicCheckoutUrl || 'Vincule um checkout para gerar o link'}
                </span>
              </div>
            </>
          )}
          {planSub === 'pagamento' && (
            <>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: V.t, margin: '0 0 16px' }}>
                Pagamento
              </h3>
              {planCheckoutLoading ? (
                <PanelLoadingState
                  compact
                  label="Carregando configuração comercial"
                  description="Sincronizando meios de pagamento e regras de cupom deste plano."
                />
              ) : (
                <>
                  <div
                    style={{
                      ...cs,
                      padding: 14,
                      marginBottom: 16,
                      background: V.e,
                      border: `1px solid ${V.b}`,
                    }}
                  >
                    <span
                      style={{
                        display: 'block',
                        fontSize: 12,
                        fontWeight: 700,
                        color: V.t,
                        marginBottom: 6,
                      }}
                    >
                      Checkout operando pelo plano
                    </span>
                    <span style={{ display: 'block', fontSize: 11, color: V.t2, lineHeight: 1.7 }}>
                      Defina aqui quais meios de pagamento ficam liberados e se este plano abre um
                      pop-up de cupom no `pay.kloel.com`. Toda a regra comercial e operacional deste
                      checkout fica centralizada neste painel manual.
                    </span>
                  </div>

                  <div style={{ marginBottom: 18 }}>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 11,
                        fontWeight: 700,
                        color: V.t3,
                        letterSpacing: '.08em',
                        textTransform: 'uppercase',
                        marginBottom: 10,
                      }}
                    >
                      Métodos de pagamento
                    </span>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                        gap: 10,
                      }}
                    >
                      {[
                        {
                          key: 'enableCreditCard',
                          title: 'Cartão',
                          desc: 'Parcelamento e aprovação instantânea.',
                          icon: (
                            <svg
                              width={16}
                              height={16}
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={2}
                              aria-hidden="true"
                            >
                              <rect x="2" y="5" width="20" height="14" rx="3" />
                              <path d="M2 10h20" />
                            </svg>
                          ),
                        },
                        {
                          key: 'enablePix',
                          title: 'Pix',
                          desc: 'Pagamento rápido com confirmação em minutos.',
                          icon: (
                            <svg
                              width={16}
                              height={16}
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={2}
                              aria-hidden="true"
                            >
                              <path d="M12 3l3.5 3.5L12 10 8.5 6.5 12 3zM12 14l3.5 3.5L12 21l-3.5-3.5L12 14zM3 12l3.5-3.5L10 12l-3.5 3.5L3 12zM14 12l3.5-3.5L21 12l-3.5 3.5L14 12z" />
                            </svg>
                          ),
                        },
                        {
                          key: 'enableBoleto',
                          title: 'Boleto',
                          desc: 'Cobrança bancária com vencimento controlado.',
                          icon: (
                            <svg
                              width={16}
                              height={16}
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={2}
                              aria-hidden="true"
                            >
                              <rect x="3" y="4" width="18" height="16" rx="2" />
                              <path d="M7 8v8M10 8v8M14 8v8M17 8v8" />
                            </svg>
                          ),
                        },
                      ].map((method) => {
                        const active =
                          planPaymentConfig[method.key as keyof typeof planPaymentConfig] === true;
                        return (
                          <button
                            key={method.key}
                            type="button"
                            onClick={() =>
                              patchPlanPaymentConfig({
                                [method.key]: !active,
                              } as Partial<typeof planPaymentConfig>)
                            }
                            style={{
                              ...cs,
                              padding: '14px 14px 12px',
                              background: active ? `${V.em}10` : V.s,
                              border: `1px solid ${active ? `${V.em}40` : V.b}`,
                              textAlign: 'left',
                              color: active ? V.em : V.t2,
                              transition: 'all .18s ease',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: 10,
                              }}
                            >
                              <span
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                              >
                                {method.icon}
                                <span style={{ fontSize: 13, fontWeight: 700, color: V.t }}>
                                  {method.title}
                                </span>
                              </span>
                              <Bg color={active ? V.g2 : V.t3}>{active ? 'ATIVO' : 'OFF'}</Bg>
                            </div>
                            <span
                              style={{
                                display: 'block',
                                fontSize: 11,
                                lineHeight: 1.6,
                                color: V.t2,
                              }}
                            >
                              {method.desc}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1.2fr 1fr',
                      gap: 14,
                      alignItems: 'start',
                    }}
                  >
                    <div>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 11,
                          fontWeight: 700,
                          color: V.t3,
                          letterSpacing: '.08em',
                          textTransform: 'uppercase',
                          marginBottom: 10,
                        }}
                      >
                        Oferta e parcelamento
                      </span>
                      <div
                        style={{
                          ...cs,
                          padding: 14,
                          background: V.e,
                          display: 'grid',
                          gridTemplateColumns: 'minmax(220px, 260px) 1fr',
                          gap: 14,
                          alignItems: 'start',
                        }}
                      >
                        <SelectField
                          label="Parcelas máx"
                          value={String(planInst)}
                          onChange={(value) => setPlanInst(Number.parseInt(value, 10) || 1)}
                          options={INSTALLMENT_OPTIONS.map((option) => ({
                            value: option,
                            label: option,
                          }))}
                          full
                        />
                        <div
                          style={{
                            minHeight: 46,
                            padding: '12px 14px',
                            background: V.s,
                            border: `1px solid ${V.b}`,
                            borderRadius: 8,
                          }}
                        >
                          <span
                            style={{
                              display: 'block',
                              fontSize: 10,
                              color: V.t3,
                              textTransform: 'uppercase',
                              letterSpacing: '.08em',
                              marginBottom: 6,
                            }}
                          >
                            Saída pública
                          </span>
                          <span
                            style={{ fontFamily: M, fontSize: 11, color: V.em, lineHeight: 1.6 }}
                          >
                            {planPublicCheckoutUrl || 'Nenhum checkout vinculado'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 11,
                          fontWeight: 700,
                          color: V.t3,
                          letterSpacing: '.08em',
                          textTransform: 'uppercase',
                          marginBottom: 10,
                        }}
                      >
                        Cupom
                      </span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ ...cs, padding: 14, background: V.e }}>
                          <Tg
                            label="Aceitar cupons neste plano?"
                            checked={planPaymentConfig.enableCoupon}
                            onChange={(value: boolean) =>
                              patchPlanPaymentConfig({
                                enableCoupon: value,
                                showCouponPopup: value ? planPaymentConfig.showCouponPopup : false,
                                autoCouponCode: value ? planPaymentConfig.autoCouponCode : '',
                              })
                            }
                          />
                        </div>
                        <div style={{ ...cs, padding: 14, background: V.e }}>
                          <Tg
                            label="Ativar cupom em pop-up?"
                            checked={
                              planPaymentConfig.enableCoupon && planPaymentConfig.showCouponPopup
                            }
                            onChange={(value: boolean) =>
                              patchPlanPaymentConfig({
                                enableCoupon: value ? true : planPaymentConfig.enableCoupon,
                                showCouponPopup: value,
                                autoCouponCode: value
                                  ? planPaymentConfig.autoCouponCode || COUPONS[0]?.code || ''
                                  : '',
                              })
                            }
                          />
                          <span
                            style={{
                              display: 'block',
                              marginTop: 10,
                              fontSize: 11,
                              color: V.t2,
                              lineHeight: 1.7,
                            }}
                          >
                            Quando ativo, o lead vê um pop-up elegante com o cupom já preenchido e
                            aplica o desconto com um clique.
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {planPaymentConfig.enableCoupon && planPaymentConfig.showCouponPopup ? (
                    <div style={{ ...cs, padding: 16, marginTop: 16, background: V.e }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                          marginBottom: 12,
                          flexWrap: 'wrap',
                        }}
                      >
                        <div>
                          <span
                            style={{
                              display: 'block',
                              fontSize: 12,
                              fontWeight: 700,
                              color: V.t,
                            }}
                          >
                            Cupom do pop-up
                          </span>
                          <span
                            style={{ display: 'block', fontSize: 11, color: V.t2, marginTop: 4 }}
                          >
                            Escolha qual cupom o checkout entrega automaticamente ao visitante.
                          </span>
                        </div>
                        <Bt onClick={() => setModal('newCoupon')}>Cadastrar cupom</Bt>
                      </div>

                      {couponsLoading ? (
                        <PanelLoadingState
                          compact
                          label="Buscando cupons"
                          description="Carregando os cupons ativos deste produto para o pop-up."
                        />
                      ) : COUPONS.length === 0 ? (
                        <div
                          style={{
                            ...cs,
                            padding: 16,
                            background: V.s,
                            border: `1px dashed ${V.b}`,
                          }}
                        >
                          <span
                            style={{ display: 'block', fontSize: 13, fontWeight: 600, color: V.t }}
                          >
                            Nenhum cupom cadastrado ainda
                          </span>
                          <span
                            style={{
                              display: 'block',
                              fontSize: 11,
                              color: V.t2,
                              marginTop: 6,
                              lineHeight: 1.7,
                            }}
                          >
                            Para usar o pop-up automático, cadastre primeiro pelo menos um cupom
                            neste produto.
                          </span>
                        </div>
                      ) : (
                        <>
                          <label
                            style={{
                              display: 'block',
                              fontSize: 11,
                              color: V.t3,
                              marginBottom: 8,
                              textTransform: 'uppercase',
                              letterSpacing: '.08em',
                            }}
                            htmlFor={`${fid}-cupom`}
                          >
                            Cupom selecionado
                          </label>
                          <select
                            value={planPaymentConfig.autoCouponCode}
                            onChange={(e) =>
                              patchPlanPaymentConfig({
                                autoCouponCode: e.target.value.toUpperCase(),
                              })
                            }
                            style={{
                              width: '100%',
                              padding: '13px 14px',
                              background: V.s,
                              color: V.t,
                              border: `1px solid ${V.b}`,
                              borderRadius: 6,
                              fontFamily: S,
                              fontSize: 13,
                              outline: 'none',
                            }}
                            id={`${fid}-cupom`}
                          >
                            {COUPONS.map((coupon) => (
                              <option key={coupon.id} value={coupon.code}>
                                {coupon.code} ·{' '}
                                {coupon.type === '%'
                                  ? `${coupon.val}% OFF`
                                  : `R$ ${Number(coupon.val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} OFF`}
                              </option>
                            ))}
                          </select>
                          {selectedPlanCoupon ? (
                            <div
                              style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                                gap: 10,
                                marginTop: 12,
                              }}
                            >
                              <div style={{ ...cs, padding: 12, background: V.s }}>
                                <span
                                  style={{
                                    display: 'block',
                                    fontSize: 10,
                                    color: V.t3,
                                    marginBottom: 4,
                                  }}
                                >
                                  DESCONTO
                                </span>
                                <span
                                  style={{
                                    fontFamily: M,
                                    fontSize: 14,
                                    fontWeight: 700,
                                    color: V.em,
                                  }}
                                >
                                  {selectedPlanCoupon.type === '%'
                                    ? `${selectedPlanCoupon.val}%`
                                    : `R$ ${Number(selectedPlanCoupon.val || 0).toLocaleString(
                                        'pt-BR',
                                        {
                                          minimumFractionDigits: 2,
                                          maximumFractionDigits: 2,
                                        },
                                      )}`}
                                </span>
                              </div>
                              <div style={{ ...cs, padding: 12, background: V.s }}>
                                <span
                                  style={{
                                    display: 'block',
                                    fontSize: 10,
                                    color: V.t3,
                                    marginBottom: 4,
                                  }}
                                >
                                  USOS
                                </span>
                                <span
                                  style={{
                                    fontFamily: M,
                                    fontSize: 14,
                                    fontWeight: 700,
                                    color: V.t,
                                  }}
                                >
                                  {selectedPlanCoupon.used}
                                  {selectedPlanCoupon.max ? ` / ${selectedPlanCoupon.max}` : ''}
                                </span>
                              </div>
                              <div style={{ ...cs, padding: 12, background: V.s }}>
                                <span
                                  style={{
                                    display: 'block',
                                    fontSize: 10,
                                    color: V.t3,
                                    marginBottom: 4,
                                  }}
                                >
                                  STATUS
                                </span>
                                <Bg color={selectedPlanCoupon.on ? V.g2 : V.r}>
                                  {selectedPlanCoupon.on ? 'ATIVO' : 'OFF'}
                                </Bg>
                              </div>
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                  ) : null}
                </>
              )}
            </>
          )}
          {planSub === 'frete' && (
            <>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: V.t, margin: '0 0 16px' }}>
                Frete
              </h3>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 14,
                }}
              >
                <SelectField
                  label="Tipo de frete"
                  value={planShippingMode}
                  onChange={setPlanShippingMode}
                  options={PLAN_SHIPPING_OPTIONS.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                  full
                />
                {planShippingMode === 'FIXED' ? (
                  <CurrencyStepperField
                    label="Valor do frete (R$)"
                    cents={planFixedShippingCents}
                    onChange={setPlanFixedShippingCents}
                    minCents={0}
                  />
                ) : null}
                {planShippingMode === 'VARIABLE' ? (
                  <>
                    <Fd label="CEP de origem">
                      <input
                        style={is}
                        inputMode="numeric"
                        value={planOriginZip}
                        onChange={(event) =>
                          setPlanOriginZip(normalizeZipCodeInput(event.target.value))
                        }
                        placeholder="00000-000"
                      />
                    </Fd>
                    <CurrencyStepperField
                      label="De (R$)"
                      cents={planShippingRangeMinCents}
                      onChange={setPlanShippingRangeMinCents}
                      minCents={0}
                    />
                    <CurrencyStepperField
                      label="Até (R$)"
                      cents={planShippingRangeMaxCents}
                      onChange={setPlanShippingRangeMaxCents}
                      minCents={planShippingRangeMinCents}
                    />
                    <div style={{ gridColumn: '1 / -1' }}>
                      <Tg
                        label="Kloel calcular?"
                        checked={planUseKloelShipping}
                        onChange={setPlanUseKloelShipping}
                        desc="Quando ativo, o Kloel calcula o frete usando CEP de origem, faixa definida e valor da oferta."
                      />
                    </div>
                  </>
                ) : null}
              </div>
              <div style={{ ...cs, padding: 12, marginTop: 12, background: V.e }}>
                <span style={{ fontSize: 10, color: V.t3, display: 'block', marginBottom: 4 }}>
                  Política atual
                </span>
                <span style={{ fontSize: 12, color: V.t2 }}>
                  {planShippingMode === 'FREE' && 'Este plano opera com frete grátis.'}
                  {planShippingMode === 'FIXED' &&
                    `Frete fixo de ${R$(planFixedShippingCents)} aplicado no checkout.`}
                  {planShippingMode === 'VARIABLE' &&
                    `Frete variável ${planUseKloelShipping ? 'calculado pela Kloel' : 'com faixa manual'} de ${R$(planShippingRangeMinCents)} ate ${R$(Math.max(planShippingRangeMinCents, planShippingRangeMaxCents))}.`}
                </span>
              </div>
            </>
          )}
          {planSub === 'afiliacao' && (
            <>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: V.t, margin: '0 0 16px' }}>
                Afiliação
              </h3>
              <p style={{ fontSize: 11, color: V.t3, margin: '0 0 12px' }}>
                Defina se este plano fica visível para afiliados aprovados e acompanhe a comissão
                pelo programa do produto.
              </p>
              <Tg
                label="Plano visível para afiliados?"
                checked={planVisible}
                onChange={setPlanVisible}
              />
              <Tg
                label="Comissão personalizada?"
                checked={planCustomCommission}
                onChange={setPlanCustomCommission}
              />
              {planCustomCommission ? (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 14,
                    marginTop: 14,
                  }}
                >
                  <SelectField
                    label="Modelo de comissão"
                    value={planCommissionType}
                    onChange={setPlanCommissionType}
                    options={COMMISSION_TYPE_OPTIONS.map((option) => ({
                      value: option.value,
                      label: option.label,
                    }))}
                    full
                  />
                  {planCommissionType === 'AMOUNT' ? (
                    <CurrencyStepperField
                      label="Comissão personalizada"
                      cents={planCommissionAmountCents}
                      onChange={setPlanCommissionAmountCents}
                      minCents={0}
                    />
                  ) : (
                    <PercentStepperField
                      label="Comissão personalizada"
                      value={planCommissionPercent}
                      onChange={setPlanCommissionPercent}
                      min={1}
                      max={100}
                    />
                  )}
                </div>
              ) : null}
              <div style={{ ...cs, padding: 14, marginTop: 12, background: V.e }}>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: V.t,
                    marginBottom: 8,
                    display: 'block',
                  }}
                >
                  <svg
                    width={14}
                    height={14}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }}
                    aria-hidden="true"
                  >
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                  Projeção de comissão
                </span>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    gap: 12,
                    textAlign: 'center',
                  }}
                >
                  {[10, 50, 100].map((n) => (
                    <div key={n}>
                      <span style={{ fontSize: 9, color: V.t3 }}>{n} vendas</span>
                      <br />
                      <span style={{ fontFamily: M, fontSize: 16, fontWeight: 700, color: V.g2 }}>
                        R${' '}
                        {(
                          (planPriceCents / 100) *
                          ((planCustomCommission && planCommissionType === 'PERCENT'
                            ? parsePercentValue(
                                planCommissionPercent,
                                Number(p.commissionPercent) || 30,
                              )
                            : Number(p.commissionPercent) || 30) /
                            100) *
                          n
                        ).toLocaleString('pt-BR')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
          {planSub === 'bump' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: V.t, margin: 0 }}>
                  Order Bumps
                </h3>
                <Bt primary onClick={() => setModal('newBump')}>
                  + Adicionar
                </Bt>
              </div>
              {realBumps.length > 0 ? (
                realBumps.map((b) => (
                  <div
                    key={b.id}
                    style={{
                      ...cs,
                      padding: 14,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      background: V.e,
                      position: 'relative',
                      overflow: 'hidden',
                      marginBottom: 8,
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: 3,
                        background: V.em,
                      }}
                    />
                    <span style={{ display: 'inline-flex', alignItems: 'center', color: V.em }}>
                      <svg
                        width={18}
                        height={18}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        aria-hidden="true"
                      >
                        <polyline points="20 12 20 22 4 22 4 12" />
                        <rect x="2" y="7" width="20" height="5" />
                        <line x1="12" y1="22" x2="12" y2="7" />
                        <path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z" />
                        <path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" />
                      </svg>
                    </span>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: V.t }}>{b.name}</span>
                      <br />
                      <span style={{ fontSize: 11, color: V.t2 }}>{b.desc}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {b.oldPrice > 0 && (
                        <>
                          <span
                            style={{
                              fontFamily: M,
                              fontSize: 10,
                              color: V.t3,
                              textDecoration: 'line-through',
                            }}
                          >
                            {R$(b.oldPrice)}
                          </span>
                          <br />
                        </>
                      )}
                      <span style={{ fontFamily: M, fontSize: 16, fontWeight: 700, color: V.em }}>
                        {R$(b.price)}
                      </span>
                    </div>
                    <Bg color={b.active ? V.g : V.r}>{b.active ? 'ATIVO' : 'OFF'}</Bg>
                  </div>
                ))
              ) : (
                <div
                  style={{
                    ...cs,
                    padding: 14,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    background: V.e,
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: 3,
                      background: V.em,
                    }}
                  />
                  <span style={{ display: 'inline-flex', alignItems: 'center', color: V.em }}>
                    <svg
                      width={18}
                      height={18}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <polyline points="20 12 20 22 4 22 4 12" />
                      <rect x="2" y="7" width="20" height="5" />
                      <line x1="12" y1="22" x2="12" y2="7" />
                      <path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z" />
                      <path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" />
                    </svg>
                  </span>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 13, color: V.t3 }}>Nenhum order bump cadastrado</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <Bt
          primary
          onClick={async () => {
            setPlanSaving(true);
            setPlanError('');
            try {
              if (planSub === 'pagamento' && planCheckoutLoading) {
                throw new Error('Aguarde a configuração comercial terminar de carregar.');
              }

              if (planCheckoutConfig || planSub === 'pagamento') {
                const paymentMethodsEnabled = [
                  planPaymentConfig.enableCreditCard,
                  planPaymentConfig.enablePix,
                  planPaymentConfig.enableBoleto,
                ].some(Boolean);

                if (!paymentMethodsEnabled) {
                  throw new Error('Ative pelo menos um meio de pagamento neste plano.');
                }

                if (planPaymentConfig.enableCoupon && planPaymentConfig.showCouponPopup) {
                  if (COUPONS.length === 0) {
                    throw new Error('Cadastre um cupom antes de ativar o pop-up automático.');
                  }
                  if (!planPaymentConfig.autoCouponCode) {
                    throw new Error('Selecione qual cupom o pop-up deve aplicar automaticamente.');
                  }
                }
              }

              await updatePlan(selPlan!, {
                name: planName,
                priceInCents: Math.max(0, Math.round(planPriceCents)),
                quantity: Math.max(1, Math.round(Number(planQty || 1))),
                maxInstallments: Math.max(1, Math.min(12, Math.round(Number(planInst || 1)))),
                freeShipping: planShippingMode === 'FREE',
                shippingPrice: planShippingMode === 'FIXED' ? planFixedShippingCents : 0,
                visibleToAffiliates: planVisible,
              });
              if (planCheckoutConfig || planSub === 'pagamento') {
                await updatePlanCheckoutConfig({
                  enableCreditCard: planPaymentConfig.enableCreditCard,
                  enablePix: planPaymentConfig.enablePix,
                  enableBoleto: planPaymentConfig.enableBoleto,
                  enableCoupon: planPaymentConfig.enableCoupon,
                  showCouponPopup:
                    planPaymentConfig.enableCoupon && planPaymentConfig.showCouponPopup,
                  autoCouponCode:
                    planPaymentConfig.enableCoupon && planPaymentConfig.showCouponPopup
                      ? planPaymentConfig.autoCouponCode || null
                      : null,
                  couponPopupDelay: 1800,
                  couponPopupTitle: 'Cupom exclusivo liberado',
                  couponPopupDesc: 'Seu desconto já está pronto para ser aplicado neste pedido.',
                  couponPopupBtnText: 'Aplicar cupom',
                  couponPopupDismiss: 'Agora não',
                  productImage: planImageCleared ? null : planImageUrl || null,
                  shippingMode: planShippingMode,
                  shippingOriginZip: planShippingMode === 'VARIABLE' ? planOriginZip : null,
                  shippingVariableMinInCents:
                    planShippingMode === 'VARIABLE' ? planShippingRangeMinCents : null,
                  shippingVariableMaxInCents:
                    planShippingMode === 'VARIABLE'
                      ? Math.max(planShippingRangeMinCents, planShippingRangeMaxCents)
                      : null,
                  shippingUseKloelCalculator:
                    planShippingMode === 'VARIABLE' ? planUseKloelShipping : false,
                  affiliateCustomCommissionEnabled: planCustomCommission,
                  affiliateCustomCommissionType: planCustomCommission ? planCommissionType : null,
                  affiliateCustomCommissionAmountInCents:
                    planCustomCommission && planCommissionType === 'AMOUNT'
                      ? planCommissionAmountCents
                      : null,
                  affiliateCustomCommissionPercent:
                    planCustomCommission && planCommissionType === 'PERCENT'
                      ? parsePercentValue(planCommissionPercent, Number(p.commissionPercent) || 30)
                      : null,
                });
              }
              setPlanSaved(true);
              // PULSE:OK — UI feedback reset after the plan update request completes successfully.
              setTimeout(() => setPlanSaved(false), 2000);
              showToast('Plano salvo', 'success');
            } catch (e) {
              console.error(e);
              setPlanError(e instanceof Error ? e.message : 'Não foi possível salvar o plano.');
              showToast(e instanceof Error ? e.message : 'Erro ao salvar plano', 'error');
            } finally {
              setPlanSaving(false);
            }
          }}
          style={{ marginTop: 16, width: '100%', justifyContent: 'center' }}
        >
          <svg
            width={12}
            height={12}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }}
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          {planSaved ? 'Salvo!' : planSaving ? 'Salvando...' : 'Salvar'}
        </Bt>
        {planError ? (
          <div style={{ marginTop: 10, fontSize: 12, color: V.r, lineHeight: 1.6 }}>
            {planError}
          </div>
        ) : null}
      </>
    );
  }

  /* ═══════════════════════════════════════════════════
     CHECKOUTS TAB
     ═══════════════════════════════════════════════════ */
  const handleNewCheckout = async () => {
    try {
      const checkoutName = `Checkout ${(rawCheckouts || []).length + 1}`;
      const res = (await createCheckout({
        name: checkoutName,
        priceInCents: getFallbackPlanPriceInCents(),
        quantity: 1,
        maxInstallments: 12,
        brandName: editName || p.name || checkoutName,
      })) as { id?: string; data?: { id?: string } } | null;
      const createdPlanId = res?.id || res?.data?.id || null;
      if (!createdPlanId) throw new Error('Nenhum checkout foi criado');
      setTab('checkouts');
      setCkEdit(createdPlanId);
    } catch (error) {
      console.error('Checkout creation error:', error);
      if (typeof window !== 'undefined') {
        window.alert('Nao foi possivel criar o checkout agora. Tente novamente.');
      }
    }
  };
  const handleDeleteCheckout = async (id: string) => {
    await deleteCheckout(id);
  };

  /* ═══════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════ */
  const ctxValue: ProductNerveCenterContextValue = {
    productId,
    p,
    refreshProduct,
    updateProduct,
    rawPlans,
    PLANS,
    plansLoading,
    updatePlan,
    deletePlan,
    createPlan,
    duplicatePlan,
    rawCheckouts,
    createCheckout,
    duplicateCheckout,
    deleteCheckout,
    syncCheckoutLinks,
    COUPONS,
    couponsLoading,
    loadCoupons,
    bumps,
    createBump,
    openCheckoutEditor,
    setModal,
    copied,
    cp,
    flashActionFeedback,
    initialFocus,
    initialComSub,
    router,
  };

  return (
    <ProductNerveCenterProvider value={ctxValue}>
      <div
        data-testid="product-nerve-center-root"
        style={{
          background: V.void,
          minHeight: '100vh',
          fontFamily: S,
          color: V.t,
          padding: rootShellPadding,
        }}
      >
        <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}} ::selection{background:rgba(232,93,48,.3)} ::-webkit-scrollbar{width:3px} ::-webkit-scrollbar-thumb{background:var(--app-scrollbar-thumb, #222226);border-radius:2px}`}</style>
        {(initialFocus || initialTab) && (
          <div
            style={{
              ...cs,
              padding: '14px 16px',
              marginBottom: 16,
              background: `${V.em}08`,
              border: `1px solid ${V.em}15`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <NP w={36} h={14} intensity={0.7} />
              <span style={{ fontSize: 12, fontWeight: 700, color: V.em, fontFamily: S }}>
                Acesso rápido
              </span>
            </div>
            <span style={{ fontSize: 12, color: V.t2, fontFamily: S }}>
              {initialFocus === 'order-bump' &&
                'Você entrou direto na configuração de order bump deste produto.'}
              {initialFocus === 'coupon' && 'Você entrou direto na gestão de cupons deste produto.'}
              {initialFocus === 'coproduction' &&
                'Você entrou direto na área de coprodução deste produto.'}
              {initialFocus === 'checkout-appearance' &&
                'Você entrou direto na configuração visual e comercial do checkout deste produto.'}
              {initialFocus === 'payment-widget' &&
                'Você entrou direto na configuração do widget de pagamento deste produto.'}
              {initialFocus === 'urgency' &&
                'Você entrou direto na configuração de urgência e escassez da IA deste produto.'}
              {initialFocus === 'recommendations' &&
                'Você entrou direto na área de recomendações comerciais deste produto.'}
              {!initialFocus &&
                'Você entrou diretamente em uma área operacional específica deste produto.'}
            </span>
          </div>
        )}
        {renderHeader()}
        <TabBar
          tabs={TABS}
          active={tab}
          onSelect={(t) => {
            setTab(t);
            setSelPlan(null);
            setCkEdit(null);
          }}
        />
        <div
          style={{
            animation: prefersReducedMotion ? 'none' : 'fadeIn .3s ease forwards',
            paddingBottom: tabContentBottomGutter,
          }}
          key={`${tab}-${ckEdit}`}
        >
          {tab === 'dados' && renderDadosTab()}
          {tab === 'planos' && (
            <ProductNerveCenterPlanosTab
              plansLoading={plansLoading}
              plans={PLANS}
              selPlan={selPlan}
              setSelPlan={setSelPlan}
              setModal={setModal}
              copied={copied}
              onDuplicatePlan={handleDuplicatePlan}
              renderPlanDetail={renderPlanDetailContent}
            />
          )}
          {tab === 'checkouts' && (
            <ProductNerveCenterCheckoutsTab
              ckEdit={ckEdit}
              setCkEdit={setCkEdit}
              checkouts={CKS}
              rawCheckouts={rawCheckouts || []}
              rawPlans={rawPlans || []}
              copied={copied}
              onDuplicateCheckout={handleDuplicateCheckout}
              onDeleteCheckout={handleDeleteCheckout}
              onCreateCheckout={handleNewCheckout}
              syncCheckoutLinks={syncCheckoutLinks}
              updatePlan={updatePlan}
            />
          )}
          {tab === 'urls' && (
            <>
              {initialFocus === 'payment-widget' && (
                <div
                  style={{
                    ...cs,
                    padding: 16,
                    marginBottom: 16,
                    background: `${V.em}08`,
                    border: `1px solid ${V.em}25`,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: V.t, marginBottom: 4 }}>
                    Widget de pagamento dentro do produto
                  </div>
                  <div style={{ fontSize: 11, color: V.t3, lineHeight: 1.6 }}>
                    Use o checkout público deste produto como embed em páginas externas. O editor do
                    checkout entrega o iframe pronto para copiar por plano.
                  </div>
                </div>
              )}
              <ProductUrlsTab productId={productId} />
            </>
          )}
          {tab === 'comissao' && <ProductNerveCenterComissaoTab />}
          {tab === 'cupons' && (
            <ProductNerveCenterCuponsTab
              primaryPlanId={primaryPlanId}
              primaryCheckoutConfig={primaryCheckoutConfig}
              onDeleteCoupon={handleDeleteCoupon}
            />
          )}
          {tab === 'campanhas' && (
            <ProductNerveCenterCampanhasTab
              recommendedProducts={recommendedProducts}
              productName={editName || p.name || ''}
            />
          )}
          {tab === 'avaliacoes' && <ProductNerveCenterAvalTab />}
          {tab === 'afterpay' && <ProductNerveCenterAfterPayTab />}
          {tab === 'ia' && <ProductNerveCenterIATab />}
        </div>
        {/* MODALS */}
        {modal?.startsWith('links-') && (
          <ProductNerveCenterLinksModal
            planId={modal.replace('links-', '')}
            plans={PLANS}
            copied={copied}
            onCopyLink={cp}
            onClose={() => setModal(null)}
          />
        )}
        {/* campLinks modal removed — was orphaned (never opened), hardcoded URLs */}
        {modal === 'newPlan' && (
          <Modal title="Criar novo plano" onClose={() => setModal(null)}>
            <div
              style={{
                ...cs,
                padding: 14,
                marginBottom: 18,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: V.t }}>
                  Estruture as condições do plano
                </span>
                <span style={{ fontSize: 11, color: V.t3, lineHeight: 1.6 }}>
                  Defina nome, preço, quantidade e parcelamento com o padrão operacional do
                  checkout.
                </span>
              </div>
              <Bg color={V.em}>PLANO</Bg>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0 16px' }}>
              <Fd label="Nome do plano" value={newPlanName} onChange={setNewPlanName} full />
              <CurrencyStepperField
                label="Valor (R$)"
                cents={newPlanPriceCents}
                onChange={setNewPlanPriceCents}
              />
              <IntegerStepperField
                label="Qtd"
                value={newPlanQty}
                onChange={setNewPlanQty}
                min={1}
              />
              <SelectField
                label="Parcelas"
                value={String(newPlanInst)}
                onChange={(value) => setNewPlanInst(Number.parseInt(value, 10) || 1)}
                options={INSTALLMENT_OPTIONS.map((option) => ({
                  value: option,
                  label: `${option}x`,
                }))}
                full
              />
            </div>
            <Bt primary onClick={handleCreatePlan} style={{ marginTop: 12 }}>
              <svg
                width={12}
                height={12}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={3}
                style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }}
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Criar
            </Bt>
          </Modal>
        )}
        {modal === 'newBump' && (
          <Modal title="Novo Order Bump" onClose={() => setModal(null)}>
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ ...cs, padding: 14, background: V.e }}>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: V.t }}>
                  Produto
                </span>
                <span
                  style={{
                    display: 'block',
                    fontSize: 11,
                    color: V.t2,
                    lineHeight: 1.6,
                    marginTop: 6,
                  }}
                >
                  Escolha qual produto do seu workspace vai aparecer como order bump.
                </span>
              </div>
              {workspaceCheckoutProductsLoading ? (
                <PanelLoadingState
                  compact
                  label="Carregando produtos"
                  description="Buscando os produtos e planos disponíveis no checkout."
                />
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {orderBumpProductOptions.map((product) => {
                    const active = product.id === newBumpProductId;
                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => {
                          setNewBumpProductId(product.id);
                          setNewBumpPlanId('');
                        }}
                        style={{
                          ...cs,
                          padding: 12,
                          background: active ? `${V.em}10` : V.s,
                          border: `1px solid ${active ? `${V.em}40` : V.b}`,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          textAlign: 'left',
                          cursor: 'pointer',
                        }}
                      >
                        <div
                          style={{
                            width: 56,
                            height: 56,
                            borderRadius: 8,
                            background: 'rgba(255,255,255,0.03)',
                            border: `1px solid ${V.b}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            overflow: 'hidden',
                            flexShrink: 0,
                          }}
                        >
                          {product.coverImage ? (
                            <img
                              src={product.coverImage}
                              alt=""
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : (
                            <span style={{ fontSize: 10, color: V.t3 }}>Sem foto</span>
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span
                            style={{ display: 'block', fontSize: 13, fontWeight: 700, color: V.t }}
                          >
                            {product.name}
                          </span>
                          <span
                            style={{ display: 'block', fontSize: 11, color: V.t2, marginTop: 4 }}
                          >
                            {product.priceLabel}
                          </span>
                        </div>
                        <Bg color={active ? V.em : V.t3}>{active ? 'Selecionado' : 'Produto'}</Bg>
                      </button>
                    );
                  })}
                </div>
              )}
              {selectedBumpProduct ? (
                <>
                  <div style={{ ...cs, padding: 14, background: V.e }}>
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: V.t }}>
                      Planos
                    </span>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 11,
                        color: V.t2,
                        lineHeight: 1.6,
                        marginTop: 6,
                      }}
                    >
                      Escolha qual plano desse produto sera exibido no order bump.
                    </span>
                  </div>
                  <div style={{ display: 'grid', gap: 10 }}>
                    {orderBumpPlanOptions.map((plan) => {
                      const active = plan.id === newBumpPlanId;
                      const image = String(
                        plan.checkoutConfig?.productImage || selectedBumpProduct.coverImage || '',
                      );
                      return (
                        <button
                          key={plan.id}
                          type="button"
                          onClick={() => setNewBumpPlanId(plan.id)}
                          style={{
                            ...cs,
                            padding: 12,
                            background: active ? `${V.em}10` : V.s,
                            border: `1px solid ${active ? `${V.em}40` : V.b}`,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            textAlign: 'left',
                            cursor: 'pointer',
                          }}
                        >
                          <div
                            style={{
                              width: 52,
                              height: 52,
                              borderRadius: 8,
                              background: 'rgba(255,255,255,0.03)',
                              border: `1px solid ${V.b}`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              overflow: 'hidden',
                              flexShrink: 0,
                            }}
                          >
                            {image ? (
                              <img
                                src={image}
                                alt=""
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                            ) : (
                              <span style={{ fontSize: 10, color: V.t3 }}>Plano</span>
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span
                              style={{
                                display: 'block',
                                fontSize: 13,
                                fontWeight: 700,
                                color: V.t,
                              }}
                            >
                              {plan.name}
                            </span>
                            <span
                              style={{ display: 'block', fontSize: 11, color: V.t2, marginTop: 4 }}
                            >
                              {buildPlanSelectionPriceLabel(plan)}
                            </span>
                          </div>
                          <Bg color={active ? V.em : V.t3}>{active ? 'Plano' : 'Selecionar'}</Bg>
                        </button>
                      );
                    })}
                    {orderBumpPlanOptions.length === 0 ? (
                      <div style={{ ...cs, padding: 14, background: V.s }}>
                        <span style={{ fontSize: 12, color: V.t2 }}>
                          Nenhum plano disponivel para esse produto alem do plano atual.
                        </span>
                      </div>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
            <Bt
              primary
              onClick={handleCreateBump}
              disabled={!newBumpProductId || !newBumpPlanId}
              style={{ marginTop: 12 }}
            >
              <svg
                width={12}
                height={12}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={3}
                style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }}
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Salvar
            </Bt>
          </Modal>
        )}
        {modal === 'newCoupon' && (
          <Modal title="Criar cupom" onClose={() => setModal(null)}>
            <Fd label="Código" value={newCouponCode} onChange={setNewCouponCode} />
            <Fd label="Tipo">
              <select
                style={is}
                value={newCouponType}
                onChange={(e) => setNewCouponType(e.target.value)}
              >
                <option value="%">Porcentagem (%)</option>
                <option value="R$">Valor fixo (R$)</option>
              </select>
            </Fd>
            <Fd
              label={newCouponType === '%' ? 'Valor (%)' : 'Valor (R$)'}
              value={newCouponVal}
              onChange={setNewCouponVal}
            />
            <Fd label="Limite usos" value={newCouponMax} onChange={setNewCouponMax} />
            <Fd label="Expira em" full>
              <input
                type="date"
                style={is}
                value={newCouponExpiresAt}
                onChange={(e) => setNewCouponExpiresAt(e.target.value)}
              />
            </Fd>
            <Bt primary onClick={handleCreateCoupon} style={{ marginTop: 12 }}>
              <svg
                width={12}
                height={12}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={3}
                style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }}
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Criar
            </Bt>
          </Modal>
        )}
        {/* Dead modals removed — campaign creation handled by CampanhasTab inline form, coproduction by CoprodSubTab CRUD */}
      </div>
    </ProductNerveCenterProvider>
  );
}
