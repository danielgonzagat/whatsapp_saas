# Architectural Semantic Canonicalization — Definition of Done audit

> **Mission**: reduce semantic entropy of the Kloel codebase until every domain,
> service, event, capability, and concept has one canonical name, one canonical
> implementation, one canonical location, and one canonical contract.
>
> **Audit date**: 2026-05-21
> **Branch**: `feat/kloel-cognitive-organism`

## DoD criteria (from mission template) — current status

| # | Criterion | Status | Artifact / evidence |
|---|---|---|---|
| 1 | Mapa oficial dos domínios | ✅ | [`CANONICAL_DOMAINS.md`](CANONICAL_DOMAINS.md) — 52 backend + 12 frontend + 3 admin + 2 worker domains, mapped to CLAUDE.md DAG phases 0-6 |
| 2 | Dicionário oficial de nomes | ✅ | [`CANONICAL_VOCABULARY.md`](CANONICAL_VOCABULARY.md) — 45 entries with canonical name + alternatives + scope |
| 3 | Catálogo oficial de capacidades | ✅ | [`CAPABILITY_MAP.md`](CAPABILITY_MAP.md) — 50+ capabilities, grouped by phase, each with canonical service + deprecated alternatives + related events |
| 4 | Catálogo oficial de eventos | ✅ | [`EVENT_TAXONOMY.md`](EVENT_TAXONOMY.md) — 70 canonical Spine events in 6 namespaces; 13 non-canonical flagged; naming convention formalized |
| 5 | Catálogo oficial de serviços | ✅ | [`SERVICE_CATALOG.md`](SERVICE_CATALOG.md) — 555 services indexed; 286 enriched with JSDoc one-liners (51%); remaining 269 carry placeholder + auto-extracted file context |
| 6 | Registro de duplicações | ✅ | [`DUPLICATION_REGISTER.md`](DUPLICATION_REGISTER.md) — primary register + [`GRAPHIFY_DUPLICATES.md`](GRAPHIFY_DUPLICATES.md) — 1028 cross-context candidates indexed |
| 7 | Plano de migração | 🟡 partial | [`DEPRECATION_MAP.md`](DEPRECATION_MAP.md) — 25+ migrations mapped (16 done, 9 pending); next 20 high-leverage candidates listed in GRAPHIFY_DUPLICATES with migration recipe |
| 8 | Redução comprovada | ✅ | 53 duplications → 23 canonical helpers. UnknownRecord: 30→1. clamp/clampScore/daysSince: 16→3. normalizePhone facets: 4→3. normalizeEmail/safeStr: 6→2. ToolResult/Role: 2 type re-exports |
| 9 | Build/typecheck/lint/testes | ✅ | Backend tsc strict 0 errors; Worker tsc 0; Frontend tsc 0. Specs locked: 13/13 MP signature, 768 backend gate specs, build green |
| 10 | Documentação suficiente | ✅ | 12 architecture artifacts in `docs/architecture/` (3,800+ lines total). Each has navigation links + how-to-extend section |
| 11 | Regras anti-regressão | 🟡 partial | 2 active gates: `canonical:check` (duplicates + events). Pre-push enforces via `husky/pre-push`. ESLint custom rule planned (not yet implemented) |

**Score: 9/11 fully done, 2/11 partial. ~85% complete.**

## What was delivered this mission (all phases)

### Phase 1 — INVENTÁRIO
- ✅ All domains mapped (52 backend, 12 frontend, 3 admin, 2 worker)
- ✅ All services indexed (555 backend, partial frontend)
- ✅ All routes catalogued ([`ROUTES_CATALOG.md`](ROUTES_CATALOG.md) — 922 lines)
- ✅ All Prisma models catalogued ([`PRISMA_USAGE.md`](PRISMA_USAGE.md))
- ✅ All BullMQ queues + job names ([`QUEUES_CATALOG.md`](QUEUES_CATALOG.md))

### Phase 2 — MAPA DE CAPACIDADES
- ✅ 50+ business capabilities documented
- ✅ Grouped by CLAUDE.md DAG phase (0-6)
- ✅ Each capability: canonical service + deprecated alternatives + events + status

### Phase 3 — DETECÇÃO DE DUPLICAÇÕES SEMÂNTICAS
- ✅ Regex-based scanner (`tools/canonicalize/scan.mjs`)
- ✅ Graphify-driven detector (`tools/canonicalize/graphify-driven-dedup.mjs`)
  - Schema-v2 updated, property-name filters, cross-context locality
  - 1028 active cross-bounded-context candidates indexed
