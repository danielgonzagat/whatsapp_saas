// Pure helpers extracted from (checkout)/[slug]/page.tsx and
// (checkout)/r/[code]/page.tsx to reduce the host modules' cyclomatic
// complexity. Behaviour is preserved byte-for-byte.

import type { Metadata } from 'next';

const TRAILING_SLASH_RE = /\/+$/;

/** Resolve the server-side API base used by checkout metadata fetches. */
export function getServerApiBase(): string {
  const envUrl =
    process.env.NEXT_PUBLIC_API_URL || process.env.BACKEND_URL || process.env.SERVICE_BASE_URL;
  if (envUrl) {
    return envUrl.replace(TRAILING_SLASH_RE, '');
  }
  return 'http://localhost:3001';
}

type CheckoutConfig = {
  metaTitle?: string | null;
  metaDescription?: string | null;
  metaImage?: string | null;
  productDisplayName?: string | null;
  favicon?: string | null;
};

type CheckoutProduct = {
  name?: string | null;
  description?: string | null;
};

type CheckoutMetadataSource = {
  checkoutConfig?: CheckoutConfig | null;
  product?: CheckoutProduct | null;
};

function resolveTitle(source: CheckoutMetadataSource): string {
  const { checkoutConfig: config, product } = source;
  return config?.metaTitle || config?.productDisplayName || product?.name || 'Checkout';
}

function resolveDescription(source: CheckoutMetadataSource): string {
  const { checkoutConfig: config, product } = source;
  return config?.metaDescription || product?.description || '';
}

function applyMetaImage(
  metadata: Metadata,
  config: CheckoutConfig,
  title: string,
  description: string,
): void {
  if (!config.metaImage) {
    return;
  }
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

function applyFavicon(metadata: Metadata, config: CheckoutConfig): void {
  if (!config.favicon) {
    return;
  }
  metadata.icons = { icon: config.favicon };
}

/**
 * Build a Next.js `Metadata` object from a raw checkout payload. Pure; no
 * side effects. The host page modules compose this with the network fetch.
 */
export function buildCheckoutMetadata(source: CheckoutMetadataSource | null | undefined): Metadata {
  const safeSource: CheckoutMetadataSource = source || {};
  const title = resolveTitle(safeSource);
  const description = resolveDescription(safeSource);

  const metadata: Metadata = { title, description };
  const config = safeSource.checkoutConfig;
  if (config) {
    applyMetaImage(metadata, config, title, description);
    applyFavicon(metadata, config);
  }
  return metadata;
}

/**
 * Fetch the public checkout payload and return Next.js metadata. Any failure
 * degrades to a plain `{ title: 'Checkout' }`; the host pages remain pure.
 */
export async function fetchCheckoutMetadata(endpointPath: string): Promise<Metadata> {
  try {
    const res = await fetch(`${getServerApiBase()}${endpointPath}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      return { title: 'Checkout' };
    }
    const data = (await res.json()) as CheckoutMetadataSource;
    return buildCheckoutMetadata(data);
  } catch {
    return { title: 'Checkout' };
  }
}
