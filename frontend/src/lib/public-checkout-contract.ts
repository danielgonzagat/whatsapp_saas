/** Public checkout record type. */
export type PublicCheckoutRecord = Record<string, unknown>;

/** Pixel config shape. */
export interface PixelConfig {
  /** Id property. */
  id: string;
  /** Type property. */
  type: 'FACEBOOK' | 'GOOGLE_ADS' | 'GOOGLE_ANALYTICS' | 'TIKTOK' | 'KWAI' | 'TABOOLA' | 'CUSTOM';
  /** Pixel id property. */
  pixelId: string;
  /** Access token property. */
  accessToken?: string;
  /** Track page view property. */
  trackPageView: boolean;
  /** Track initiate checkout property. */
  trackInitiateCheckout: boolean;
  /** Track add payment info property. */
  trackAddPaymentInfo: boolean;
  /** Track purchase property. */
  trackPurchase: boolean;
  /** Is active property. */
  isActive: boolean;
}

/** Public checkout testimonial shape. */
export interface PublicCheckoutTestimonial {
  /** Name property. */
  name?: string;
  /** Text property. */
  text?: string;
  /** Rating property. */
  rating?: number;
  /** Stars property. */
  stars?: number;
  /** Avatar property. */
  avatar?: string;
}

/** Checkout display testimonial shape. */
export interface CheckoutDisplayTestimonial {
  /** Name property. */
  name: string;
  /** Stars property. */
  stars: number;
  /** Text property. */
  text: string;
  /** Avatar property. */
  avatar: string;
}

/** Public checkout order bump shape. */
export interface PublicCheckoutOrderBump {
  /** Id property. */
  id: string;
  /** Title property. */
  title: string;
  /** Description property. */
  description: string;
  /** Product name property. */
  productName: string;
  /** Image property. */
  image?: string;
  /** Price in cents property. */
  priceInCents: number;
  /** Compare at price property. */
  compareAtPrice?: number;
  /** Highlight color property. */
  highlightColor?: string;
  /** Checkbox label property. */
  checkboxLabel?: string;
}

/** Public checkout product shape. */
export interface PublicCheckoutProduct {
  /** Id property. */
  id: string;
  /** Name property. */
  name: string;
  /** Description property. */
  description?: string;
  /** Image url property. */
  imageUrl?: string;
  /** Images property. */
  images?: string[];
  /** Workspace id property. */
  workspaceId?: string;
}

/** Public checkout merchant info shape. */
export interface PublicCheckoutMerchantInfo {
  /** Workspace id property. */
  workspaceId?: string;
  /** Workspace name property. */
  workspaceName?: string;
  /** Company name property. */
  companyName?: string;
  /** Brand logo property. */
  brandLogo?: string | null;
  /** Custom domain property. */
  customDomain?: string | null;
  /** Cnpj property. */
  cnpj?: string | null;
  /** Address line property. */
  addressLine?: string | null;
}

/** Public checkout config shape. */
export interface PublicCheckoutConfig {
  /** Theme property. */
  theme?: 'NOIR' | 'BLANC';
  /** Accent color property. */
  accentColor?: string;
  /** Accent color2 property. */
  accentColor2?: string;
  /** Background color property. */
  backgroundColor?: string;
  /** Card color property. */
  cardColor?: string;
  /** Text color property. */
  textColor?: string;
  /** Muted text color property. */
  mutedTextColor?: string;
  /** Font body property. */
  fontBody?: string;
  /** Font display property. */
  fontDisplay?: string;
  /** Brand name property. */
  brandName?: string;
  /** Brand logo property. */
  brandLogo?: string;
  /** Header message property. */
  headerMessage?: string;
  /** Header sub message property. */
  headerSubMessage?: string;
  /** Product image property. */
  productImage?: string;
  /** Product display name property. */
  productDisplayName?: string;
  /** Btn step1 text property. */
  btnStep1Text?: string;
  /** Btn step2 text property. */
  btnStep2Text?: string;
  /** Btn finalize text property. */
  btnFinalizeText?: string;
  /** Btn finalize icon property. */
  btnFinalizeIcon?: string;
  /** Require cpf property. */
  requireCPF?: boolean;
  /** Require phone property. */
  requirePhone?: boolean;
  /** Phone label property. */
  phoneLabel?: string;
  /** Enable credit card property. */
  enableCreditCard?: boolean;
  /** Enable pix property. */
  enablePix?: boolean;
  /** Enable boleto property. */
  enableBoleto?: boolean;
  /** Enable coupon property. */
  enableCoupon?: boolean;
  /** Show coupon popup property. */
  showCouponPopup?: boolean;
  /** Coupon popup delay property. */
  couponPopupDelay?: number;
  /** Coupon popup title property. */
  couponPopupTitle?: string;
  /** Coupon popup desc property. */
  couponPopupDesc?: string;
  /** Coupon popup btn text property. */
  couponPopupBtnText?: string;
  /** Coupon popup dismiss property. */
  couponPopupDismiss?: string;
  /** Auto coupon code property. */
  autoCouponCode?: string;
  /** Enable timer property. */
  enableTimer?: boolean;
  /** Timer type property. */
  timerType?: 'COUNTDOWN' | 'EXPIRATION';
  /** Timer minutes property. */
  timerMinutes?: number;
  /** Timer message property. */
  timerMessage?: string;
  /** Timer expired message property. */
  timerExpiredMessage?: string;
  /** Timer position property. */
  timerPosition?: string;
  /** Show stock counter property. */
  showStockCounter?: boolean;
  /** Stock message property. */
  stockMessage?: string;
  /** Fake stock count property. */
  fakeStockCount?: number;
  /** Shipping mode property. */
  shippingMode?: 'FREE' | 'FIXED' | 'VARIABLE';
  /** Shipping origin zip property. */
  shippingOriginZip?: string;
  /** Shipping variable min in cents property. */
  shippingVariableMinInCents?: number;
  /** Shipping variable max in cents property. */
  shippingVariableMaxInCents?: number;
  /** Shipping use kloel calculator property. */
  shippingUseKloelCalculator?: boolean;
  /** Affiliate custom commission enabled property. */
  affiliateCustomCommissionEnabled?: boolean;
  /** Affiliate custom commission type property. */
  affiliateCustomCommissionType?: 'AMOUNT' | 'PERCENT';
  /** Affiliate custom commission amount in cents property. */
  affiliateCustomCommissionAmountInCents?: number;
  /** Affiliate custom commission percent property. */
  affiliateCustomCommissionPercent?: number;
  /** Enable exit intent property. */
  enableExitIntent?: boolean;
  /** Exit intent title property. */
  exitIntentTitle?: string;
  /** Exit intent description property. */
  exitIntentDescription?: string;
  /** Exit intent coupon code property. */
  exitIntentCouponCode?: string;
  /** Enable floating bar property. */
  enableFloatingBar?: boolean;
  /** Floating bar message property. */
  floatingBarMessage?: string;
  /** Enable testimonials property. */
  enableTestimonials?: boolean;
  /** Testimonials property. */
  testimonials?: PublicCheckoutTestimonial[];
  /** Enable guarantee property. */
  enableGuarantee?: boolean;
  /** Guarantee title property. */
  guaranteeTitle?: string;
  /** Guarantee text property. */
  guaranteeText?: string;
  /** Guarantee days property. */
  guaranteeDays?: number;
  /** Enable trust badges property. */
  enableTrustBadges?: boolean;
  /** Trust badges property. */
  trustBadges?: string[];
  /** Footer text property. */
  footerText?: string;
  /** Show payment icons property. */
  showPaymentIcons?: boolean;
  /** Pixels property. */
  pixels?: PixelConfig[];
}

