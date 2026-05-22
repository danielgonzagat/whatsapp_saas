# Kloel Architecture

> Generated canonical inventory of the Kloel codebase. **Read order:**

1. **[CANONICAL_DOMAINS.md](./CANONICAL_DOMAINS.md)** — top-level domains and their size
2. **[SERVICE_CATALOG.md](./SERVICE_CATALOG.md)** — every `@Injectable()` service per domain
3. **[CAPABILITY_MAP.md](./CAPABILITY_MAP.md)** — what the system can do, grouped by capability
4. **[EVENT_TAXONOMY.md](./EVENT_TAXONOMY.md)** — every event emitted/listened, with naming variants flagged
5. **[DUPLICATION_REGISTER.md](./DUPLICATION_REGISTER.md)** — same-name exports across multiple files
6. **[CANONICAL_VOCABULARY.md](./CANONICAL_VOCABULARY.md)** — official names vs aliases (starter)
7. **[DEPRECATION_MAP.md](./DEPRECATION_MAP.md)** — symbols marked for removal with deadlines
8. **[ROUTES_CATALOG.md](./ROUTES_CATALOG.md)** — HTTP routes
9. **[QUEUES_CATALOG.md](./QUEUES_CATALOG.md)** — BullMQ queues + processors
10. **[PRISMA_USAGE.md](./PRISMA_USAGE.md)** — Prisma model → files that touch it

## Regenerate

```sh
node tools/canonicalize/scan.mjs
```

## Operating principle

These files are an **inventory**, not a target. They tell you what the codebase IS today — the canonicalization mission moves it toward what it SHOULD be:

- **One canonical name** per concept (see `CANONICAL_VOCABULARY.md`)
- **One canonical implementation** per capability (see `CAPABILITY_MAP.md` — pick one of each duplicated row)
- **One canonical event** per occurrence (see `EVENT_TAXONOMY.md` variants section)
- **One canonical service** per responsibility (see `SERVICE_CATALOG.md`)

Migrations use `mcp__atomic-edit__atomic_rename_symbol_cross_file` for safe renames; deprecated aliases get tracked in `DEPRECATION_MAP.md`.

## Anti-regression

See `scripts/ops/check-canonical-*.mjs` (added by Phase J) for gates that:
- Forbid new events without an entry in `EVENT_TAXONOMY.md`
- Forbid new services duplicating a canonical capability
- Forbid new entries to `CANONICAL_VOCABULARY.md` aliases column without a deprecation plan