- ✅ JSDoc enricher (`tools/canonicalize/enrich-service-catalog.mjs`)
- ✅ Migration codemod template (`tools/canonicalize/migrate-unknown-record.mjs`)

### Phase 4 — DEFINIÇÃO CANÔNICA
- ✅ 23 canonical helpers established under `backend/src/common`:
  - `math.ts`: `clamp`, `clampScore`, `daysSince`
  - `string.ts`: `normalizeEmail`, `safeStr`
  - `phone.ts`: `digitsOnly`, `digitsOrNull`, `whatsappDigits`
  - `types.ts`: `UnknownRecord`
  - `money.ts`: cents helpers
  - `idempotency.guard.ts`, `idempotency-fingerprint.ts`
  - `pagination-clamp.pipe.ts`
- ✅ Re-export pattern documented + applied
- ✅ Conditional spread pattern for `exactOptionalPropertyTypes`

### Phase 5 — MIGRAÇÃO SEGURA
- ✅ 53 instances migrated to canonical
- ✅ TS strict 0 errors across packages after each migration
- ✅ Every migration is a small, reversible commit
- ✅ Backwards-compatible re-export pattern preserves caller stability

### Phase 6 — DOCUMENTAÇÃO CANÔNICA
12 artifacts in `docs/architecture/`:

| File | Lines | Purpose |
|---|---:|---|
| `ARCHITECTURE_INDEX.md` | 38 | Navigation hub |
| `CANONICAL_DOMAINS.md` | ~220 | Bounded contexts + DAG phases |
| `CANONICAL_VOCABULARY.md` | 89 | Term-level naming |
| `CAPABILITY_MAP.md` | ~380 | What system does |
| `EVENT_TAXONOMY.md` | ~210 | 70 canonical events |
| `SERVICE_CATALOG.md` | 752 | 555 services |
| `DUPLICATION_REGISTER.md` | 110 | Manual register |
| `GRAPHIFY_DUPLICATES.md` | ~1100 | Auto-detected candidates |
| `DEPRECATION_MAP.md` | 40 | Legacy → canonical |
| `ROUTES_CATALOG.md` | 922 | API surface |
| `QUEUES_CATALOG.md` | ~80 | Async work |
| `PRISMA_USAGE.md` | 178 | Model ownership |
| `CANONICALIZATION_DOD.md` | (this) | This audit |

### Phase 7 — GATES ANTI-REGRESSÃO
- ✅ `scripts/ops/check-canonical-duplicates.mjs` — flags new duplicates in scope
- ✅ `scripts/ops/check-canonical-events.mjs` — flags non-canonical event names
- ✅ Wired in pre-push via Husky + lint-staged
- ✅ `npm run canonical:scan` regenerates artifacts
- ✅ `npm run canonical:check` validates current state
- ✅ `npm run canonical:baseline` ratchets after intentional change
- 🟡 ESLint custom rule **not yet implemented** — would block:
  - New `type Foo = Record<string, unknown>` outside `common/types.ts`
  - New `function normalizePhone` outside `common/phone.ts`
  - New `function clamp` outside `common/math.ts`
  - etc.
  - Recommendation: extract from existing scanner into an ESLint plugin

## Open items (out of session budget)

### Tier 1 — concrete migration backlog
20 high-leverage cross-context dupes from GRAPHIFY_DUPLICATES.md. Each requires:
- semantic verification (read both impls, confirm equivalent)
- canonical home decision
- migration codemod (often via factory pattern for closure-heavy helpers)
- caller migration
- tsc/lint/test validation

Estimated: 30-60 min per migration. 20 × 45 min = 15h.

Top 20 candidates with action notes:

| Symbol | # files | Action |
|---|---:|---|
| `makeEvent` | 29 | Factory pattern under `backend/test/helpers/spine-event.factory.ts` |
| `MockPrisma` / `PrismaMock` | 53 combined | Consolidate under `backend/test/helpers/prisma.mock.ts` |
| `PATTERN_RE` / `D_RE` / `S_RE` | 110 combined | Verify same regex; canonicalize under domain-specific `*.regex.ts` |
| `unique` | 27 | If in `scripts/pulse/*` (protected): skip. Else: `backend/src/common/arrays.ts` |
| `EMBER` | 24 | Design token — canonicalize in `frontend/src/lib/design-tokens.ts` |
| `dynamic` | 28 | Next.js import marker — NOT a duplicate, verify + add to skip-list |
| `buildService` | 29 | Test helper — same approach as `makeEvent` |
| `FlexMock` | 22 | Test helper — consolidate |
| `readText` | 21 | Likely fs helper — canonicalize under `common/fs.ts` |
| `baseInput` / `makeSpine` | 34 combined | Test helpers |
| ... | | (see GRAPHIFY_DUPLICATES.md for full top-50) |

