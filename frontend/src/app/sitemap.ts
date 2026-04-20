import { legalConstants } from '@/lib/legal-constants';
import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date(`${legalConstants.lastUpdated}T00:00:00.000Z`);

  return [
    { url: `${legalConstants.siteUrl}`, lastModified, changeFrequency: 'weekly', priority: 1 },
    {
      url: `${legalConstants.siteUrl}/login`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${legalConstants.siteUrl}/register`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${legalConstants.siteUrl}/privacy`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${legalConstants.siteUrl}/privacy/en`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${legalConstants.siteUrl}/terms`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${legalConstants.siteUrl}/terms/en`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${legalConstants.siteUrl}/data-deletion`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${legalConstants.siteUrl}/data-deletion/en`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
  ];
}
