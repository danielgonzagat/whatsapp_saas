# kloel.com apex + www domain setup runbook

> Attaches apex `kloel.com` + `www.kloel.com` to the Vercel marketing project.

**Owner:** Daniel
**Last update:** 2026-05-26 — W28 Tier 1 wave
**Sister:** [pay-kloel-domain-setup](pay-kloel-domain-setup.md)

## Pre-checks

```sh
# Landing component exists
ls frontend/src/components/kloel/landing/KloelLanding.tsx

# Public routes exist
ls frontend/src/app/\(public\)/{terms,privacy,cookies,data-deletion}/page.tsx

# Sitemap and robots are live
ls frontend/src/app/sitemap.ts frontend/src/app/robots.ts

# CORS allows kloel.com
grep -n "kloel.com" backend/src/main.ts
```

## Step 1 — Attach apex + www in Vercel

Via dashboard:

1. https://vercel.com/kloel/kloel-frontend/settings/domains
2. Add `kloel.com` (apex)
3. Add `www.kloel.com`
4. Vercel suggests setting `www.kloel.com` → redirects to `kloel.com` (recommended)

## Step 2 — Create the DNS records in Cloudflare

For apex (CNAME flattening required at Cloudflare):

```
Type:  CNAME (flattened)
Name:  @
Target: cname.vercel-dns.com
Proxy: DNS-only initially, then Proxied after cert is Active
```

For www:

```
Type:  CNAME
Name:  www
Target: cname.vercel-dns.com
Proxy: same flow
```

## Step 3 — Configure www → apex redirect

In `frontend/next.config.ts` add:

```typescript
async redirects() {
  return [
    {
      source: '/:path*',
      has: [{ type: 'host', value: 'www.kloel.com' }],
      destination: 'https://kloel.com/:path*',
      permanent: true,
    },
  ];
}
```

Deploy via `vercel --prod`.

## Step 4 — Verify cert + redirect

```sh
vercel domains inspect kloel.com
vercel domains inspect www.kloel.com

# 301 from www → apex
curl -I https://www.kloel.com/
# expect: HTTP/2 301
#         location: https://kloel.com/

# apex returns landing
curl -fsSL https://kloel.com/ | head -50

# sitemap and robots live
curl -fsSL https://kloel.com/sitemap.xml | head -20
curl -fsSL https://kloel.com/robots.txt
```

## Step 5 — Google Search Console (optional but recommended)

1. https://search.google.com/search-console
2. Add property `https://kloel.com/`
3. Verify via DNS TXT record
4. Submit `https://kloel.com/sitemap.xml`

## Step 6 — SEO smoke

```sh
# Lighthouse audit
npx lighthouse https://kloel.com/ --only-categories=seo

# Test structured data (if any JSON-LD)
curl -fsSL https://kloel.com/ | grep -o 'application/ld+json' || echo 'no JSON-LD'
```

## Rollback

```sh
vercel domains rm kloel.com kloel-frontend
vercel domains rm www.kloel.com kloel-frontend
# Delete DNS records in Cloudflare
```

## Related

- [pay-kloel-domain-setup.md](pay-kloel-domain-setup.md)
- [frontend/src/app/sitemap.ts](../../frontend/src/app/sitemap.ts)
- [frontend/src/app/robots.ts](../../frontend/src/app/robots.ts)
