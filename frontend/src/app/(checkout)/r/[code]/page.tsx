'use client';

import { use } from 'react';
import CheckoutShell from '../../components/CheckoutShell';

export default function CheckoutByCodePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  return <CheckoutShell slug={code} mode="code" />;
}
