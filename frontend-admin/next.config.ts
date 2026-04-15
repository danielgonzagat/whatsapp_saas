import path from 'node:path';
import type { NextConfig } from 'next';

// Wave 1 — enforce that NEXT_PUBLIC_ADMIN_API_URL is set for production
// builds. Catching this at build time is better than a 401/502 flood once
// the preview deployment is serving traffic.
if (process.env.NODE_ENV === 'production' && !process.env.NEXT_PUBLIC_ADMIN_API_URL) {
  throw new Error(
    'NEXT_PUBLIC_ADMIN_API_URL must be set at build time for production builds. ' +
      'Configure it in the Vercel project (kloel-admin) before triggering the ' +
      'production build.',
  );
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    // Pin root so Turbopack doesn't get confused by the sibling
    // frontend/ lockfile at the monorepo root.
    root: path.join(__dirname),
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: 'localhost' },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
