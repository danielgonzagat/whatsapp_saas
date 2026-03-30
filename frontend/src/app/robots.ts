import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/dashboard/', '/settings/', '/api/'] },
    sitemap: 'https://kloel.com/sitemap.xml',
  };
}
