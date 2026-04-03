'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import NextImage from 'next/image';
import OrderBumpCard from './OrderBumpCard';
import PixelTracker, { type PixelConfig } from './PixelTracker';
import ExitIntentPopup from './ExitIntentPopup';
import FloatingBar from './FloatingBar';
import CountdownTimer from './CountdownTimer';
import StockCounter from './StockCounter';
import { createOrder, validateCoupon } from '../hooks/useCheckout';
import { SocialProofToast } from '@/components/checkout/SocialProofToast';
import { KloelChatBubble } from '@/components/checkout/KloelChatBubble';
import { KloelBrandLockup } from '@/components/kloel/KloelBrand';
import { buildCheckoutPricing } from '@/lib/checkout-pricing';
import { getMercadoPagoDeviceSessionId, tokenizeMercadoPagoCard } from '@/lib/mercado-pago';

/* ─── Types ────────────────────────────────────────────────────────────────── */

interface OrderBump {
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

interface Testimonial {
  name: string;
  text: string;
  rating: number;
  avatar?: string;
}

interface CheckoutConfig {
  theme: 'NOIR' | 'BLANC';
  accentColor?: string;
  accentColor2?: string;
  backgroundColor?: string;
  cardColor?: string;
  textColor?: string;
  mutedTextColor?: string;
  fontBody?: string;
  fontDisplay?: string;
  brandName: string;
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
  showStockCounter?: boolean;
  stockMessage?: string;
  fakeStockCount?: number;
  enableTestimonials?: boolean;
  testimonials?: Testimonial[];
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

interface Product {
  id: string;
  name: string;
  description?: string;
  images?: string[];
}

interface Plan {
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
  orderBumps?: OrderBump[];
}

interface CheckoutNoirProps {
  product?: Product;
  config?: CheckoutConfig;
  plan?: Plan;
  slug?: string;
  workspaceId?: string;
  checkoutCode?: string;
  paymentProvider?: {
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
  };
  affiliateContext?: {
    affiliateLinkId?: string;
    affiliateWorkspaceId?: string;
    affiliateProductId?: string;
    affiliateCode?: string;
    commissionPct?: number;
  } | null;
}

/* ─── Defaults ─────────────────────────────────────────────────────────────── */

const DEMO_PRODUCT: Product = {
  id: 'demo',
  name: 'Produto',
  description: '',
  images: [],
};

const DEMO_PLAN: Plan = {
  id: 'demo-plan',
  name: 'Plano',
  priceInCents: 0,
  compareAtPrice: 0,
  maxInstallments: 12,
  freeShipping: false,
  shippingPrice: 0,
  quantity: 1,
  orderBumps: [],
};

const DEMO_CONFIG: CheckoutConfig = {
  theme: 'NOIR',
  accentColor: '#D4A574',
  accentColor2: '#E8C4A0',
  backgroundColor: '#0A0A0F',
  cardColor: '#12121A',
  textColor: '#E8E8ED',
  mutedTextColor: '#7A7A88',
  brandName: 'Kloel',
  headerMessage: 'Finalize seu pedido',
  headerSubMessage: '',
  productDisplayName: 'Produto',
  productImage: '',
  btnStep1Text: 'Ir para Entrega',
  btnStep2Text: 'Ir para Pagamento',
  btnFinalizeText: 'Finalizar compra',
  btnFinalizeIcon: 'lock',
  requireCPF: true,
  requirePhone: true,
  phoneLabel: 'Celular / WhatsApp',
  enableCreditCard: true,
  enablePix: true,
  enableBoleto: false,
  enableCoupon: true,
  showCouponPopup: true,
  couponPopupDelay: 2400,
  couponPopupTitle: 'Presente especial para voce',
  couponPopupDesc: 'Um desconto exclusivo para sua primeira compra.',
  couponPopupBtnText: 'Aplicar desconto',
  couponPopupDismiss: 'Nao, obrigado',
  enableTestimonials: true,
  testimonials: [
    { name: 'Ana C.', text: 'Minha pele nunca esteve tao bonita. Entrega rapida!', rating: 5 },
    { name: 'Juliana M.', text: 'Produto incrivel. Ja estou no segundo kit.', rating: 5 },
    { name: 'Fernanda R.', text: 'Amei a embalagem e os resultados em 2 semanas.', rating: 4 },
  ],
  enableGuarantee: true,
  guaranteeTitle: 'Garantia de 30 dias',
  guaranteeText: 'Nao gostou? Devolvemos 100% do seu dinheiro.',
  guaranteeDays: 30,
  enableTrustBadges: true,
  trustBadges: ['Compra protegida', 'Dados criptografados'],
  footerText: 'Checkout seguro por Kloel',
  showPaymentIcons: true,
};

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function maskCPF(v: string): string {
  const digits = v.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function maskPhone(v: string): string {
  const digits = v.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : '';
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function maskCEP(v: string): string {
  const digits = v.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function maskCardNumber(v: string): string {
  const digits = v.replace(/\D/g, '').slice(0, 16);
  return digits.replace(/(.{4})/g, '$1 ').trim();
}

function maskExpiry(v: string): string {
  const digits = v.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

/* ─── Icons (inline SVG) ──────────────────────────────────────────────────── */

const IconLock = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const IconCheck = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconShield = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const IconStar = ({ filled }: { filled: boolean }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill={filled ? '#D4A574' : 'none'}
    stroke="#D4A574"
    strokeWidth="2"
  >
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

const IconGift = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="20 12 20 22 4 22 4 12" />
    <rect x="2" y="7" width="20" height="5" />
    <line x1="12" y1="22" x2="12" y2="7" />
    <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
    <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
  </svg>
);

const IconX = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconCreditCard = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
    <line x1="1" y1="10" x2="23" y2="10" />
  </svg>
);

const IconBarcode = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M7 7h.01M7 12h.01M7 17h.01M12 7h.01M12 12h.01M12 17h.01M17 7h.01M17 12h.01M17 17h.01" />
  </svg>
);

const IconChevronRight = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const IconCheckCircle = () => (
  <svg
    width="48"
    height="48"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#22c55e"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

/* ─── Component ────────────────────────────────────────────────────────────── */

export default function CheckoutNoir({
  product,
  config,
  plan,
  slug,
  workspaceId,
  checkoutCode,
  paymentProvider,
  affiliateContext,
}: CheckoutNoirProps) {
  const p = product || DEMO_PRODUCT;
  const c = config || DEMO_CONFIG;
  const pl = plan || DEMO_PLAN;

  /* Velvet Noir palette */
  const accent = c.accentColor || '#D4A574';
  const accent2 = c.accentColor2 || '#E8C4A0';
  const bg = c.backgroundColor || '#0A0A0F';
  const card = c.cardColor || '#12121A';
  const surface2 = '#1A1A25';
  const text = c.textColor || '#E8E8ED';
  const muted = c.mutedTextColor || '#7A7A88';
  const borderSub = '#252535';
  const mercadoPagoPublicKey =
    paymentProvider?.publicKey || process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY || '';
  const checkoutUnavailableReason =
    paymentProvider?.checkoutEnabled === false
      ? paymentProvider.unavailableReason || 'Conecte seu Mercado Pago para começar a vender.'
      : null;
  const supportsCreditCard = paymentProvider?.supportsCreditCard !== false;
  const supportsPix = paymentProvider?.supportsPix !== false;
  const supportsBoleto = paymentProvider?.supportsBoleto !== false;

  /* ── State ─────────────────────────────────────────────────────────────── */

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [animating, setAnimating] = useState(false);

  // Step 1 — Identification
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [cpf, setCpf] = useState('');
  const [phone, setPhone] = useState('');

  // Step 2 — Delivery
  const [cep, setCep] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [cepLoading, setCepLoading] = useState(false);
  const numberInputRef = useRef<HTMLInputElement>(null);

  // Step 3 — Payment
  const [paymentMethod, setPaymentMethod] = useState<'credit' | 'pix' | 'boleto'>('credit');
  const [cardNumber, setCardNumber] = useState('');
  const [cardName, setCardName] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCVV, setCardCVV] = useState('');
  const [installments, setInstallments] = useState(1);

  // Bumps
  const [acceptedBumps, setAcceptedBumps] = useState<Set<string>>(new Set());

  // Coupon
  const [couponCode, setCouponCode] = useState('');
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponApplied, setCouponApplied] = useState(false);
  const [showCouponModal, setShowCouponModal] = useState(false);
  const [couponError, setCouponError] = useState('');

  // Success
  const [showSuccess, setShowSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [orderError, setOrderError] = useState('');

  // Pixel tracking
  const [pixelEvent, setPixelEvent] = useState<
    'InitiateCheckout' | 'AddPaymentInfo' | 'Purchase' | null
  >(null);
  const pixels = c.pixels || [];

  /* ── CEP auto-fill ─────────────────────────────────────────────────────── */

  const lookupCep = useCallback(async (raw: string) => {
    const clean = raw.replace(/\D/g, '');
    if (clean.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.erro) return;
      if (data.logradouro) setStreet(data.logradouro);
      if (data.bairro) setNeighborhood(data.bairro);
      if (data.localidade) setCity(data.localidade);
      if (data.uf) setState(data.uf);
      numberInputRef.current?.focus();
    } catch {
      /* silent – API offline shouldn't block checkout */
    } finally {
      setCepLoading(false);
    }
  }, []);

  /* ── Coupon popup timer ────────────────────────────────────────────────── */

  useEffect(() => {
    if (c.showCouponPopup && c.enableCoupon && !couponApplied) {
      const delay = c.couponPopupDelay || 2400;
      const timer = setTimeout(() => setShowCouponModal(true), delay);
      return () => clearTimeout(timer);
    }
  }, [c.showCouponPopup, c.enableCoupon, c.couponPopupDelay, couponApplied]);

  /* ── Calculations ──────────────────────────────────────────────────────── */

  const bumpTotal = useMemo(() => {
    let total = 0;
    (pl.orderBumps || []).forEach((b) => {
      if (acceptedBumps.has(b.id)) total += b.priceInCents;
    });
    return total;
  }, [acceptedBumps, pl.orderBumps]);

  const subtotal = pl.priceInCents * (pl.quantity || 1);
  const shipping = pl.freeShipping ? 0 : pl.shippingPrice || 0;
  const discount = couponDiscount;
  const total = Math.max(0, subtotal + bumpTotal + shipping - discount);
  const pricing = useMemo(
    () =>
      buildCheckoutPricing({
        baseTotalInCents: total,
        paymentMethod,
        installments,
        installmentInterestMonthlyPercent:
          paymentProvider?.installmentInterestMonthlyPercent ?? 3.99,
      }),
    [installments, paymentMethod, paymentProvider?.installmentInterestMonthlyPercent, total],
  );
  const chargedTotal = pricing.chargedTotalInCents;
  const installmentInterest = pricing.installmentInterestInCents;

  const installmentOptions = useMemo(() => {
    const max = pl.maxInstallments || 12;
    const options: { value: number; label: string }[] = [];
    for (let i = 1; i <= max; i++) {
      const optionPricing = buildCheckoutPricing({
        baseTotalInCents: total,
        paymentMethod: 'credit',
        installments: i,
        installmentInterestMonthlyPercent:
          paymentProvider?.installmentInterestMonthlyPercent ?? 3.99,
      });
      const val = Math.round(optionPricing.chargedTotalInCents / i);
      const label =
        i === 1
          ? `1x de ${formatBRL(optionPricing.chargedTotalInCents)} sem juros`
          : `${i}x de ${formatBRL(val)}`;
      options.push({ value: i, label });
    }
    return options;
  }, [paymentProvider?.installmentInterestMonthlyPercent, pl.maxInstallments, total]);

  /* ── Step navigation ───────────────────────────────────────────────────── */

  const goToStep = useCallback((target: 1 | 2 | 3) => {
    if (target === 2) setPixelEvent('InitiateCheckout');
    if (target === 3) setPixelEvent('AddPaymentInfo');
    setAnimating(true);
    setTimeout(() => {
      setStep(target);
      setAnimating(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 250);
  }, []);

  useEffect(() => {
    const availableMethods = [
      supportsCreditCard ? 'credit' : null,
      c.enablePix && supportsPix ? 'pix' : null,
      c.enableBoleto && supportsBoleto ? 'boleto' : null,
    ].filter(Boolean) as Array<'credit' | 'pix' | 'boleto'>;

    if (availableMethods.length > 0 && !availableMethods.includes(paymentMethod)) {
      setPaymentMethod(availableMethods[0]);
    }
  }, [c.enableBoleto, c.enablePix, paymentMethod, supportsBoleto, supportsCreditCard, supportsPix]);

  const validateStep1 = (): boolean => {
    if (!name.trim() || !email.trim()) return false;
    if (c.requireCPF && cpf.replace(/\D/g, '').length < 11) return false;
    if (c.requirePhone && phone.replace(/\D/g, '').length < 10) return false;
    return true;
  };

  const validateStep2 = (): boolean => {
    if (
      !cep.trim() ||
      !street.trim() ||
      !number.trim() ||
      !neighborhood.trim() ||
      !city.trim() ||
      !state.trim()
    )
      return false;
    return true;
  };

  /* ── Submit ────────────────────────────────────────────────────────────── */

  const handleSubmit = async () => {
    setOrderError('');
    setIsSubmitting(true);
    try {
      if (paymentMethod === 'boleto' && cpf.replace(/\D/g, '').length < 11) {
        throw new Error('CPF válido é obrigatório para gerar boleto.');
      }

      const orderData = {
        planId: pl.id,
        workspaceId: workspaceId || '',
        checkoutCode,
        customerName: name,
        customerEmail: email,
        customerCPF: cpf,
        customerPhone: phone,
        shippingAddress: { cep, street, number, neighborhood, complement, city, state },
        shippingPrice: shipping,
        subtotalInCents: subtotal,
        discountInCents: discount,
        bumpTotalInCents: bumpTotal,
        totalInCents: total,
        couponCode: couponApplied ? couponCode : undefined,
        couponDiscount: couponApplied ? couponDiscount : undefined,
        acceptedBumps: Array.from(acceptedBumps),
        paymentMethod:
          paymentMethod === 'credit'
            ? ('CREDIT_CARD' as const)
            : paymentMethod === 'pix'
              ? ('PIX' as const)
              : ('BOLETO' as const),
        installments: pricing.installments,
        affiliateId: affiliateContext?.affiliateWorkspaceId,
      };
      const meliSessionId =
        paymentProvider?.provider === 'mercado_pago' ? await getMercadoPagoDeviceSessionId() : null;

      if (paymentProvider?.provider === 'mercado_pago' && !meliSessionId) {
        throw new Error(
          'Não foi possível validar este dispositivo para o Mercado Pago. Atualize a página e tente novamente.',
        );
      }

      if (paymentMethod === 'credit') {
        if (!mercadoPagoPublicKey) {
          throw new Error(
            checkoutUnavailableReason || 'Mercado Pago indisponível para este checkout.',
          );
        }

        const [cardExpirationMonth = '', cardYearSuffix = ''] = cardExpiry.split('/');
        const tokenizedCard = await tokenizeMercadoPagoCard(mercadoPagoPublicKey, {
          cardNumber,
          cardholderName: cardName || name,
          identificationNumber: cpf,
          securityCode: cardCVV,
          cardExpirationMonth,
          cardExpirationYear: `20${cardYearSuffix}`,
        });

        Object.assign(orderData, {
          cardHolderName: cardName || name,
          mercadoPagoToken: tokenizedCard?.token,
          mercadoPagoPaymentMethodId: tokenizedCard?.paymentMethodId,
          mercadoPagoPaymentType: tokenizedCard?.paymentType,
          mercadoPagoCardLast4: tokenizedCard?.last4,
        });
      }

      const result = await createOrder(orderData, { meliSessionId });
      setPixelEvent('Purchase');

      const orderId = result.id || result?.data?.id;
      if (paymentMethod === 'pix' && orderId) {
        window.location.href = `/order/${orderId}/pix`;
      } else if (paymentMethod === 'boleto' && orderId) {
        window.location.href = `/order/${orderId}/boleto`;
      } else if (result.paymentData?.approved && result.plan?.upsells?.length > 0) {
        window.location.href = `/order/${orderId}/upsell`;
      } else {
        window.location.href = `/order/${orderId}/success`;
      }
    } catch (err) {
      console.error('Order creation failed:', err);
      setOrderError(
        err instanceof Error ? err.message : 'Erro ao processar pagamento. Tente novamente.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ── Apply coupon ──────────────────────────────────────────────────────── */

  const applyCoupon = useCallback(
    async (code: string) => {
      setCouponError('');
      if (!code.trim()) {
        setCouponError('Digite um cupom');
        return;
      }
      try {
        const result = await validateCoupon(workspaceId || '', code, pl.id, subtotal);
        if (result.valid) {
          setCouponDiscount(result.discountAmount || 0);
          setCouponApplied(true);
          setCouponCode(code.toUpperCase());
          setShowCouponModal(false);
        } else {
          setCouponError('Cupom invalido ou expirado');
        }
      } catch {
        setCouponError('Cupom invalido ou expirado');
      }
    },
    [workspaceId, pl.id, subtotal],
  );

  /* ── Velvet Noir Styles ───────────────────────────────────────────────── */

  const s = useMemo(
    () => ({
      page: {
        minHeight: '100vh',
        background: bg,
        color: text,
        fontFamily: c.fontBody || "'DM Sans', sans-serif",
        display: 'flex',
        justifyContent: 'center',
        padding: '24px 16px',
        position: 'relative' as const,
        overflow: 'hidden' as const,
      } as React.CSSProperties,
      /* Subtle floating orb — top-right warm glow */
      orbTop: {
        position: 'fixed' as const,
        top: '-120px',
        right: '-80px',
        width: '400px',
        height: '400px',
        borderRadius: '50%',
        background: `radial-gradient(circle, ${accent}12 0%, transparent 70%)`,
        pointerEvents: 'none' as const,
        zIndex: 0,
        animation: 'noirOrbFloat 14s ease-in-out infinite',
      } as React.CSSProperties,
      /* Subtle floating orb — bottom-left cool glow */
      orbBottom: {
        position: 'fixed' as const,
        bottom: '-100px',
        left: '-60px',
        width: '350px',
        height: '350px',
        borderRadius: '50%',
        background: `radial-gradient(circle, ${accent}0A 0%, transparent 70%)`,
        pointerEvents: 'none' as const,
        zIndex: 0,
        animation: 'noirOrbFloat 18s ease-in-out infinite reverse',
      } as React.CSSProperties,
      container: {
        display: 'flex',
        gap: '32px',
        maxWidth: '1080px',
        width: '100%',
        alignItems: 'flex-start',
        flexWrap: 'wrap' as const,
        position: 'relative' as const,
        zIndex: 1,
      } as React.CSSProperties,
      main: {
        flex: 1,
        minWidth: '320px',
      } as React.CSSProperties,
      sidebar: {
        width: '340px',
        position: 'sticky' as const,
        top: '24px',
      } as React.CSSProperties,
      card: {
        background: card,
        borderRadius: '16px',
        border: `1px solid ${borderSub}`,
        padding: '28px',
        marginBottom: '20px',
        backdropFilter: 'blur(12px)',
        boxShadow: `0 4px 30px rgba(0,0,0,0.25), inset 0 1px 0 ${accent}08`,
      } as React.CSSProperties,
      input: {
        width: '100%',
        padding: '14px 16px',
        background: surface2,
        border: `1px solid ${borderSub}`,
        borderRadius: '10px',
        color: text,
        fontSize: '14px',
        fontFamily: 'inherit',
        outline: 'none',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        boxSizing: 'border-box' as const,
      } as React.CSSProperties,
      label: {
        display: 'block',
        fontSize: '12px',
        fontWeight: 500,
        color: muted,
        marginBottom: '6px',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.5px',
      } as React.CSSProperties,
      btn: {
        width: '100%',
        padding: '16px',
        background: `linear-gradient(135deg, ${accent}, ${accent2})`,
        color: '#0A0A0F',
        border: 'none',
        borderRadius: '12px',
        fontSize: '15px',
        fontWeight: 700,
        cursor: 'pointer',
        fontFamily: 'inherit',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        transition: 'transform 0.15s, box-shadow 0.15s',
        boxShadow: `0 4px 24px ${accent}33, 0 0 40px ${accent}11`,
      } as React.CSSProperties,
      progressBar: {
        display: 'flex',
        gap: '8px',
        marginBottom: '28px',
      } as React.CSSProperties,
      progressStep: (active: boolean, done: boolean) =>
        ({
          flex: 1,
          height: '4px',
          borderRadius: '4px',
          background: done
            ? `linear-gradient(90deg, ${accent}, ${accent2})`
            : active
              ? `${accent}55`
              : borderSub,
          transition: 'background 0.3s',
          boxShadow: done ? `0 0 8px ${accent}33` : 'none',
        }) as React.CSSProperties,
      stepTitle: {
        fontSize: '13px',
        fontWeight: 600,
        color: accent,
        textTransform: 'uppercase' as const,
        letterSpacing: '1.5px',
        marginBottom: '4px',
      } as React.CSSProperties,
      stepHeading: {
        fontSize: '22px',
        fontWeight: 700,
        color: text,
        marginBottom: '24px',
        fontFamily: c.fontDisplay || "'Playfair Display', serif",
      } as React.CSSProperties,
      row: {
        display: 'flex',
        gap: '12px',
      } as React.CSSProperties,
      field: {
        flex: 1,
        marginBottom: '16px',
      } as React.CSSProperties,
      methodBtn: (active: boolean) =>
        ({
          flex: 1,
          padding: '14px 12px',
          background: active ? `${accent}12` : surface2,
          border: `1.5px solid ${active ? accent : borderSub}`,
          borderRadius: '10px',
          color: active ? accent : muted,
          fontSize: '13px',
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: 'inherit',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          transition: 'all 0.2s',
          boxShadow: active ? `0 0 16px ${accent}15` : 'none',
        }) as React.CSSProperties,
      overlay: {
        position: 'fixed' as const,
        inset: 0,
        background: 'rgba(5,5,10,0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px',
      } as React.CSSProperties,
      modal: {
        background: card,
        borderRadius: '20px',
        padding: '36px',
        maxWidth: '420px',
        width: '100%',
        textAlign: 'center' as const,
        border: `1px solid ${borderSub}`,
        position: 'relative' as const,
        boxShadow: `0 20px 60px rgba(0,0,0,0.5), inset 0 1px 0 ${accent}0A`,
      } as React.CSSProperties,
      bumpCard: {
        background: `${accent}08`,
        border: `1.5px dashed ${accent}33`,
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '16px',
        cursor: 'pointer',
        transition: 'border-color 0.2s',
      } as React.CSSProperties,
      summaryRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '6px 0',
        fontSize: '14px',
      } as React.CSSProperties,
      badge: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 12px',
        background: `${accent}12`,
        borderRadius: '8px',
        fontSize: '12px',
        color: accent,
        fontWeight: 500,
      } as React.CSSProperties,
      testimonialCard: {
        background: surface2,
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '12px',
        border: `1px solid ${borderSub}`,
      } as React.CSSProperties,
    }),
    [accent, accent2, bg, card, surface2, text, muted, borderSub, c.fontBody, c.fontDisplay],
  );

  /* ── Render helpers ────────────────────────────────────────────────────── */

  const renderProgressBar = () => (
    <div style={s.progressBar}>
      {[1, 2, 3].map((i) => (
        <div key={i} style={s.progressStep(step === i, step > i)} />
      ))}
    </div>
  );

  const renderStepLabel = (num: number, label: string) => (
    <div style={{ marginBottom: '24px' }}>
      <div style={s.stepTitle}>Etapa {num} de 3</div>
      <div style={s.stepHeading}>{label}</div>
    </div>
  );

  /* ── Step 1: Identification ───────────────────────────────────────────── */

  const renderStep1 = () => (
    <div style={s.card}>
      {renderStepLabel(1, 'Identificacao')}
      <div style={s.field}>
        <label style={s.label}>Nome completo</label>
        <input
          aria-label="Nome completo"
          style={s.input}
          placeholder="Seu nome"
          value={name}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
          onFocus={(e: React.FocusEvent<HTMLInputElement>) => {
            e.target.style.borderColor = accent;
            e.target.style.boxShadow = `0 0 0 3px ${accent}15`;
          }}
          onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
            e.target.style.borderColor = borderSub;
            e.target.style.boxShadow = 'none';
          }}
        />
      </div>
      <div style={s.field}>
        <label style={s.label}>E-mail</label>
        <input
          aria-label="E-mail"
          style={s.input}
          type="email"
          placeholder="seu@email.com"
          value={email}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
          onFocus={(e: React.FocusEvent<HTMLInputElement>) => {
            e.target.style.borderColor = accent;
            e.target.style.boxShadow = `0 0 0 3px ${accent}15`;
          }}
          onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
            e.target.style.borderColor = borderSub;
            e.target.style.boxShadow = 'none';
          }}
        />
      </div>
      {c.requireCPF && (
        <div style={s.field}>
          <label style={s.label}>CPF</label>
          <input
            aria-label="CPF"
            style={s.input}
            placeholder="000.000.000-00"
            value={cpf}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCpf(maskCPF(e.target.value))}
            onFocus={(e: React.FocusEvent<HTMLInputElement>) => {
              e.target.style.borderColor = accent;
              e.target.style.boxShadow = `0 0 0 3px ${accent}15`;
            }}
            onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
              e.target.style.borderColor = borderSub;
              e.target.style.boxShadow = 'none';
            }}
          />
        </div>
      )}
      {c.requirePhone && (
        <div style={s.field}>
          <label style={s.label}>{c.phoneLabel || 'Celular / WhatsApp'}</label>
          <input
            aria-label="Celular / WhatsApp"
            style={s.input}
            placeholder="(11) 99999-9999"
            value={phone}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setPhone(maskPhone(e.target.value))
            }
            onFocus={(e: React.FocusEvent<HTMLInputElement>) => {
              e.target.style.borderColor = accent;
              e.target.style.boxShadow = `0 0 0 3px ${accent}15`;
            }}
            onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
              e.target.style.borderColor = borderSub;
              e.target.style.boxShadow = 'none';
            }}
          />
        </div>
      )}
      <button
        style={{
          ...s.btn,
          opacity: validateStep1() ? 1 : 0.5,
          pointerEvents: validateStep1() ? 'auto' : 'none',
        }}
        onClick={() => goToStep(2)}
      >
        {c.btnStep1Text || 'Ir para Entrega'}
        <IconChevronRight />
      </button>
    </div>
  );

  /* ── Step 2: Delivery ─────────────────────────────────────────────────── */

  const renderStep2 = () => (
    <div style={s.card}>
      {renderStepLabel(2, 'Entrega')}
      <div style={s.field}>
        <label style={s.label}>CEP</label>
        <div style={{ position: 'relative' }}>
          <input
            aria-label="CEP"
            style={s.input}
            placeholder="00000-000"
            value={cep}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              const masked = maskCEP(e.target.value);
              setCep(masked);
              const digits = masked.replace(/\D/g, '');
              if (digits.length === 8) lookupCep(digits);
            }}
            onFocus={(e: React.FocusEvent<HTMLInputElement>) => {
              e.target.style.borderColor = accent;
              e.target.style.boxShadow = `0 0 0 3px ${accent}15`;
            }}
            onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
              e.target.style.borderColor = borderSub;
              e.target.style.boxShadow = 'none';
            }}
          />
          {cepLoading && (
            <span
              style={{
                position: 'absolute',
                right: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: 12,
                color: muted,
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                style={{ animation: 'spin 1s linear infinite' }}
              >
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="3"
                  fill="none"
                  strokeDasharray="31.4 31.4"
                  strokeLinecap="round"
                />
              </svg>
              <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            </span>
          )}
        </div>
      </div>
      <div style={s.field}>
        <label style={s.label}>Endereco</label>
        <input
          aria-label="Endereco"
          style={s.input}
          placeholder="Rua, avenida..."
          value={street}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStreet(e.target.value)}
          onFocus={(e: React.FocusEvent<HTMLInputElement>) => {
            e.target.style.borderColor = accent;
            e.target.style.boxShadow = `0 0 0 3px ${accent}15`;
          }}
          onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
            e.target.style.borderColor = borderSub;
            e.target.style.boxShadow = 'none';
          }}
        />
      </div>
      <div style={s.row}>
        <div style={s.field}>
          <label style={s.label}>Numero</label>
          <input
            aria-label="Numero"
            ref={numberInputRef}
            style={s.input}
            placeholder="123"
            value={number}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNumber(e.target.value)}
            onFocus={(e: React.FocusEvent<HTMLInputElement>) => {
              e.target.style.borderColor = accent;
              e.target.style.boxShadow = `0 0 0 3px ${accent}15`;
            }}
            onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
              e.target.style.borderColor = borderSub;
              e.target.style.boxShadow = 'none';
            }}
          />
        </div>
        <div style={s.field}>
          <label style={s.label}>Complemento</label>
          <input
            aria-label="Complemento"
            style={s.input}
            placeholder="Apto, bloco..."
            value={complement}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setComplement(e.target.value)}
            onFocus={(e: React.FocusEvent<HTMLInputElement>) => {
              e.target.style.borderColor = accent;
              e.target.style.boxShadow = `0 0 0 3px ${accent}15`;
            }}
            onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
              e.target.style.borderColor = borderSub;
              e.target.style.boxShadow = 'none';
            }}
          />
        </div>
      </div>
      <div style={s.field}>
        <label style={s.label}>Bairro</label>
        <input
          aria-label="Bairro"
          style={s.input}
          placeholder="Bairro"
          value={neighborhood}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNeighborhood(e.target.value)}
          onFocus={(e: React.FocusEvent<HTMLInputElement>) => {
            e.target.style.borderColor = accent;
            e.target.style.boxShadow = `0 0 0 3px ${accent}15`;
          }}
          onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
            e.target.style.borderColor = borderSub;
            e.target.style.boxShadow = 'none';
          }}
        />
      </div>
      <div style={s.row}>
        <div style={{ ...s.field, flex: 2 }}>
          <label style={s.label}>Cidade</label>
          <input
            aria-label="Cidade"
            style={s.input}
            placeholder="Cidade"
            value={city}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCity(e.target.value)}
            onFocus={(e: React.FocusEvent<HTMLInputElement>) => {
              e.target.style.borderColor = accent;
              e.target.style.boxShadow = `0 0 0 3px ${accent}15`;
            }}
            onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
              e.target.style.borderColor = borderSub;
              e.target.style.boxShadow = 'none';
            }}
          />
        </div>
        <div style={s.field}>
          <label style={s.label}>Estado</label>
          <input
            aria-label="Estado"
            style={s.input}
            placeholder="UF"
            maxLength={2}
            value={state}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setState(e.target.value.toUpperCase())
            }
            onFocus={(e: React.FocusEvent<HTMLInputElement>) => {
              e.target.style.borderColor = accent;
              e.target.style.boxShadow = `0 0 0 3px ${accent}15`;
            }}
            onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
              e.target.style.borderColor = borderSub;
              e.target.style.boxShadow = 'none';
            }}
          />
        </div>
      </div>
      <div style={{ display: 'flex', gap: '12px' }}>
        <button
          style={{
            ...s.btn,
            background: surface2,
            color: muted,
            boxShadow: 'none',
            border: `1px solid ${borderSub}`,
            flex: '0 0 auto',
            width: 'auto',
            padding: '16px 24px',
          }}
          onClick={() => goToStep(1)}
        >
          Voltar
        </button>
        <button
          style={{
            ...s.btn,
            opacity: validateStep2() ? 1 : 0.5,
            pointerEvents: validateStep2() ? 'auto' : 'none',
          }}
          onClick={() => goToStep(3)}
        >
          {c.btnStep2Text || 'Ir para Pagamento'}
          <IconChevronRight />
        </button>
      </div>
    </div>
  );

  /* ── Step 3: Payment ──────────────────────────────────────────────────── */

  const renderStep3 = () => (
    <div style={s.card}>
      {renderStepLabel(3, 'Pagamento')}

      {/* Payment method selector */}
      <div style={{ ...s.row, marginBottom: '24px' }}>
        {c.enableCreditCard && (
          <button
            style={s.methodBtn(paymentMethod === 'credit')}
            onClick={() => setPaymentMethod('credit')}
          >
            <IconCreditCard /> Cartao
          </button>
        )}
        {c.enablePix && supportsPix && (
          <button
            style={s.methodBtn(paymentMethod === 'pix')}
            onClick={() => setPaymentMethod('pix')}
          >
            <IconBarcode /> Pix
          </button>
        )}
        {c.enableBoleto && supportsBoleto && (
          <button
            style={s.methodBtn(paymentMethod === 'boleto')}
            onClick={() => setPaymentMethod('boleto')}
          >
            <IconBarcode /> Boleto
          </button>
        )}
      </div>

      {checkoutUnavailableReason && (
        <div
          style={{
            marginBottom: '20px',
            padding: '14px 16px',
            borderRadius: '12px',
            border: `1px solid ${accent}33`,
            background: `${accent}12`,
            color: text,
            fontSize: '13px',
            lineHeight: 1.6,
          }}
        >
          {checkoutUnavailableReason}
        </div>
      )}

      {/* Credit card form */}
      {paymentMethod === 'credit' && (
        <>
          <div style={s.field}>
            <label style={s.label}>Numero do cartao</label>
            <input
              aria-label="Numero do cartao"
              style={s.input}
              placeholder="0000 0000 0000 0000"
              value={cardNumber}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setCardNumber(maskCardNumber(e.target.value))
              }
              onFocus={(e: React.FocusEvent<HTMLInputElement>) => {
                e.target.style.borderColor = accent;
                e.target.style.boxShadow = `0 0 0 3px ${accent}15`;
              }}
              onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
                e.target.style.borderColor = borderSub;
                e.target.style.boxShadow = 'none';
              }}
            />
          </div>
          <div style={s.field}>
            <label style={s.label}>Nome no cartao</label>
            <input
              aria-label="Nome no cartao"
              style={s.input}
              placeholder="Como esta no cartao"
              value={cardName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCardName(e.target.value)}
              onFocus={(e: React.FocusEvent<HTMLInputElement>) => {
                e.target.style.borderColor = accent;
                e.target.style.boxShadow = `0 0 0 3px ${accent}15`;
              }}
              onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
                e.target.style.borderColor = borderSub;
                e.target.style.boxShadow = 'none';
              }}
            />
          </div>
          <div style={s.row}>
            <div style={s.field}>
              <label style={s.label}>Validade</label>
              <input
                aria-label="Validade do cartao"
                style={s.input}
                placeholder="MM/AA"
                value={cardExpiry}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setCardExpiry(maskExpiry(e.target.value))
                }
                onFocus={(e: React.FocusEvent<HTMLInputElement>) => {
                  e.target.style.borderColor = accent;
                  e.target.style.boxShadow = `0 0 0 3px ${accent}15`;
                }}
                onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
                  e.target.style.borderColor = borderSub;
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>
            <div style={s.field}>
              <label style={s.label}>CVV</label>
              <input
                aria-label="CVV"
                style={s.input}
                placeholder="123"
                maxLength={4}
                value={cardCVV}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setCardCVV(e.target.value.replace(/\D/g, '').slice(0, 4))
                }
                onFocus={(e: React.FocusEvent<HTMLInputElement>) => {
                  e.target.style.borderColor = accent;
                  e.target.style.boxShadow = `0 0 0 3px ${accent}15`;
                }}
                onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
                  e.target.style.borderColor = borderSub;
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>
          </div>
          <div style={s.field}>
            <label style={s.label}>Parcelas</label>
            <select
              style={{ ...s.input, appearance: 'none' as const, cursor: 'pointer' }}
              value={installments}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setInstallments(Number(e.target.value))
              }
            >
              {installmentOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {installmentInterest > 0 && (
              <div style={{ marginTop: '8px', fontSize: '11px', color: muted, lineHeight: 1.5 }}>
                Juros de {pricing.installmentInterestMonthlyPercent.toFixed(2)}% ao mes ja incluidos
                no total do cartao.
              </div>
            )}
          </div>
        </>
      )}

      {/* PIX */}
      {paymentMethod === 'pix' && (
        <div style={{ textAlign: 'center', padding: '20px 0', color: muted, fontSize: '14px' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>&#9889;</div>
          <p style={{ margin: 0 }}>O QR Code Pix sera gerado apos a confirmacao.</p>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: `${muted}88` }}>
            Pagamento instantaneo com desconto.
          </p>
        </div>
      )}

      {/* Boleto */}
      {paymentMethod === 'boleto' && (
        <div style={{ textAlign: 'center', padding: '20px 0', color: muted, fontSize: '14px' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>&#128196;</div>
          <p style={{ margin: 0 }}>O boleto sera gerado apos a confirmacao.</p>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: `${muted}88` }}>
            Vencimento em 3 dias uteis.
          </p>
        </div>
      )}

      {/* Order bumps */}
      {(pl.orderBumps || []).length > 0 && (
        <div style={{ marginTop: '20px' }}>
          {(pl.orderBumps || []).map((bump) => (
            <OrderBumpCard
              key={bump.id}
              bump={bump}
              checked={acceptedBumps.has(bump.id)}
              onToggle={(id) => {
                const next = new Set(acceptedBumps);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                setAcceptedBumps(next);
              }}
              accentColor={accent}
              cardBg={card}
              mutedColor={muted}
              textColor={text}
            />
          ))}
        </div>
      )}

      {/* Coupon */}
      {c.enableCoupon && (
        <div style={{ marginTop: '16px' }}>
          {couponApplied ? (
            <div style={{ ...s.badge, width: '100%', justifyContent: 'center' }}>
              <IconCheck /> Cupom {couponCode} aplicado — {formatBRL(couponDiscount)} de desconto
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                aria-label="Cupom de desconto"
                style={{ ...s.input, flex: 1 }}
                placeholder="Cupom de desconto"
                value={couponCode}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCouponCode(e.target.value)}
                onFocus={(e: React.FocusEvent<HTMLInputElement>) => {
                  e.target.style.borderColor = accent;
                  e.target.style.boxShadow = `0 0 0 3px ${accent}15`;
                }}
                onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
                  e.target.style.borderColor = borderSub;
                  e.target.style.boxShadow = 'none';
                }}
              />
              <button
                style={{
                  padding: '14px 20px',
                  background: `${accent}18`,
                  border: `1px solid ${accent}33`,
                  borderRadius: '10px',
                  color: accent,
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                  transition: 'background 0.2s',
                }}
                onClick={() => applyCoupon(couponCode)}
              >
                Aplicar
              </button>
            </div>
          )}
          {couponError && (
            <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '6px' }}>
              {couponError}
            </div>
          )}
        </div>
      )}

      {/* LGPD consent */}
      <label
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '8px',
          marginTop: '16px',
          cursor: 'pointer',
          fontSize: '13px',
          color: muted,
          lineHeight: '1.4',
        }}
      >
        <input
          type="checkbox"
          checked={consentChecked}
          onChange={(e) => setConsentChecked(e.target.checked)}
          style={{ marginTop: '2px', accentColor: '#E85D30', flexShrink: 0 }}
        />
        <span>
          Ao continuar, concordo com os{' '}
          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#E85D30', textDecoration: 'underline' }}
          >
            Termos de Uso
          </a>{' '}
          e{' '}
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#E85D30', textDecoration: 'underline' }}
          >
            Politica de Privacidade
          </a>
        </span>
      </label>

      {/* Submit buttons */}
      <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
        <button
          style={{
            ...s.btn,
            background: surface2,
            color: muted,
            boxShadow: 'none',
            border: `1px solid ${borderSub}`,
            flex: '0 0 auto',
            width: 'auto',
            padding: '16px 24px',
          }}
          onClick={() => goToStep(2)}
        >
          Voltar
        </button>
        <button
          disabled={!consentChecked || isSubmitting || Boolean(checkoutUnavailableReason)}
          style={{
            ...s.btn,
            opacity: !consentChecked || isSubmitting || checkoutUnavailableReason ? 0.5 : 1,
            pointerEvents:
              !consentChecked || isSubmitting || checkoutUnavailableReason ? 'none' : 'auto',
          }}
          onClick={handleSubmit}
        >
          <IconLock />
          {isSubmitting ? 'Processando...' : c.btnFinalizeText || 'Finalizar compra'}
        </button>
      </div>
      {orderError && (
        <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '6px' }}>{orderError}</div>
      )}
    </div>
  );

  /* ── Sidebar ──────────────────────────────────────────────────────────── */

  const renderSidebar = () => (
    <div style={s.sidebar}>
      {/* Product summary card */}
      <div style={s.card}>
        {/* Product image */}
        {c.productImage && (
          <div
            style={{
              width: '100%',
              height: '180px',
              borderRadius: '12px',
              overflow: 'hidden',
              marginBottom: '16px',
              background: surface2,
              border: `1px solid ${borderSub}`,
            }}
          >
            <img
              src={c.productImage}
              alt={c.productDisplayName || p.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
        )}

        {/* Product info */}
        <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>
          {c.productDisplayName || p.name}
        </div>
        {p.description && (
          <div style={{ fontSize: '13px', color: muted, marginBottom: '16px', lineHeight: '1.5' }}>
            {p.description}
          </div>
        )}

        {/* Price */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '20px' }}>
          <span
            style={{
              fontSize: '28px',
              fontWeight: 700,
              color: accent,
              fontFamily: c.fontDisplay || "'Playfair Display', serif",
            }}
          >
            {formatBRL(pl.priceInCents)}
          </span>
          {pl.compareAtPrice && (
            <span style={{ fontSize: '14px', color: muted, textDecoration: 'line-through' }}>
              {formatBRL(pl.compareAtPrice)}
            </span>
          )}
        </div>

        {/* Divider */}
        <div style={{ height: '1px', background: borderSub, margin: '0 0 16px' }} />

        {/* Summary */}
        <div style={s.summaryRow}>
          <span style={{ color: muted }}>Subtotal</span>
          <span>{formatBRL(subtotal)}</span>
        </div>
        {bumpTotal > 0 && (
          <div style={s.summaryRow}>
            <span style={{ color: muted }}>Adicionais</span>
            <span style={{ color: accent }}>+ {formatBRL(bumpTotal)}</span>
          </div>
        )}
        <div style={s.summaryRow}>
          <span style={{ color: muted }}>Frete</span>
          <span style={{ color: shipping === 0 ? '#22c55e' : text }}>
            {shipping === 0 ? 'Gratis' : formatBRL(shipping)}
          </span>
        </div>
        {discount > 0 && (
          <div style={s.summaryRow}>
            <span style={{ color: muted }}>Desconto</span>
            <span style={{ color: '#22c55e' }}>- {formatBRL(discount)}</span>
          </div>
        )}
        {installmentInterest > 0 && (
          <div style={s.summaryRow}>
            <span style={{ color: muted }}>Juros do parcelamento</span>
            <span style={{ color: accent }}>+ {formatBRL(installmentInterest)}</span>
          </div>
        )}
        <div style={{ height: '1px', background: borderSub, margin: '12px 0' }} />
        <div style={{ ...s.summaryRow, fontSize: '18px', fontWeight: 700 }}>
          <span>{installmentInterest > 0 ? 'Total no cartao' : 'Total'}</span>
          <span style={{ color: accent }}>{formatBRL(chargedTotal)}</span>
        </div>
      </div>

      {/* Trust badges */}
      {c.enableTrustBadges && c.trustBadges && c.trustBadges.length > 0 && (
        <div style={{ ...s.card, padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <span style={{ color: accent }}>
              <IconShield />
            </span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: accent }}>Compra segura</span>
          </div>
          {c.trustBadges.map((badge, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '4px 0',
                fontSize: '12px',
                color: muted,
              }}
            >
              <span style={{ color: '#22c55e' }}>
                <IconCheck />
              </span>{' '}
              {badge}
            </div>
          ))}
        </div>
      )}

      {/* Guarantee */}
      {c.enableGuarantee && (
        <div style={{ ...s.card, padding: '16px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: '28px', marginBottom: '8px' }}>&#128737;</div>
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>
            {c.guaranteeTitle || 'Garantia de 30 dias'}
          </div>
          <div style={{ fontSize: '12px', color: muted, lineHeight: '1.5' }}>
            {c.guaranteeText || 'Nao gostou? Devolvemos 100% do seu dinheiro.'}
          </div>
        </div>
      )}

      {/* Testimonials */}
      {c.enableTestimonials && c.testimonials && c.testimonials.length > 0 && (
        <div style={{ marginTop: '4px' }}>
          {c.testimonials.map((t, i) => (
            <div key={i} style={s.testimonialCard}>
              <div style={{ display: 'flex', gap: '3px', marginBottom: '8px' }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <IconStar key={star} filled={star <= t.rating} />
                ))}
              </div>
              <div
                style={{
                  fontSize: '13px',
                  color: text,
                  lineHeight: '1.5',
                  marginBottom: '8px',
                  fontStyle: 'italic',
                }}
              >
                &ldquo;{t.text}&rdquo;
              </div>
              <div style={{ fontSize: '12px', color: muted, fontWeight: 600 }}>{t.name}</div>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div
        style={{ textAlign: 'center', padding: '16px 0', fontSize: '11px', color: `${muted}88` }}
      >
        <div
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
        >
          <IconLock />
          {c.footerText || 'Checkout seguro por Kloel'}
        </div>
        {c.showPaymentIcons && (
          <div
            style={{
              marginTop: '8px',
              display: 'flex',
              justifyContent: 'center',
              gap: '8px',
              fontSize: '10px',
              color: `${muted}66`,
            }}
          >
            <span>Visa</span>
            <span>Mastercard</span>
            <span>Elo</span>
            <span>Pix</span>
          </div>
        )}
      </div>
    </div>
  );

  /* ── Coupon Modal ──────────────────────────────────────────────────────── */

  const renderCouponModal = () => {
    if (!showCouponModal) return null;
    return (
      <div style={s.overlay} onClick={() => setShowCouponModal(false)}>
        <div style={s.modal} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
          <button
            onClick={() => setShowCouponModal(false)}
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              background: 'none',
              border: 'none',
              color: muted,
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <IconX />
          </button>
          <div style={{ fontSize: '40px', marginBottom: '16px', color: accent }}>
            <IconGift />
          </div>
          <div
            style={{
              fontSize: '20px',
              fontWeight: 700,
              fontFamily: c.fontDisplay || "'Playfair Display', serif",
              marginBottom: '8px',
              color: text,
            }}
          >
            {c.couponPopupTitle || 'Presente especial para voce'}
          </div>
          <div style={{ fontSize: '14px', color: muted, marginBottom: '24px', lineHeight: '1.5' }}>
            {c.couponPopupDesc || 'Um desconto exclusivo para sua primeira compra.'}
          </div>
          {c.autoCouponCode ? (
            <button style={s.btn} onClick={() => applyCoupon(c.autoCouponCode!)}>
              {c.couponPopupBtnText || 'Aplicar desconto'}
            </button>
          ) : (
            <>
              <input
                aria-label="Codigo do cupom"
                style={{
                  ...s.input,
                  marginBottom: '12px',
                  textAlign: 'center',
                  textTransform: 'uppercase',
                  letterSpacing: '2px',
                }}
                placeholder="DIGITE SEU CUPOM"
                value={couponCode}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCouponCode(e.target.value)}
              />
              <button style={s.btn} onClick={() => applyCoupon(couponCode)}>
                {c.couponPopupBtnText || 'Aplicar desconto'}
              </button>
            </>
          )}
          <button
            onClick={() => setShowCouponModal(false)}
            style={{
              marginTop: '12px',
              background: 'none',
              border: 'none',
              color: muted,
              fontSize: '13px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              padding: '8px',
            }}
          >
            {c.couponPopupDismiss || 'Nao, obrigado'}
          </button>
        </div>
      </div>
    );
  };

  /* ── Success Modal ─────────────────────────────────────────────────────── */

  const renderSuccessModal = () => {
    if (!showSuccess) return null;
    return (
      <div style={s.overlay}>
        <div style={s.modal}>
          <div style={{ marginBottom: '16px' }}>
            <IconCheckCircle />
          </div>
          <div
            style={{
              fontSize: '22px',
              fontWeight: 700,
              fontFamily: c.fontDisplay || "'Playfair Display', serif",
              marginBottom: '8px',
              color: text,
            }}
          >
            Pedido confirmado!
          </div>
          <div style={{ fontSize: '14px', color: muted, lineHeight: '1.6', marginBottom: '24px' }}>
            Recebemos seu pedido com sucesso. Voce recebera um e-mail de confirmacao em instantes.
          </div>
          <div
            style={{
              background: surface2,
              borderRadius: '10px',
              padding: '16px',
              fontSize: '13px',
              color: muted,
              marginBottom: '20px',
              border: `1px solid ${borderSub}`,
            }}
          >
            <div style={{ marginBottom: '8px' }}>
              <span style={{ color: text, fontWeight: 600 }}>Produto:</span>{' '}
              {c.productDisplayName || p.name}
            </div>
            <div>
              <span style={{ color: text, fontWeight: 600 }}>
                {installmentInterest > 0 ? 'Total no cartao:' : 'Total:'}
              </span>{' '}
              <span style={{ color: accent, fontWeight: 700 }}>{formatBRL(chargedTotal)}</span>
            </div>
          </div>
          <button
            style={s.btn}
            onClick={() => {
              setShowSuccess(false);
              setStep(1);
            }}
          >
            Voltar ao inicio
          </button>
        </div>
      </div>
    );
  };

  /* ── Main render ───────────────────────────────────────────────────────── */

  return (
    <div style={s.page}>
      {/* Velvet Noir ambient orbs */}
      <div style={s.orbTop} />
      <div style={s.orbBottom} />

      {/* Orb animation keyframes */}
      <style>{`
        @keyframes noirOrbFloat {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(15px, 10px) scale(1.03); }
          50% { transform: translate(-10px, 20px) scale(0.97); }
          75% { transform: translate(8px, -8px) scale(1.02); }
        }
      `}</style>

      {/* Google Fonts */}
      {c.fontBody && (
        <link
          href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(c.fontBody)}:wght@300;400;500;600;700&display=swap`}
          rel="stylesheet"
        />
      )}
      {c.fontDisplay && c.fontDisplay !== c.fontBody && (
        <link
          href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(c.fontDisplay)}:wght@400;500;600;700&display=swap`}
          rel="stylesheet"
        />
      )}

      {/* Pixel events */}
      {pixelEvent && pixels.length > 0 && (
        <PixelTracker
          pixels={pixels}
          event={pixelEvent}
          value={total}
          currency={pl.currency || 'BRL'}
        />
      )}

      {/* Countdown timer — top position */}
      {c.enableTimer && (!c.timerPosition || c.timerPosition === 'top') && (
        <CountdownTimer
          enabled
          type={c.timerType}
          minutes={c.timerMinutes}
          message={c.timerMessage}
          expiredMessage={c.timerExpiredMessage}
          position="top"
          accentColor={accent}
          textColor={text}
        />
      )}

      <div style={s.container}>
        <div style={s.main}>
          {/* Brand header */}
          <div style={{ marginBottom: '28px' }}>
            <div style={{ marginBottom: '12px' }}>
              <KloelBrandLockup markSize={18} fontSize={15} fontWeight={600} />
            </div>
            {c.headerMessage && (
              <div style={{ fontSize: '13px', color: muted }}>
                {c.headerMessage}
                {c.headerSubMessage && (
                  <span style={{ color: accent, fontWeight: 600, marginLeft: '8px' }}>
                    {c.headerSubMessage}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Stock counter */}
          {c.showStockCounter && (
            <div style={{ marginBottom: '16px' }}>
              <StockCounter
                message={c.stockMessage || 'Restam apenas {n} unidades'}
                count={c.fakeStockCount || 0}
                accentColor={accent}
              />
            </div>
          )}

          {/* Countdown timer — below_header position */}
          {c.enableTimer && c.timerPosition === 'below_header' && (
            <CountdownTimer
              enabled
              type={c.timerType}
              minutes={c.timerMinutes}
              message={c.timerMessage}
              expiredMessage={c.timerExpiredMessage}
              position="below_header"
              accentColor={accent}
              textColor={text}
            />
          )}

          {renderProgressBar()}

          {/* Step content with fade animation */}
          <div
            style={{
              opacity: animating ? 0 : 1,
              transform: animating ? 'translateY(12px)' : 'translateY(0)',
              transition: 'opacity 0.25s, transform 0.25s',
            }}
          >
            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}
            {step === 3 && renderStep3()}

            {/* Countdown timer — above_button position */}
            {c.enableTimer && c.timerPosition === 'above_button' && (
              <CountdownTimer
                enabled
                type={c.timerType}
                minutes={c.timerMinutes}
                message={c.timerMessage}
                expiredMessage={c.timerExpiredMessage}
                position="above_button"
                accentColor={accent}
                textColor={text}
              />
            )}
          </div>
        </div>

        {renderSidebar()}
      </div>

      {renderCouponModal()}
      {renderSuccessModal()}

      {/* Exit Intent Popup */}
      <ExitIntentPopup
        enabled={!!c.enableExitIntent}
        title={c.exitIntentTitle}
        description={c.exitIntentDescription}
        couponCode={c.exitIntentCouponCode}
        onApplyCoupon={applyCoupon}
        accentColor={accent}
        textColor={text}
        cardColor={card}
      />

      {/* Floating security bar */}
      <FloatingBar
        enabled={!!c.enableFloatingBar}
        message={c.floatingBarMessage}
        accentColor={accent}
        textColor={text}
        backgroundColor={card}
      />

      {/* Responsive styles */}
      <style>{`
        @media (max-width: 768px) {
          body { font-size: 14px; }
        }
      `}</style>
      {(c as any)?.socialProofEnabled && (
        <SocialProofToast
          enabled={true}
          productName={(c as any).productDisplayName || pl?.name || ''}
          alerts={(c as any).socialProofAlerts}
          customNames={(c as any).socialProofCustomNames}
        />
      )}
      {(c as any)?.chatEnabled && (
        <KloelChatBubble
          enabled={true}
          welcomeMessage={(c as any).chatWelcomeMessage}
          delay={(c as any).chatDelay}
          position={(c as any).chatPosition}
          color={(c as any).chatColor || c?.accentColor}
          offerDiscount={(c as any).chatOfferDiscount}
          discountCode={(c as any).chatDiscountCode}
          supportPhone={(c as any).chatSupportPhone}
          productName={pl?.name}
          productPrice={formatBRL(pl.priceInCents)}
          productId={product?.id}
          planId={pl?.id}
          checkoutSlug={slug}
        />
      )}
    </div>
  );
}
