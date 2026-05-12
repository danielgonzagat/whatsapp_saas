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
  accessToken?: string | undefined;
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

/** Public checkout testimonial shape. */
export interface PublicCheckoutTestimonial {
  /** Name property. */
  name?: string | undefined;
  /** Text property. */
  text?: string | undefined;
  /** Rating property. */
  rating?: number | undefined;
  /** Stars property. */
  stars?: number | undefined;
  /** Avatar property. */
  avatar?: string | undefined;
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
  image?: string | undefined;
  /** Price in cents property. */
  priceInCents: number;
  /** Compare at price property. */
  compareAtPrice?: number | undefined;
  /** Highlight color property. */
  highlightColor?: string | undefined;
  /** Checkbox label property. */
  checkboxLabel?: string | undefined;
}

/** Public checkout product shape. */
export interface PublicCheckoutProduct {
  /** Id property. */
  id: string;
  /** Name property. */
  name: string;
  /** Description property. */
  description?: string | undefined;
  /** Image url property. */
  imageUrl?: string | undefined;
  /** Images property. */
  images?: string[] | undefined;
  /** Workspace id property. */
  workspaceId?: string | undefined;
}

/** Public checkout merchant info shape. */
export interface PublicCheckoutMerchantInfo {
  /** Workspace id property. */
  workspaceId?: string | undefined;
  /** Workspace name property. */
  workspaceName?: string | undefined;
  /** Company name property. */
  companyName?: string | undefined;
  /** Brand logo property. */
  brandLogo?: string | null | undefined;
  /** Custom domain property. */
  customDomain?: string | null | undefined;
  /** Cnpj property. */
  cnpj?: string | null | undefined;
  /** Address line property. */
  addressLine?: string | null | undefined;
}

/** Public checkout config shape. */
export interface PublicCheckoutConfig {
  /** Theme property. */
  theme?: 'NOIR' | 'BLANC' | undefined;
  /** Accent color property. */
  accentColor?: string | undefined;
  /** Accent color2 property. */
  accentColor2?: string | undefined;
  /** Background color property. */
  backgroundColor?: string | undefined;
  /** Card color property. */
  cardColor?: string | undefined;
  /** Text color property. */
  textColor?: string | undefined;
  /** Muted text color property. */
  mutedTextColor?: string | undefined;
  /** Font body property. */
  fontBody?: string | undefined;
  /** Font display property. */
  fontDisplay?: string | undefined;
  /** Brand name property. */
  brandName?: string | undefined;
  /** Brand logo property. */
  brandLogo?: string | undefined;
  /** Header message property. */
  headerMessage?: string | undefined;
  /** Header sub message property. */
  headerSubMessage?: string | undefined;
  /** Product image property. */
  productImage?: string | undefined;
  /** Product display name property. */
  productDisplayName?: string | undefined;
  /** Btn step1 text property. */
  btnStep1Text?: string | undefined;
  /** Btn step2 text property. */
  btnStep2Text?: string | undefined;
  /** Btn finalize text property. */
  btnFinalizeText?: string | undefined;
  /** Btn finalize icon property. */
  btnFinalizeIcon?: string | undefined;
  /** Require cpf property. */
  requireCPF?: boolean | undefined;
  /** Require phone property. */
  requirePhone?: boolean | undefined;
  /** Phone label property. */
  phoneLabel?: string | undefined;
  /** Enable credit card property. */
  enableCreditCard?: boolean | undefined;
  /** Enable pix property. */
  enablePix?: boolean | undefined;
  /** Enable boleto property. */
  enableBoleto?: boolean | undefined;
  /** Enable coupon property. */
  enableCoupon?: boolean | undefined;
  /** Show coupon popup property. */
  showCouponPopup?: boolean | undefined;
  /** Coupon popup delay property. */
  couponPopupDelay?: number | undefined;
  /** Coupon popup title property. */
  couponPopupTitle?: string | undefined;
  /** Coupon popup desc property. */
  couponPopupDesc?: string | undefined;
  /** Coupon popup btn text property. */
  couponPopupBtnText?: string | undefined;
  /** Coupon popup dismiss property. */
  couponPopupDismiss?: string | undefined;
  /** Auto coupon code property. */
  autoCouponCode?: string | undefined;
  /** Enable timer property. */
  enableTimer?: boolean | undefined;
  /** Timer type property. */
  timerType?: 'COUNTDOWN' | 'EXPIRATION' | undefined;
  /** Timer minutes property. */
  timerMinutes?: number | undefined;
  /** Timer message property. */
  timerMessage?: string | undefined;
  /** Timer expired message property. */
  timerExpiredMessage?: string | undefined;
  /** Timer position property. */
  timerPosition?: string | undefined;
  /** Legacy stock counter visibility property. */
  showStockCounter?: boolean | undefined;
  /** Legacy stock message property. */
  stockMessage?: string | undefined;
  /** Legacy displayed stock count property. */
  fakeStockCount?: number | undefined;
  /** Shipping mode property. */
  shippingMode?: 'FREE' | 'FIXED' | 'VARIABLE' | undefined;
  /** Shipping origin zip property. */
  shippingOriginZip?: string | undefined;
  /** Shipping variable min in cents property. */
  shippingVariableMinInCents?: number | undefined;
  /** Shipping variable max in cents property. */
  shippingVariableMaxInCents?: number | undefined;
  /** Shipping use kloel calculator property. */
  shippingUseKloelCalculator?: boolean | undefined;
  /** Affiliate custom commission enabled property. */
  affiliateCustomCommissionEnabled?: boolean | undefined;
  /** Affiliate custom commission type property. */
  affiliateCustomCommissionType?: 'AMOUNT' | 'PERCENT' | undefined;
  /** Affiliate custom commission amount in cents property. */
  affiliateCustomCommissionAmountInCents?: number | undefined;
  /** Affiliate custom commission percent property. */
  affiliateCustomCommissionPercent?: number | undefined;
  /** Enable exit intent property. */
  enableExitIntent?: boolean | undefined;
  /** Exit intent title property. */
  exitIntentTitle?: string | undefined;
  /** Exit intent description property. */
  exitIntentDescription?: string | undefined;
  /** Exit intent coupon code property. */
  exitIntentCouponCode?: string | undefined;
  /** Enable floating bar property. */
  enableFloatingBar?: boolean | undefined;
  /** Floating bar message property. */
  floatingBarMessage?: string | undefined;
  /** Enable testimonials property. */
  enableTestimonials?: boolean | undefined;
  /** Testimonials property. */
  testimonials?: PublicCheckoutTestimonial[] | undefined;
  /** Enable guarantee property. */
  enableGuarantee?: boolean | undefined;
  /** Guarantee title property. */
  guaranteeTitle?: string | undefined;
  /** Guarantee text property. */
  guaranteeText?: string | undefined;
  /** Guarantee days property. */
  guaranteeDays?: number | undefined;
  /** Enable trust badges property. */
  enableTrustBadges?: boolean | undefined;
  /** Trust badges property. */
  trustBadges?: string[] | undefined;
  /** Footer text property. */
  footerText?: string | undefined;
  /** Show payment icons property. */
  showPaymentIcons?: boolean | undefined;
  /** Meta title property. */
  metaTitle?: string | undefined;
  /** Meta description property. */
  metaDescription?: string | undefined;
  /** Meta image property. */
  metaImage?: string | undefined;
  /** Favicon property. */
  favicon?: string | undefined;
  /** Pixels property. */
  pixels?: PixelConfig[] | undefined;
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
  publicKey?: string | null | undefined;
  /** Unavailable reason property. */
  unavailableReason?: string | null | undefined;
  /** Marketplace fee percent property. */
  marketplaceFeePercent?: number | undefined;
  /** Installment interest monthly percent property. */
  installmentInterestMonthlyPercent?: number | undefined;
  /** Available payment method ids property. */
  availablePaymentMethodIds?: string[] | undefined;
  /** Available payment method types property. */
  availablePaymentMethodTypes?: string[] | undefined;
  /** Supports credit card property. */
  supportsCreditCard?: boolean | undefined;
  /** Supports pix property. */
  supportsPix?: boolean | undefined;
  /** Supports boleto property. */
  supportsBoleto?: boolean | undefined;
}

