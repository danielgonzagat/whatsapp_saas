import type { MetadataRoute } from 'next';
import { LEGAL_LAST_UPDATED } from '@/lib/legal-constants';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://kloel.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const legalLastModified = new Date(`${LEGAL_LAST_UPDATED}T00:00:00-03:00`);

  return [
    { url: `${SITE_URL}`, lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    {
      url: `${SITE_URL}/login`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/register`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: legalLastModified,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/privacy/en`,
      lastModified: legalLastModified,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified: legalLastModified,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/terms/en`,
      lastModified: legalLastModified,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/data-deletion`,
      lastModified: legalLastModified,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/data-deletion/en`,
      lastModified: legalLastModified,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
  ];
}
