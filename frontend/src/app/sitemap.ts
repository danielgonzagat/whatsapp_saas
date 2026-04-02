import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: 'https://kloel.com', lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    { url: 'https://kloel.com/login', lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: 'https://kloel.com/register', lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
  ];
}
