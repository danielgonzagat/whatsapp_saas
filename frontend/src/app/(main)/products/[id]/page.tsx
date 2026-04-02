'use client';

export const dynamic = 'force-dynamic';

import { useParams, useRouter } from 'next/navigation';
import ProductNerveCenter from '@/components/kloel/products/ProductNerveCenter';

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params?.id as string;

  return (
    <ProductNerveCenter
      productId={productId}
      onBack={() => router.push('/products')}
    />
  );
}
