import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://kloel.com';

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
      ],
      disallow: ['/dashboard/', '/settings/', '/api/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