/** Public checkout payment provider shape. */
export interface PublicCheckoutPaymentProvider {
  /** Provider property. */
  provider: 'stripe';
  /** Connected property. */
  connected: boolean;
  /** Checkout enabled property. */
  checkoutEnabled: boolean;
  /** Public key property. */
  publicKey?: string | null;
  /** Unavailable reason property. */
  unavailableReason?: string | null;
  /** Marketplace fee percent property. */
  marketplaceFeePercent?: number;
  /** Installment interest monthly percent property. */
  installmentInterestMonthlyPercent?: number;
  /** Available payment method ids property. */
  availablePaymentMethodIds?: string[];
  /** Available payment method types property. */
  availablePaymentMethodTypes?: string[];
  /** Supports credit card property. */
  supportsCreditCard?: boolean;
  /** Supports pix property. */
  supportsPix?: boolean;
  /** Supports boleto property. */
  supportsBoleto?: boolean;
}

/** Public checkout affiliate context shape. */
export interface PublicCheckoutAffiliateContext {
  /** Affiliate link id property. */
  affiliateLinkId?: string;
  /** Affiliate workspace id property. */
  affiliateWorkspaceId?: string;
  /** Affiliate product id property. */
  affiliateProductId?: string;
  /** Affiliate code property. */
  affiliateCode?: string;
  /** Commission pct property. */
  commissionPct?: number;
}

/** Public checkout plan shape. */
export interface PublicCheckoutPlan {
  /** Id property. */
  id: string;
  /** Name property. */
  name: string;
  /** Price in cents property. */
  priceInCents: number;
  /** Compare at price property. */
  compareAtPrice?: number;
  /** Currency property. */
  currency?: string;
  /** Max installments property. */
  maxInstallments?: number;
  /** Installments fee property. */
  installmentsFee?: boolean;
  /** Quantity property. */
  quantity?: number;
  /** Free shipping property. */
  freeShipping?: boolean;
  /** Shipping price property. */
  shippingPrice?: number;
  /** Order bumps property. */
  orderBumps?: PublicCheckoutOrderBump[];
}

/** Public checkout response shape. */
export interface PublicCheckoutResponse extends PublicCheckoutPlan {
  /** Slug property. */
  slug: string;
  /** Checkout code property. */
  checkoutCode?: string;
  /** Product property. */
  product: PublicCheckoutProduct;
  /** Merchant property. */
  merchant?: PublicCheckoutMerchantInfo;
  /** Checkout config property. */
  checkoutConfig?: PublicCheckoutConfig;
  /** Order bumps property. */
  orderBumps?: PublicCheckoutOrderBump[];
  /** Payment provider property. */
  paymentProvider?: PublicCheckoutPaymentProvider;
  /** Affiliate context property. */
  affiliateContext?: PublicCheckoutAffiliateContext | null;
}

/** Public checkout theme props shape. */
export interface PublicCheckoutThemeProps {
  /** Product property. */
  product?: PublicCheckoutProduct;
  /** Config property. */
  config?: PublicCheckoutConfig;
  /** Plan property. */
  plan?: PublicCheckoutPlan;
  /** Slug property. */
  slug?: string;
  /** Workspace id property. */
  workspaceId?: string;
  /** Checkout code property. */
  checkoutCode?: string;
  /** Payment provider property. */
  paymentProvider?: PublicCheckoutPaymentProvider;
  /** Affiliate context property. */
  affiliateContext?: PublicCheckoutAffiliateContext | null;
  /** Merchant property. */
  merchant?: PublicCheckoutMerchantInfo;
}
