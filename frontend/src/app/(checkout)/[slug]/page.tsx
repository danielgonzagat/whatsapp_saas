import type { PublicCheckoutResponse } from '@/lib/public-checkout-contract';
import type { Metadata } from 'next';
import CheckoutClient from './CheckoutClient';
import { getServerApiBase } from '../server-api-base';

/* ─── generateMetadata ─────────────────────────────────────────────────────── */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  try {
    const res = await fetch(`${getServerApiBase()}/checkout/public/${slug}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      return { title: 'Checkout' };
    }

    const data: PublicCheckoutResponse = await res.json();
    const config = data.checkoutConfig;
    const product = data.product;

    const title = config?.metaTitle || config?.productDisplayName || product?.name || 'Checkout';
    const description = config?.metaDescription || product?.description || '';

    const metadata: Metadata = {
      title,
      description,
    };

    if (config?.metaImage) {
      metadata.openGraph = {
        title,
        description,
        images: [{ url: config.metaImage }],
      };
      metadata.twitter = {
        card: 'summary_large_image',
        title,
        description,
        images: [config.metaImage],
      };
    }

    if (config?.favicon) {
      metadata.icons = { icon: config.favicon };
    }

    return metadata;
  } catch {
    return { title: 'Checkout' };
  }
}

/* ─── Page component ───────────────────────────────────────────────────────── */

export default async function CheckoutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <CheckoutClient slug={slug} />;
}
