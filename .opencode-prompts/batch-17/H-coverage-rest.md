# Wave H — Auto-discover and cover ALL backend services without spec

## Mission

Find every backend service without `.spec.ts` and create one. Each spec ≥3 tests.

## Pre-read

1. `scripts/decomp/opencode-subagent-delegation-rules.md`
2. `CLAUDE.md`
3. `AGENTS.md`

## Discovery

```bash
cd /Users/danielpenin/whatsapp_saas/backend
find src -name "*.service.ts" -not -path "*/__tests__/*" -not -path "*/node_modules/*" | while read f; do
  spec="${f%.ts}.spec.ts"
  [ ! -f "$spec" ] && echo "$f"
done
```

## Spec template

TestingModule + mocked Prisma + mocked external deps. Pattern from `backend/src/admin/compliance/admin-compliance.service.spec.ts`.

## Ownership

ONLY `.spec.ts` new. NO source modifications.

## Constraints

- NO bypass tokens, NO commits
- Mock external services
- Each spec passes jest

## Definition of Done

- All discovered services without spec now have one
- `npx jest <new-spec-path>` passes
- ≥70% lines coverage per file