/** Public checkout affiliate context shape. */
export interface PublicCheckoutAffiliateContext {
  /** Affiliate link id property. */
  affiliateLinkId?: string | undefined;
  /** Affiliate workspace id property. */
  affiliateWorkspaceId?: string | undefined;
  /** Affiliate product id property. */
  affiliateProductId?: string | undefined;
  /** Affiliate code property. */
  affiliateCode?: string | undefined;
  /** Commission pct property. */
  commissionPct?: number | undefined;
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
  compareAtPrice?: number | undefined;
  /** Currency property. */
  currency?: string | undefined;
  /** Max installments property. */
  maxInstallments?: number | undefined;
  /** Installments fee property. */
  installmentsFee?: boolean | undefined;
  /** Quantity property. */
  quantity?: number | undefined;
  /** Free shipping property. */
  freeShipping?: boolean | undefined;
  /** Shipping price property. */
  shippingPrice?: number | undefined;
  /** Order bumps property. */
  orderBumps?: PublicCheckoutOrderBump[] | undefined;
}

/** Public checkout response shape. */
export interface PublicCheckoutResponse extends PublicCheckoutPlan {
  /** Slug property. */
  slug: string;
  /** Checkout code property. */
  checkoutCode?: string | undefined;
  /** Product property. */
  product: PublicCheckoutProduct;
  /** Merchant property. */
  merchant?: PublicCheckoutMerchantInfo | undefined;
  /** Checkout config property. */
  checkoutConfig?: PublicCheckoutConfig | undefined;
  /** Order bumps property. */
  orderBumps?: PublicCheckoutOrderBump[] | undefined;
  /** Payment provider property. */
  paymentProvider?: PublicCheckoutPaymentProvider | undefined;
  /** Affiliate context property. */
  affiliateContext?: PublicCheckoutAffiliateContext | null | undefined;
}

/** Public checkout theme props shape. */
export interface PublicCheckoutThemeProps {
  /** Product property. */
  product?: PublicCheckoutProduct | undefined;
  /** Config property. */
  config?: PublicCheckoutConfig | undefined;
  /** Plan property. */
  plan?: PublicCheckoutPlan | undefined;
  /** Slug property. */
  slug?: string | undefined;
  /** Workspace id property. */
  workspaceId?: string | undefined;
  /** Checkout code property. */
  checkoutCode?: string | undefined;
  /** Payment provider property. */
  paymentProvider?: PublicCheckoutPaymentProvider | undefined;
  /** Affiliate context property. */
  affiliateContext?: PublicCheckoutAffiliateContext | null | undefined;
  /** Merchant property. */
  merchant?: PublicCheckoutMerchantInfo | undefined;
}
