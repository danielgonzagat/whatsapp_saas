'use client';

import CheckoutShell from '../components/CheckoutShell';
import type { PublicCheckoutServerResult } from '../public-checkout-server';

interface CheckoutClientProps extends PublicCheckoutServerResult {
  slug: string;
}

/** Checkout client. */
export default function CheckoutClient({ slug, initialData, initialError }: CheckoutClientProps) {
  return <CheckoutShell slug={slug} initialData={initialData} initialError={initialError} />;
}
