'use client';

export const dynamic = 'force-dynamic';

import ProductNerveCenter from '@/components/kloel/products/ProductNerveCenter';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const productId = params?.id as string;

  return (
    <ProductNerveCenter
      productId={productId}
      initialTab={searchParams.get('tab') || undefined}
      initialPlanSub={searchParams.get('planSub') || undefined}
      initialComSub={searchParams.get('comSub') || undefined}
      initialModal={searchParams.get('modal') || undefined}
      initialFocus={searchParams.get('focus') || undefined}
      onBack={() => router.push('/products')}
    />
  );
}
