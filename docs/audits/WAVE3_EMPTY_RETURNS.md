# Wave 3 — Empty-Return Endpoint Audit

> Authored by PI atomic subagent `w3-empty-returns` (DeepSeek V4 Pro,
> ~21k events). Written by the subagent via atomic_author.
> Run date: 2026-05-26.


## Methodology

Audit executed on 2026-05-26 across the full `backend/src` tree, covering every
controller file annotated with `@Get`, `@Post`, `@Put`, `@Delete`, or `@Patch`.

Four detection strategies were applied:

1. **Literal empty arrays** — searched for `return [];`, `return { items: []`,
   `return { data: []` and variants (`const x = []; … return x;`) across all
   controller files.
2. **Trivial ok/success returns** — searched for `return { ok: true }` and
   `return { success: true }` patterns and verified that every match is
   preceded by a Prisma call or equivalent persistence side-effect.
3. **TODO/stub/placeholder markers** — searched for `// TODO`, `// stub`,
   `// placeholder`, `// FIXME` in controller bodies.
4. **Bare null/res passthrough** — searched for `return null;` and
   `return res;` at the end of decorated handler methods.

Health checks (`health/`, `/health`, `/health/*`, `system-health/*`),
metrics endpoints, and NestJS plumbing were excluded per the audit spec.
All `*.spec.ts` and `*.test.ts` files were skipped.

## Summary

- Total endpoint handlers scanned: ~550 (across 130+ controller files)
- Empty-array returns without Prisma: 0
- ok:true/success:true returns without persistence: 0
- TODO-marked returns: 0
- return-null/return-res dead endpoints: 0

## Empty-array returns

**None found.**

Every `return [];` or `{ items: [], … }` pattern observed in the codebase
falls into one of two legitimate categories:

- **Helper/guard functions** — e.g. `templateForAreaType()` in
  `member-structure.controller.ts:147` returns `[]` for unknown types, but
  this is a pure catalog lookup, not an endpoint handler.
- **Honest empty-state guards** — e.g. `connect.controller.ts:308,401`
  returns `{ items: [], total: 0 }` when `connectAccountBalance.findMany()`
  returns zero rows. The endpoint does call Prisma first; the empty return
  is a truthful representation of "no data found for this workspace."

Service-layer `return [];` instances (e.g. `calendar.service.ts:462`,
`dashboard.service.ts:48`, `omnichannel.helpers.ts:138`) are all
input-validation or no-data guard clauses, not stubs.

## OK-only returns

**None found without prior persistence.**

Every `{ ok: true }` / `{ success: true }` return in a decorated handler is
preceded by at least one Prisma mutation or equivalent side-effect:

| File | Route | Prisma call before return |
|------|-------|---------------------------|
| `ad-rules.controller.ts:111` | DELETE ad-rules/:id | `deleteMany` |
| `canvas.controller.ts:149` | DELETE canvas/:id | `deleteMany` |
| `kloel.controller.ts:307` | POST memory/save | `kloelService.saveMemory` |
| `site.controller.ts:500` | DELETE site/:id | `deleteMany` |
| `wallet.controller.ts:245` | DELETE bank-account/:id | `deleteMany` |
| `webinar.controller.ts:120` | DELETE webinar/:id | `deleteMany` |
| `member-enrollments.controller.ts:199` | DELETE enrollment | `deleteMany` + stats |
| `reports.controller.ts:201` | POST nps | `auditLog.create` |
| `mind-controller.ts:179` | POST resolve | `policy.resolveOutcome` |
| `auth.service.ts:317` | logout | `refreshToken.updateMany` + Redis |
| `compliance.service.ts:109` | facebook-deauthorize | `socialAccount.updateMany` |
| `payment-webhook-generic.controller.ts` | webhook/payment/* | log + update + autopilot |
| `cookie-consent.controller.ts:106` | POST consent | `saveForAgent` → Prisma |

All webhook ACK responses (`payment-webhook-generic.controller.ts`,
`email-marketing-webhook.controller.ts`) perform idempotency checks,
webhook-event logging, and business-side-effect dispatch before returning
`{ ok: true }` or `{ received: true }`.

The `lacunas.controller.ts:28` POST handler writes to a filesystem JSONL
artifact (not Prisma), then returns `{ ok: true }`. This is persistence
(fs write), albeit not database persistence. Acceptable as a low-friction
suggestion collector.

## TODO-marked returns

**None found.** A full-text search for `TODO`, `FIXME`, `HACK`,
`placeholder`, `not_implemented` across all `backend/src/**/*.controller.ts`
files returned zero matches. The search was extended to service files;
"placeholder" hits there are exclusively template-variable substitution
context (`{{name}}` → `PLACEHOLDER_RE`), not incomplete implementations.

## return-null / return-res endpoints

**None found.** All `return null;` matches in controller files are inside
private helper methods (token extraction, signature parsing, guard logic),
not inside decorated `@Get`/`@Post`/etc. handler methods. No handler
returns `res` directly.

## Top 5 endpoints to monitor (not stubs, but lightweight)

No dead endpoints require wiring. For completeness, five endpoints that
merit ongoing correctness vigilance:

1. **`GET /growth/qr/whatsapp`** — `GrowthController.generateQr`
   (`growth.controller.ts:12`): generates a QR code URL from a phone number
   without calling Prisma. Returns real computed data. Acceptable utility
   endpoint, but if QR analytics were intended, revisit.

2. **`GET /media/video/ping`** — `VideoController.ping`
   (`media/video.controller.ts:14`): returns a static capabilities contract
   from `VideoService.describeCapabilities()` with no Prisma call.
   Acceptable as a contract-discovery endpoint.

3. **`POST /admin/lacunas-suggest`** — `LacunasController.suggest`
   (`lacunas.controller.ts:15`): persists to filesystem JSONL, not Prisma.
   Returns `{ ok: true }`. Acceptable, but filesystem persistence has no
   workspace isolation guarantees.

4. **`GET /api/v1/cookie-consent`** — `CookieConsentController.getConsent`
   (`cookie-consent.controller.ts:62`): can return `{ consent: null }` when
   no agent and no cookie. Honest empty state; callers must handle null.

5. **All `DELETE` endpoints returning `{ success: true }`** — every
   delete-entity endpoint returns `{ success: true }` rather than 204.
   Consistent pattern. Callers cannot distinguish "deleted" from
   "nothing to delete" without a separate GET.

## Conclusion

Wave 3 found zero violations of the "zero empty returns" invariant.
The backend is clean. All endpoint responses are either:

- Prisma-backed data returns, or
- `{ ok: true }` / `{ success: true }` after confirmed persistence, or
- Honest empty states (`{ items: [], total: 0 }`) after Prisma queries
  confirmed zero matching rows.

No further remediation is required for this wave.
