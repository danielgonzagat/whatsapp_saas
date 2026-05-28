# pay.kloel.com domain setup runbook

> Attaches `pay.kloel.com` as a public Vercel domain for the public-checkout route group.

**Owner:** Daniel
**Last update:** 2026-05-26 — W28 Tier 1 wave
**Pattern:** mirrors `/skills/cf-wire-domain` global skill

## Pre-checks

```sh
# 1. CORS already allowlists pay.kloel.com — verify
grep -n "pay.kloel" backend/src/main.ts

# 2. The public-checkout route exists
ls frontend/src/app/\(public\)/pay/page.tsx

# 3. You own kloel.com on Cloudflare (zone DNS)
# 4. You have access to the kloel-frontend Vercel project
```

## Step 1 — Attach the domain in Vercel

Via dashboard:

1. https://vercel.com/kloel/kloel-frontend/settings/domains
2. Add Domain → `pay.kloel.com` → Continue
3. Vercel shows the DNS record it wants — typically:
   ```
   Type:  CNAME
   Name:  pay
   Value: cname.vercel-dns.com
   ```

Or via CLI:

```sh
vercel domains add pay.kloel.com kloel-frontend
```

## Step 2 — Create the DNS record in Cloudflare

1. https://dash.cloudflare.com/{account}/kloel.com/dns
2. Add record:
   - Type: `CNAME`
   - Name: `pay`
   - Target: `cname.vercel-dns.com`
   - Proxy status: **DNS-only** (gray cloud) until cert validates
   - TTL: Auto

3. Wait 30-60s for propagation

## Step 3 — Validate cert issuance

```sh
# Check Vercel's cert status
vercel domains inspect pay.kloel.com

# Or curl directly — should return 200 once cert is live
curl -I https://pay.kloel.com/
```

When `vercel inspect` reports the cert is `Active`, flip Cloudflare proxy from
DNS-only → Proxied (orange cloud) for DDoS protection.

## Step 4 — Add the rewrite middleware

If `frontend/src/middleware.ts` exists, extend it to rewrite `pay.kloel.com/*`
to `/(public)/pay/*`. Otherwise create:

```typescript
// frontend/src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const host = req.headers.get('host') ?? '';
  if (host === 'pay.kloel.com') {
    // rewrite pay.kloel.com/<slug> → /pay/<slug>
    const url = req.nextUrl.clone();
    if (!url.pathname.startsWith('/pay')) {
      url.pathname = '/pay' + url.pathname;
    }
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|api|favicon.ico).*)'],
};
```

Deploy via `vercel --prod`.

## Step 5 — Verify

```sh
# Public checkout reachable
curl -fsSL https://pay.kloel.com/r/test-code | head -50

# CORS allowed for backend calls
curl -fsSL https://api.kloel.com/checkout/public/r/test-code \
  -H "Origin: https://pay.kloel.com" \
  -I | grep -i access-control
```

## Rollback

```sh
vercel domains rm pay.kloel.com kloel-frontend
# Delete the CNAME in Cloudflare
```

## Related

- [scripts/ops/check-vercel-deploy.mjs](../../scripts/ops/check-vercel-deploy.mjs) — if exists; CI gate
- [docs/runbooks/kloel-com-domain-setup.md](kloel-com-domain-setup.md) — sister runbook for apex
- `cf-wire-domain` skill — `Skill(skill: "cf-wire-domain")` for the Cloudflare side
