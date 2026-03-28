'use client';

import CheckoutShell from '../components/CheckoutShell';

interface CheckoutClientProps {
  slug: string;
}

export default function CheckoutClient({ slug }: CheckoutClientProps) {
  return <CheckoutShell slug={slug} />;
}
