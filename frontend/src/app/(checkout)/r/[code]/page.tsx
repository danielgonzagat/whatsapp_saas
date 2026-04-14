import type { Metadata } from 'next';
import CheckoutShell from '../../components/CheckoutShell';

const PATTERN_RE = /\/+$/;

function getServerApiBase(): string {
  const envUrl =
    process.env.NEXT_PUBLIC_API_URL || process.env.BACKEND_URL || process.env.SERVICE_BASE_URL;
  if (envUrl) return envUrl.replace(PATTERN_RE, '');
  return 'http://localhost:3001';
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;

  try {
    const res = await fetch(`${getServerApiBase()}/checkout/public/r/${code}`, {
      next: { revalidate: 60 },
    });

    if (!res.ok) return { title: 'Checkout' };

    const data = await res.json();
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

export default async function CheckoutByCodePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <CheckoutShell slug={code} mode="code" />;
}
