import { colors } from '@/lib/design-tokens';

/**
 * Type definitions and `DEFAULT_CONFIG` for the checkout editor.
 *
 * Extracted from `useCheckoutEditor.helpers.ts` so the original file stays
 * under the 400-LOC gate while preserving every exported name as a barrel
 * re-export.
 */

/* ── Types ── */

export interface CheckoutTestimonial {
  /** Name property. */
  name: string;
  /** Text property. */
  text: string;
  /** Stars property. */
  stars: number;
}

/** Checkout trust badge shape. */
export interface CheckoutTrustBadge {
  /** Label property. */
  label: string;
  /** Icon property. */
  icon?: string;
}

/** Checkout order bump shape. */
export interface CheckoutOrderBump {
  /** Id property. */
  id?: string;
  /** Title property. */
  title: string;
  /** Description property. */
  description: string;
  /** Product name property. */
  productName: string;
  /** Price property. */
  price: number;
  /** Image property. */
  image?: string;
  /** Compare at price property. */
  compareAtPrice?: number;
  /** Highlight color property. */
  highlightColor?: string;
  /** Checkbox label property. */
  checkboxLabel?: string;
  /** Position property. */
  position?: string;
  /** Sort order property. */
  sortOrder?: number;
  /** Is active property. */
  isActive?: boolean;
}

/** Checkout upsell shape. */
export interface CheckoutUpsell {
  /** Id property. */
  id?: string;
  /** Title property. */
  title: string;
  /** Description property. */
  description: string;
  /** Product name property. */
  productName: string;
  /** Price property. */
  price: number;
  /** Headline property. */
  headline?: string;
  /** Image property. */
  image?: string;
  /** Compare at price property. */
  compareAtPrice?: number;
  /** Accept btn text property. */
  acceptBtnText?: string;
  /** Decline btn text property. */
  declineBtnText?: string;
  /** Timer seconds property. */
  timerSeconds?: number;
  /** Charge type property. */
  chargeType?: string;
  /** Sort order property. */
  sortOrder?: number;
  /** Is active property. */
  isActive?: boolean;
}

/** Checkout pixel shape. */
export interface CheckoutPixel {
  /** Id property. */
  id?: string;
  /** Type property. */
  type: string;
  /** Pixel id property. */
  pixelId: string;
  /** Access token property. */
  accessToken?: string;
  /** Track page view property. */
  trackPageView?: boolean;
  /** Track initiate checkout property. */
  trackInitiateCheckout?: boolean;
  /** Track add payment info property. */
  trackAddPaymentInfo?: boolean;
  /** Track purchase property. */
  trackPurchase?: boolean;
  /** Is active property. */
  isActive?: boolean;
}

/** Checkout config shape. */
export interface CheckoutConfig {
  /* Theme */
  theme: 'NOIR' | 'BLANC';

  /* Colors */
  accentColor: string;
  /** Accent color2 property. */
  accentColor2: string;
  /** Background color property. */
  backgroundColor: string;
  /** Card color property. */
  cardColor: string;
  /** Text color property. */
  textColor: string;

  /* Header */
  brandName: string;
  /** Brand logo property. */
  brandLogo: string;
  /** Header message property. */
  headerMessage: string;
  /** Header sub message property. */
  headerSubMessage: string;

  /* Product */
  productImage: string;
  /** Product display name property. */
  productDisplayName: string;

  /* Buttons */
  btnStep1Text: string;
  /** Btn step2 text property. */
  btnStep2Text: string;
  /** Btn finalize text property. */
  btnFinalizeText: string;

  /* Fields */
  requireCPF: boolean;
  /** Require phone property. */
  requirePhone: boolean;
  /** Phone label property. */
  phoneLabel: string;

  /* Payment Methods */
  enableCreditCard: boolean;
  /** Enable pix property. */
  enablePix: boolean;
  /** Enable boleto property. */
  enableBoleto: boolean;

  /* Coupon Popup */
  enableCoupon: boolean;
  /** Show coupon popup property. */
  showCouponPopup: boolean;
  /** Coupon popup title property. */
  couponPopupTitle: string;
  /** Coupon popup desc property. */
  couponPopupDesc: string;
  /** Auto coupon code property. */
  autoCouponCode: string;

  /* Timer */
  enableTimer: boolean;
  /** Timer type property. */
  timerType: string;
  /** Timer minutes property. */
  timerMinutes: number;
  /** Timer message property. */
  timerMessage: string;

  /* Stock Counter */
  showStockCounter: boolean;
  /** Legacy stock message property. */
  stockMessage: string;
  /** Legacy displayed stock count property. */
  fakeStockCount: number;

  /* Testimonials */
  testimonials: CheckoutTestimonial[];

  /* Guarantee */
  enableGuarantee: boolean;
  /** Guarantee title property. */
  guaranteeTitle: string;
  /** Guarantee text property. */
  guaranteeText: string;
  /** Guarantee days property. */
  guaranteeDays: number;

  /* Trust Badges */
  enableTrustBadges: boolean;
  /** Trust badges property. */
  trustBadges: CheckoutTrustBadge[];

  /* Order Bumps */
  orderBumps: CheckoutOrderBump[];

  /* Upsells */
  upsells: CheckoutUpsell[];

  /* Exit Intent */
  enableExitIntent: boolean;
  /** Exit intent title property. */
  exitIntentTitle: string;
  /** Exit intent coupon code property. */
  exitIntentCouponCode: string;

  /* Floating Bar */
  enableFloatingBar: boolean;
  /** Floating bar message property. */
  floatingBarMessage: string;

  /* SEO */
  metaTitle: string;
  /** Meta description property. */
  metaDescription: string;
  /** Meta image property. */
  metaImage: string;

  /* Custom CSS */
  customCSS: string;

  /* Pixels */
  pixels: CheckoutPixel[];

  /* Slug (read-only) */
  slug?: string;
  /** Reference code property. */
  referenceCode?: string;

  [key: string]: unknown;
}

/** Default_config. */
export const DEFAULT_CONFIG: CheckoutConfig = {
  theme: 'NOIR',
  accentColor: colors.ember.primary,
  accentColor2: colors.ember.primary,
  backgroundColor: colors.background.void,
  cardColor: colors.background.surface,
  textColor: colors.text.silver,
  brandName: '',
  brandLogo: '',
  headerMessage: '',
  headerSubMessage: '',
  productImage: '',
  productDisplayName: '',
  btnStep1Text: 'Continuar',
  btnStep2Text: 'Continuar',
  btnFinalizeText: 'Finalizar Compra',
  requireCPF: false,
  requirePhone: true,
  phoneLabel: 'WhatsApp',
  enableCreditCard: true,
  enablePix: true,
  enableBoleto: false,
  enableCoupon: false,
  showCouponPopup: false,
  couponPopupTitle: '',
  couponPopupDesc: '',
  autoCouponCode: '',
  enableTimer: false,
  timerType: 'countdown',
  timerMinutes: 15,
  timerMessage: '',
  showStockCounter: false,
  stockMessage: '',
  fakeStockCount: 0,
  testimonials: [],
  enableGuarantee: false,
  guaranteeTitle: '',
  guaranteeText: '',
  guaranteeDays: 7,
  enableTrustBadges: false,
  trustBadges: [],
  orderBumps: [],
  upsells: [],
  enableExitIntent: false,
  exitIntentTitle: '',
  exitIntentCouponCode: '',
  enableFloatingBar: false,
  floatingBarMessage: '',
  metaTitle: '',
  metaDescription: '',
  metaImage: '',
  customCSS: '',
  pixels: [],
};
