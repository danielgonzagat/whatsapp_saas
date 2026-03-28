'use client';

import { use } from 'react';
import CheckoutShell from '../components/CheckoutShell';

export default function CheckoutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  return <CheckoutShell slug={slug} />;
}
