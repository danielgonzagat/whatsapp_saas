export type PublicCheckoutRecord = Record<string, unknown>;

export interface PixelConfig {
  id: string;
  type: 'FACEBOOK' | 'GOOGLE_ADS' | 'GOOGLE_ANALYTICS' | 'TIKTOK' | 'KWAI' | 'TABOOLA' | 'CUSTOM';
  pixelId: string;
  accessToken?: string;
  trackPageView: boolean;
  trackInitiateCheckout: boolean;
  trackAddPaymentInfo: boolean;
  trackPurchase: boolean;
  isActive: boolean;
}

export interface PublicCheckoutTestimonial {
  name?: string;
  text?: string;
  rating?: number;
  stars?: number;
  avatar?: string;
}

export interface CheckoutDisplayTestimonial {
  name: string;
  stars: number;
  text: string;
  avatar: string;
}

export interface PublicCheckoutOrderBump {
  id: string;
  title: string;
  description: string;
  productName: string;
  image?: string;
  priceInCents: number;
  compareAtPrice?: number;
  highlightColor?: string;
  checkboxLabel?: string;
}

export interface PublicCheckoutProduct {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  images?: string[];
  workspaceId?: string;
}

export interface PublicCheckoutMerchantInfo {
  workspaceId?: string;
  workspaceName?: string;
  companyName?: string;
  brandLogo?: string | null;
  customDomain?: string | null;
  cnpj?: string | null;
  addressLine?: string | null;
}

export interface PublicCheckoutConfig {
  theme?: 'NOIR' | 'BLANC';
  accentColor?: string;
  accentColor2?: string;
  backgroundColor?: string;
  cardColor?: string;
  textColor?: string;
  mutedTextColor?: string;
  fontBody?: string;
  fontDisplay?: string;
  brandName?: string;
  brandLogo?: string;
  headerMessage?: string;
  headerSubMessage?: string;
  productImage?: string;
  productDisplayName?: string;
  btnStep1Text?: string;
  btnStep2Text?: string;
  btnFinalizeText?: string;
  btnFinalizeIcon?: string;
  requireCPF?: boolean;
  requirePhone?: boolean;
  phoneLabel?: string;
  enableCreditCard?: boolean;
  enablePix?: boolean;
  enableBoleto?: boolean;
  enableCoupon?: boolean;
  showCouponPopup?: boolean;
  couponPopupDelay?: number;
  couponPopupTitle?: string;
  couponPopupDesc?: string;
  couponPopupBtnText?: string;
  couponPopupDismiss?: string;
  autoCouponCode?: string;
  enableTimer?: boolean;
  timerType?: 'COUNTDOWN' | 'EXPIRATION';
  timerMinutes?: number;
  timerMessage?: string;
  timerExpiredMessage?: string;
  timerPosition?: string;
  enableExitIntent?: boolean;
  exitIntentTitle?: string;
  exitIntentDescription?: string;
  exitIntentCouponCode?: string;
  enableFloatingBar?: boolean;
  floatingBarMessage?: string;
  enableTestimonials?: boolean;
  testimonials?: PublicCheckoutTestimonial[];
  enableGuarantee?: boolean;
  guaranteeTitle?: string;
  guaranteeText?: string;
  guaranteeDays?: number;
  enableTrustBadges?: boolean;
  trustBadges?: string[];
  footerText?: string;
  showPaymentIcons?: boolean;
  pixels?: PixelConfig[];
}

export interface PublicCheckoutPaymentProvider {
  provider: 'mercado_pago';
  connected: boolean;
  checkoutEnabled: boolean;
  publicKey?: string | null;
  unavailableReason?: string | null;
  marketplaceFeePercent?: number;
  installmentInterestMonthlyPercent?: number;
  availablePaymentMethodIds?: string[];
  availablePaymentMethodTypes?: string[];
  supportsCreditCard?: boolean;
  supportsPix?: boolean;
  supportsBoleto?: boolean;
}

export interface PublicCheckoutAffiliateContext {
  affiliateLinkId?: string;
  affiliateWorkspaceId?: string;
  affiliateProductId?: string;
  affiliateCode?: string;
  commissionPct?: number;
}

export interface PublicCheckoutPlan {
  id: string;
  name: string;
  priceInCents: number;
  compareAtPrice?: number;
  currency?: string;
  maxInstallments?: number;
  installmentsFee?: boolean;
  quantity?: number;
  freeShipping?: boolean;
  shippingPrice?: number;
  orderBumps?: PublicCheckoutOrderBump[];
}

export interface PublicCheckoutResponse extends PublicCheckoutPlan {
  slug: string;
  checkoutCode?: string;
  product: PublicCheckoutProduct;
  merchant?: PublicCheckoutMerchantInfo;
  checkoutConfig?: PublicCheckoutConfig;
  orderBumps?: PublicCheckoutOrderBump[];
  paymentProvider?: PublicCheckoutPaymentProvider;
  affiliateContext?: PublicCheckoutAffiliateContext | null;
}

export interface PublicCheckoutThemeProps {
  product?: PublicCheckoutProduct;
  config?: PublicCheckoutConfig;
  plan?: PublicCheckoutPlan;
  slug?: string;
  workspaceId?: string;
  checkoutCode?: string;
  paymentProvider?: PublicCheckoutPaymentProvider;
  affiliateContext?: PublicCheckoutAffiliateContext | null;
  merchant?: PublicCheckoutMerchantInfo;
}
