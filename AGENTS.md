# KLOEL Repository Governance

## Governance Boundary

Arquivos de governance e infraestrutura sao `read-only` para qualquer IA CLI deste repositorio.

Se um agente precisar mudar uma regra, um contrato, um baseline, um script de validacao ou qualquer mecanismo que possa enfraquecer os guardrails, ele deve parar e pedir para o humano fazer a mudanca ou aprovar explicitamente a mudanca de governance.

## Protected Files

Os arquivos protegidos sao definidos em `ops/protected-governance-files.json`.

Eles incluem, entre outros:

- `scripts/ops/**`
- `ops/**`
- `.github/workflows/**`
- `docs/codacy/**`
- `docs/design/**`
- `.codacy.yml`
- `package.json`
- `.husky/pre-push`
- `backend/eslint.config.mjs`
- `frontend/eslint.config.mjs`
- `worker/eslint.config.mjs`
- `CLAUDE.md`
- `AGENTS.md`

## Absolute Rule

IA CLI nao tem permissao para editar arquivos protegidos por conta propria.

Se a mudanca tocar qualquer arquivo protegido:

1. pare;
2. informe que a superficie e de governance;
3. peca para o humano executar ou aprovar a mudanca.

O gate `scripts/ops/check-governance-boundary.mjs` existe para reforcar essa fronteira.

## Codacy Lock

O estado de rigor maximo do Codacy faz parte da governance.

- `.codacy.yml` e `docs/codacy/**` sao superfices protegidas.
- IA CLI nao pode reduzir escopo do Codacy, desativar tool, pattern, gate, coverage, duplicacao ou complexidade.
- IA CLI nao pode usar comentarios de supressao para "resolver" Codacy (`biome-ignore`, `nosemgrep`, `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, `codacy:disable`, `codacy:ignore`, `NOSONAR`, `noqa`).
- IA CLI nao pode usar skip tags de commit para burlar analise (`[codacy skip]`, `[skip codacy]`, `[ci skip]`, `[skip ci]`).
- O unico fluxo permitido para estado live do Codacy e revalidar/sincronizar ou reaplicar o lock maximo via script oficial do repositorio.

<claude-mem-context>
# Memory Context

# [whatsapp_saas] recent context, 2026-04-19 9:00pm GMT-3

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (18,584t read) | 1,471,057t work | 99% savings

### Apr 19, 2026
199 5:22p 🔴 TypeScript TS1107 error in stripe-webhook.processor.ts after forEachSequential refactor
200 5:23p 🔴 Fixed stale response.status references causing TS18048 in 4 frontend proxy routes
201 " 🔵 Full inventory of 16 remaining legitimate biome-ignore suppressions after cleanup
205 5:25p 🔄 Eliminated 10 more biome-ignore suppressions via proper code fixes
206 5:26p 🔄 CommandPaletteItem replaced dangerouslySetInnerHTML+DOMPurify with pure React renderMarkedMarkup
207 " 🔴 TS2304 "Cannot find name 'i'" in checkout/[planId]/page.tsx after noArrayIndexKey fix
210 " 🔵 biome-ignore cleanup complete — 6 permanent suppressions remain, all justified
213 5:27p 🔵 biome-ignore cleanup final state — 5 noBarrelFile suppressions only
214 " 🔵 biome check reveals 5 noBarrelFile suppressions are unused + 9 new violations in 4 files
218 5:33p 🔵 openai-wrapper.spec.ts imports chatCompletionWithFallback not exported by implementation
219 " 🔵 marketing proxy route already uses findFirstSequential from async-sequence utility
220 " 🔵 Vitest path filtering requires setopt NO_NOMATCH in zsh — bracket paths fail without it
221 " 🔵 useCheckoutExperienceSocial uses router.push for redirects — Stripe flow stays on page
222 5:35p 🔴 TypeScript TS2344 in api.test.ts — vi.spyOn generic type narrowed to simpler structural type
223 " ✅ All three packages typecheck clean — frontend, worker, backend all pass tsc --noEmit
234 5:38p ✅ Zero suppression comments remain across all three packages — codacy-zero cleanup complete
235 " ✅ Full test suites pass: frontend 150/150, worker 74/74, backend 747/749 (2 skipped)
236 " 🔵 Frontend next build enforces NEXT_PUBLIC_API_URL at build time — fails without it
237 " ✅ Frontend webpack production build succeeds — 65 static pages, full app route manifest confirmed
238 " ✅ codacy-zero branch committed and pushed to GitHub — PR ready for review
243 5:39p ✅ Main suppression cleanup committed — "refactor(codacy): remove active-code suppressions" pushed to origin
244 " 🟣 PR #156 created — "refactor(codacy): remove active-code suppressions" — draft, awaiting review
246 5:40p 🔵 Automated PR merge blocked — draft state prevents merge; markReadyForReview GraphQL mutation uses wrong field
247 " 🔵 PR #156 merge blocked by conflicts — codacy-zero branch has non-clean merge into main
252 5:43p 🔄 PR #156 merged — codacy-zero suppression cleanup lands on main
253 5:44p 🔵 CI fails on main after PR #156 merge — architecture guardrails: 47 files exceed 600-line limit
263 8:13p 🔴 Fixed Prisma.JsonObject TypeScript error in ConnectLedgerReconciliationService
264 " 🟣 Added cron success and failure path tests to ConnectLedgerReconciliationService
265 " 🔵 Prisma client is stale — 13 test suites blocked by missing generated types
269 8:51p 🔵 main branch has uncommitted connect-platform-wallet changes
270 8:52p 🔵 codex-mem service unavailable in sandbox — nohup blocked by nice(5) permission error
271 " 🔵 connect-platform-wallet uncommitted diff: 1,441 insertions across 15 files
273 " 🟣 ConnectPayoutApprovalService — two-step admin approval flow for Connect payouts
274 " 🟣 ConnectLedgerReconciliationService — event-replay ledger drift detection with 15-min cron
275 " 🟣 ConnectController expanded with 6 new endpoints — account creation, onboarding, ledger, payouts, payout requests, reconcile
276 " 🟣 AdminCarteiraController — 4 new admin Connect endpoints with APPROVE permission guard
277 " 🔄 GoogleSignInButton helpers extracted to reduce useEffect cyclomatic complexity
284 8:54p 🔴 Fixed TS2304 in google-sign-in-button.tsx — missing import for extracted helpers + mode type mismatch
285 " 🟣 All 6 Connect backend test suites pass — 53 tests green after reconnection recovery
292 8:57p ⚖️ WAHA/Puppeteer WhatsApp deprecated — full migration to Meta Cloud API
293 " ⚖️ Meta access tokens provisioned — Kloel CIA app and Kloel Auth app
294 " ⚖️ Google OAuth compliance fixes — state parameter CSRF + RISC endpoint required
295 " 🟣 Compliance module scope defined — 7-task implementation plan for LGPD/GDPR/Meta/Google compliance
296 " 🟣 Facebook Login (NextAuth v5 FacebookProvider) integration scoped
297 " ⚖️ Checkout autofill architecture — four-layer payment UX strategy for Velvet Noir/Blanc
298 " ⚖️ Legal pages content requirements — Google Limited Use disclosure and Meta permissions table mandatory
299 " ⚖️ Kloel Terminator design system constraints defined for all new UI components
300 " ⚖️ Environment variables consolidated — comprehensive Railway/Vercel split documented
301 " ⚖️ Meta webhook endpoint architecture — single unified receiver for all channels and clients
302 8:59p 🔵 whatsapp_saas working tree has uncommitted connect-platform-wallet changes on main branch

Access 1471k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