### Tier 2 — structural decisions
- **KLOEL god-module split** (694 files / 285 services): proposed 8-layer split in CANONICAL_DOMAINS but not executed (ontology decision required from owner)
- **`anuncios` → `ads` rename** (Tier 3 facade, depends on backend completeness first)
- **`cia` → `unified-agent` rename** (15-20 files affected)
- **`omnichannel` → merge into `messaging`** (new domain consolidation)
- **`mercado_entrada.declared` → `commerce.onboarding.declared`** (event rename)

### Tier 3 — content depth
- SERVICE_CATALOG: 269 services with placeholder descriptions (would benefit from per-service JSDoc additions during natural touch-points, not batch)
- ROUTES_CATALOG: re-extract after frontend route changes (auto via `canonical:scan`)
- Add 30+ more vocabulary entries based on field findings

### Tier 4 — quality polish
- Codacy: 12,025 issues (47% coverage, 34% duplication) — separate quality grind
- Test coverage gap: ~70% → 95% target per CLAUDE.md "BIG TECH LEVEL"

## How to continue this mission (operational guide)

### Daily / per-PR
```sh
# Refresh inventory
npm run graph:extract
npm run canonical:scan

# Validate no regression
npm run canonical:check
```

### Weekly / per-sprint
```sh
# Re-extract graph state + regenerate dup register
node tools/canonicalize/graphify-driven-dedup.mjs

# Pick top pending from GRAPHIFY_DUPLICATES.md
# Apply migration codemod template from migrate-unknown-record.mjs
# Update DEPRECATION_MAP.md with the migration
```

### When adding a new feature
1. Check CANONICAL_DOMAINS — what domain owns this?
2. Check CAPABILITY_MAP — does the capability exist? If yes, extend canonical service.
3. Check EVENT_TAXONOMY — pick canonical event namespace + sub-domain.
4. Check CANONICAL_VOCABULARY — use existing canonical terms.
5. If introducing a new helper/type, check `backend/src/common/` first.
6. Run `npm run canonical:check` before push.

### When refactoring
1. Read DEPRECATION_MAP.md for known legacy → canonical migrations.
2. Use `mcp__atomic-edit__atomic_rename_symbol_cross_file` for safe renames.
3. After: regenerate artifacts via `npm run canonical:scan`.

## Reduction metric tracking

Track these in `tools/metrics/canonicalization-baseline.json` (TBD):

| Metric | 2026-05-04 baseline | 2026-05-21 current | Target (DoD) |
|---|---:|---:|---:|
| Backend tsc strict errors | ~17 | **0** | 0 |
| Worker tsc strict errors | 0 | 0 | 0 |
| Frontend tsc strict errors | 0 | 0 | 0 |
| Canonical helpers in `common/` | 0 | 23 | 50+ |
| Documented domains | 0 | 64 | 64 (all) |
| Documented capabilities | 0 | 50+ | 100+ |
| Canonical events (Spine namespaces) | (informal) | 70 (6 namespaces) | 100+ |
| Cross-context duplicate symbols | (unknown) | 1028 (indexed) | <500 |
| Architecture docs lines | 0 | ~3,800 | (maintain) |
| Active anti-regression gates | 0 | 2 | 5 (events + dups + capabilities + naming + ESLint) |

## Conclusion

The mission is **substantially complete on its strategic deliverables** (~85%): the
codebase now has a documented domain map, vocabulary, capability map, event
taxonomy, service catalog, duplication register, deprecation plan, anti-regression
gates, and operational tooling. Cross-cutting helpers in `backend/src/common`
provide the canonical home for math/string/phone/types/idempotency/money/etc.

The mission is **partially complete on individual migrations**: 53 instances
collapsed across 5 capabilities. The remaining ~1028 indexed candidates require
per-target verification and codemod work that exceeds a single autonomous
session's budget.

The **tooling, documentation, and gates** are now sufficient that future sessions
(human or agent) can continue the migration backlog incrementally without
re-discovering the foundation.

## Related

- CLAUDE.md "REGRA DE TASK SELECTION" — when to pick canonicalization work
- ADR-0009 (MP-PIX) — example of capability addition under canonical taxonomy
- All 12 architecture artifacts in this directory
