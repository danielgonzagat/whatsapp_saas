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

# [whatsapp_saas] recent context, 2026-04-19 5:31pm GMT-3

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (24,049t read) | 1,005,168t work | 98% savings

### Apr 19, 2026

41 3:27p 🔵 Final suppression audit: 389 biome-ignore, 23 nosemgrep, 4 eslint-disable remaining across all packages
45 3:29p 🔄 Eliminated all remaining eslint-disable suppressions in single batch — worker StripeRuntime, ioredis-mock ESM, ssrf void pattern, patch script ESM conversion
51 3:41p 🔄 whatsapp-catchup.service.ts biome-ignore suppressions eliminated
52 " 🔄 flow-engine-global.ts all biome-ignore suppressions eliminated
53 " 🔴 TypeScript errors in async-sequence.ts and catchup service fixed
54 " 🔵 Two biome-ignore comments remain in flow-engine-global.ts and catchup service after cleanup
57 3:42p 🔵 Kloel CIA architecture fully mapped — dual-layer implementation targets identified
58 " 🔵 Kloel prompt persona — full system prompt contract documented
59 " 🔵 marketingskills repo has 36 skills, not 34 — scope correction noted
60 " 🔵 CLAUDE.md autonomy and Codacy rules govern session behavior for whatsapp_saas
61 3:43p 🔄 autopilot-processor.ts biome-ignore suppressions batch eliminated — partial progress
62 " 🔵 autopilot-processor.ts remaining biome-ignore patterns identified
63 3:44p 🔄 autopilot-processor.ts second batch — 7 more biome-ignore suppressions eliminated
68 3:46p 🔵 biome-ignore count at 322 — new top offenders identified for next cleanup batch
69 " 🔵 cia-runtime.service.ts and whatsapp-watchdog.service.ts biome-ignore patterns assessed
70 3:47p 🔄 cia-runtime.service.ts all 7 biome-ignore suppressions eliminated
72 3:49p 🔄 memory-management.service.ts and checkout-plan-link.manager.ts biome-ignore suppressions eliminated
73 3:51p 🔵 Frontend biome-ignore audit complete — most suppressions are genuinely irreducible
74 " 🔵 codacy-zero branch git status — 50 modified files, 4 new files total
90 4:08p 🔄 noAwaitInLoops cleanup — dlq-monitor, waha.provider, unified-agent, SitesView
95 4:10p 🔴 TS1107 in waha.provider.ts — stale break inside recursive fetchPage
99 4:12p 🔄 SSE stream loops converted to recursive readStream in 3 frontend files
100 " 🔵 Remaining 196 biome-ignores — classified reducible vs irreducible targets
107 4:18p 🔄 Biome-ignore a11y suppressions replaced with semantic HTML in chat and affiliates components
108 " 🔵 MediaPreviewBox.tsx patch context mismatch — input element lives outside the clickable div
126 4:33p 🔄 Replaced noAwaitInLoops biome-ignore suppressions with forEachSequential helper
128 4:35p 🔄 Extended forEachSequential migration to 8 more kloel domain backend files
137 4:42p 🔄 Third batch of noAwaitInLoops suppressions replaced with forEachSequential — 10 backend files
165 5:00p 🔵 biome-ignore suppression inventory in codacy-zero worktree — 61 total across 40 files
170 5:03p 🔄 Batch removal of biome-ignore a11y and useExhaustiveDependencies suppressions — 14 files fixed
172 5:04p 🔴 useCheckoutPlans.ts fix revised from useState initializer to useMemo — useState approach was semantically wrong
173 " 🔵 Card.tsx and ToolCard.tsx were NOT patched by the first batch — original biome-ignore code still present after parallel write_file calls
175 5:05p 🔴 FlowSidebar.tsx TypeScript error after button refactor — DragEvent type updated from HTMLDivElement to HTMLButtonElement
177 5:06p 🔵 worker/utils/async-sequence.ts — new utility module with forEachSequential, findFirstSequential, pollUntil helpers
178 " 🔵 Shell glob expansion fails on bracket-named Next.js route directories when using sed/cat commands
182 5:15p 🔄 Biome suppression cleanup — 11 more comments removed in second batch
183 " 🔵 Full inventory of 34 remaining biome-ignore suppressions — classified as legitimate vs fixable
192 5:19p 🔄 Extracted sequential async utilities to replace biome-suppressed for-loops
193 5:20p 🔄 biome noAwaitInLoops suppressions eliminated from auth routes, proxy, and backend services
195 5:21p 🔄 findFirstSequential applied to marketing, KYC, cookie-consent, and PULSE proxy routes
197 " 🔴 useResetCouponOnQtyChange — useExhaustiveDependencies fixed via ref pattern
199 5:22p 🔴 TypeScript TS1107 error in stripe-webhook.processor.ts after forEachSequential refactor
200 5:23p 🔴 Fixed stale response.status references causing TS18048 in 4 frontend proxy routes
201 " 🔵 Full inventory of 16 remaining legitimate biome-ignore suppressions after cleanup
205 5:25p 🔄 Eliminated 10 more biome-ignore suppressions via proper code fixes
206 5:26p 🔄 CommandPaletteItem replaced dangerouslySetInnerHTML+DOMPurify with pure React renderMarkedMarkup
207 " 🔴 TS2304 "Cannot find name 'i'" in checkout/[planId]/page.tsx after noArrayIndexKey fix
210 " 🔵 biome-ignore cleanup complete — 6 permanent suppressions remain, all justified
213 5:27p 🔵 biome-ignore cleanup final state — 5 noBarrelFile suppressions only
214 " 🔵 biome check reveals 5 noBarrelFile suppressions are unused + 9 new violations in 4 files

Access 1005k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
