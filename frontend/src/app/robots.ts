import { legalConstants } from '@/lib/legal-constants';
import type { MetadataRoute } from 'next';

/** Robots. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: [
        '/',
        '/privacy',
        '/privacy/en',
        '/terms',
        '/terms/en',
        '/data-deletion',
        '/data-deletion/en',
        '/cookies',
      ],
      disallow: ['/dashboard/', '/settings/', '/api/'],
    },
    sitemap: `${legalConstants.siteUrl}/sitemap.xml`,
  };
}
