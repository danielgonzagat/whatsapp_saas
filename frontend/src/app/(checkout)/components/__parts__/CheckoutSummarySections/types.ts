import type { Dispatch, SetStateAction } from 'react';
import type { CheckoutDisplayTestimonial } from '@/lib/public-checkout-contract';
import type { CheckoutVisualTheme } from '../../checkout-theme-tokens';

export type SummaryProps = {
  theme: CheckoutVisualTheme;
  summaryOpen: boolean;
  setSummaryOpen: Dispatch<SetStateAction<boolean>>;
  qty: number;
  setQty: Dispatch<SetStateAction<number>>;
  couponCode: string;
  setCouponCode: Dispatch<SetStateAction<string>>;
  couponApplied: boolean;
  discount: number;
  subtotal: number;
  shippingInCents: number;
  totalWithInterest: number;
  productName: string;
  productImage?: string;
  unitPriceInCents: number;
  testimonials: CheckoutDisplayTestimonial[];
  fmtBrl: (value: number) => string;
  onApplyCoupon: () => void;
};

export type FooterProps = {
  theme: CheckoutVisualTheme;
  brandName: string;
  footerPrimary: string;
  footerSecondary: string;
  footerLegal: string;
};
