# Vercel frontend-admin deploy fix — exactOptionalPropertyTypes typecheck error

## Mission

Vercel preview build of `frontend-admin` is failing because of TypeScript strict-mode (`exactOptionalPropertyTypes: true`) errors. Fix all such errors in the admin Next.js project until `npm run build` succeeds locally and Vercel preview goes green.

## Known error (latest deploy log)

```
./src/app/(admin)/audit/page.tsx:126:24
Type error: Argument of type '{ skip: number; take: number; action: string | undefined; entityType: string | undefined; entityId: string | undefined; from: string | undefined; to: string | undefined; }' is not assignable to parameter of type 'AdminAuditListFilters' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
```

There may be more errors after fixing the first one. Loop until clean.

## Project location

`frontend-admin` is a separate Next.js project somewhere in the monorepo. Find it:

```bash
find /Users/danielpenin/whatsapp_saas -type d -name "frontend-admin" -not -path "*/node_modules/*"
```

Then:
```bash
cd <path>
npm run build  # reproduce the failure
```

## Method

For each `exactOptionalPropertyTypes` error of the form "Type '<field>: T | undefined' is not assignable to '<field>?: T'":

The proper fix is to NOT pass the property at all when it's undefined, instead of passing `field: undefined`.

Pattern A — at call site, conditionally spread:
```ts
adminAuditApi.list({
  skip,
  take: PAGE_SIZE,
  ...(filters.action !== undefined ? { action: filters.action } : {}),
  ...(filters.entityType !== undefined ? { entityType: filters.entityType } : {}),
  // etc
});
```

Pattern B — relax the receiving type with `| undefined` if the field semantically can be undefined:
```ts
type AdminAuditListFilters = {
  action?: string | undefined;  // explicit
  // ...
};
```

PREFER Pattern A when the receiving type is in shared code (don't loosen contracts). Use Pattern B only when the field truly needs to accept undefined.

For arrays/objects similar: don't pass `{ foo: undefined }` — omit the key.

## Constraints

- NO `as any`, NO `@ts-ignore`, NO `@ts-expect-error`, NO `as unknown as`
- NO modifying `tsconfig.json` to disable `exactOptionalPropertyTypes` (that would relax governance for everyone)
- NO commits
- Preserve all existing functionality — only types change at call site or interface
- Final: `cd frontend-admin && npm run build` exits 0

## Definition of Done

- `npm run build` succeeds in `frontend-admin`
- ESLint clean on touched files
- Report: list of files touched, count of errors fixed, and final build line `✓ Compiled successfully`

## Hard stop conditions

- An error indicates real type incompatibility (not just `undefined` mismatch) — report with file:line
- Found a file outside `frontend-admin/` that needs change to fix — STOP, report (out of scope; we don't want admin fixes leaking into shared backend types)
