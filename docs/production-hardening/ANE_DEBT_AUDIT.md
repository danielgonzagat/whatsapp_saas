# ANE/ANY Debt Audit — Kloel Monorepo

**Generated:** 2026-04-27
**Scope:** `backend/src`, `frontend/src`, `worker/src`, `scripts/`, `e2e/specs`
**Method:** Regex grep for `as any`, `Record<string, any>`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, `biome-ignore` — excluding `node_modules/` and `dist/`.

---

## 1. `as any` — Type Assertion Debt

### 1.1 backend/src

| Status | GREEN — Zero in production code |
| ------ | ------------------------------- |

- **Total in `backend/src`:** 26 occurrences
- **In spec/test files:** 26 (100%)
- **In production code (.service.ts, .controller.ts, .module.ts, etc.):** 0

All `as any` in backend source is confined to test files:

| File                                                          | Count | Type                              |
| ------------------------------------------------------------- | ----- | --------------------------------- |
| `backend/src/kloel/openai-wrapper.spec.ts`                    | 6     | Test — mock/stub construction     |
| `backend/src/kloel/llm-budget.service.spec.ts`                | 6     | Test — Redis mock typing          |
| `backend/src/common/money.spec.ts`                            | 3     | Test — negative-input validation  |
| `backend/src/common/redis/ioredis-mock-verify.spec.ts`        | 2     | Test — Redis client method access |
| `backend/src/inbox/inbox.service.spec.ts`                     | 2     | Test — partial mock objects       |
| `backend/src/app.controller.spec.ts`                          | 2     | Test — request mock construction  |
| `backend/src/checkout/__tests__/financial-scenarios.spec.ts`  | 1     | Test — promise result access      |
| `backend/src/contracts/api-contract.spec.ts`                  | 1     | Test — partial mock               |
| `backend/src/pulse/daemon-incremental.spec.ts`                | 1     | Test — Prisma data injection      |
| `backend/src/flows/flow-template.recommended.spec.helpers.ts` | 1     | Doc comment (not actual usage)    |

**Risk:** P2_TECH_DEBT (test code only, no runtime production impact)

### 1.2 frontend/src

| Status | GREEN — Zero in production code |
| ------ | ------------------------------- |

- **Total in `frontend/src`:** 12 occurrences
- **In test files (.test.ts):** 12 (100%)
- **In production code (route.ts, page.tsx, hooks, etc.):** 0

| File                                                             | Count | Type                |
| ---------------------------------------------------------------- | ----- | ------------------- |
| `frontend/src/app/api/auth/callback/apple/route.test.ts`         | 2     | Test — request mock |
| `frontend/src/__tests__/contracts/api-contract.spec.ts`          | 1     | Test — partial mock |
| `frontend/src/app/api/marketing/[...path]/route.test.ts`         | 1     | Test — request mock |
| `frontend/src/app/api/webhooks/tiktok/route.test.ts`             | 1     | Test — request mock |
| `frontend/src/app/auth/tiktok/callback/route.test.ts`            | 1     | Test — request mock |
| `frontend/src/app/api/auth/callback/tiktok/route.test.ts`        | 1     | Test — request mock |
| `frontend/src/app/api/auth/tiktok/start/route.test.ts`           | 1     | Test — request mock |
| `frontend/src/app/api/auth/facebook/data-deletion/route.test.ts` | 1     | Test — request mock |
| `frontend/src/app/api/auth/facebook/deauthorize/route.test.ts`   | 1     | Test — request mock |
| `frontend/src/app/api/auth/magic-link/proxy.test.ts`             | 1     | Test — request mock |
| `frontend/src/app/api/auth/facebook/route.test.ts`               | 1     | Test — request mock |

**Risk:** P2_TECH_DEBT (test code only)

### 1.3 worker/

| Status | GREEN — Zero `as any` |
| ------ | --------------------- |

- **Total in `worker/src`:** 0 occurrences
- Worker has one file: `worker/src/utils/error-handler.ts` — no type assertions

**Risk:** NONE

### 1.4 scripts/

| Status | INFO — Detection infrastructure |
| ------ | ------------------------------- |

- **Total in `scripts/`:** 9 occurrences
- All are within the **PULSE honesty-test** framework that detects ANE debt — not ANE debt itself

| File                                           | Count | Nature                                      |
| ---------------------------------------------- | ----- | ------------------------------------------- |
| `scripts/pulse/test-honesty.ts`                | 1     | Regex pattern that detects `as any`         |
| `scripts/pulse/parsers/type-safety-checker.ts` | 7     | Analyzer rules that DETECT `as any` in code |
| `scripts/pulse/parsers/service-tracer.ts`      | 1     | Comment describing detection rule           |

**Risk:** NONE (not production code; these are meta-tooling)

### 1.5 e2e/

| Status | AMBER — 3 occurrences in test infrastructure |
| ------ | -------------------------------------------- |

- **Total in `e2e/specs/`:** 3 occurrences

| File                       | Count | Type                             |
| -------------------------- | ----- | -------------------------------- |
| `e2e/specs/e2e-helpers.ts` | 3     | Auth context parsing after login |

All three are `parseAuth(relogin as any, ...)` / `parseAuth(registerRes as any, ...)` / `parseAuth(loginRes as any, ...)` — casting a Playwright APIResponse to appease the type checker when the response shape is known at runtime.

**Risk:** P2_TECH_DEBT (test infrastructure, no production impact)

---

## 2. `Record<string, any>` — Under-Modeled Types

**Total across entire codebase (excluding node_modules):** 6 occurrences

| File                                          | Count | Context                                           |
| --------------------------------------------- | ----- | ------------------------------------------------- |
| `e2e/specs/marketing-whatsapp-flow.spec.ts`   | 3     | Mock state objects for WhatsApp flow E2E          |
| `e2e/specs/e2e-helpers.ts`                    | 1     | JWT payload decoding (`decodeJwtPayload`)         |
| `scripts/pulse/parsers/runtime-utils.ts`      | 1     | Test JWT builder (`makeTestJwt`)                  |
| `scripts/pulse/parsers/security-injection.ts` | 1     | Type definition for security test payload builder |

**Risk:** P2_TECH_DEBT

**Note:** Zero occurrences in `backend/src` or `frontend/src` production code. The two remaining in e2e test helpers (`decodeJwtPayload` and WhatsApp mock states) could be modeled with proper interfaces if desired.

### Remediation Example — `decodeJwtPayload`

**Before:**

```typescript
function decodeJwtPayload(token: string): Record<string, any> | null {
```

**After:**

```typescript
interface JwtPayload {
  sub: string;
  workspaceId: string;
  email: string;
  iat: number;
  exp: number;
}
function decodeJwtPayload(token: string): JwtPayload | null {
```

---

## 3. `@ts-ignore` — TypeScript Suppression

| Status | GREEN — Zero in source code |
| ------ | --------------------------- |

- **Total in `backend/src`:** 0
- **Total in `frontend/src`:** 0
- **Total in `worker/src`:** 0
- **Total in `e2e/specs`:** 0
- **Total in `scripts/`:** 1 (in `test-honesty.ts` — a regex pattern that _detects_ `@ts-ignore`, not an actual usage)

All 3 hits in `e2e/node_modules/` are from Playwright's own type definitions — external library code, out of scope.

**Risk:** NONE (zero actual usages in project source)

---

## 4. `@ts-expect-error` — Expected Type Errors

| Status | GREEN — Zero in source code |
| ------ | --------------------------- |

- **Total in `backend/src`:** 0
- **Total in `frontend/src`:** 0
- **Total in `worker/src`:** 0
- **Total in `e2e/specs`:** 0
- **Total in `scripts/`:** 1 (in `test-honesty.ts` — a regex pattern that _detects_ `@ts-expect-error`, not an actual usage)

**Risk:** NONE

---

## 5. `eslint-disable` — Lint Suppression

**Total across codebase:** 2 legitimate usages (excluding PULSE detection rules)

| File                            | Line    | Suppression                                                  | Justification                                                                   |
| ------------------------------- | ------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `e2e/specs/e2e-helpers.ts`      | 354     | `eslint-disable-next-line no-constant-condition`             | Legitimate: `while(true)` loop for retry logic with internal break condition    |
| `scripts/pulse/test-honesty.ts` | 109-114 | `eslint-disable @typescript-eslint/no-explicit-any` patterns | Meta-tooling: these are detection regex patterns, not suppressions of real code |

**Risk:** P2_TECH_DEBT (1 instance, justified)

---

## 6. `biome-ignore` — Formatter/Linter Suppression

**Total across codebase:** 1 occurrence

| File                                         | Line | Suppression                                    | Justification                                                        |
| -------------------------------------------- | ---- | ---------------------------------------------- | -------------------------------------------------------------------- |
| `backend/scripts/seed-affiliate-products.ts` | 30   | `biome-ignore lint/performance/noAwaitInLoops` | Legitimate: seed script needs sequential iteration for clear logging |

**Risk:** P2_TECH_DEBT (1 instance, justified, not in production code path)

---

## Summary — Overall Verdict

```
┌──────────────────────┬──────────────┬──────────────┬─────────────────────────────┐
│ Pattern              │ Prod Code    │ Test/Infra   │ Verdict                      │
├──────────────────────┼──────────────┼──────────────┼─────────────────────────────┤
│ as any               │ 0            │ 41 (all test)│ GREEN — Zero in production   │
│ Record<string, any>  │ 0            │ 6 (e2e+scripts)│ GREEN — Zero in production │
│ @ts-ignore           │ 0            │ 0            │ GREEN                        │
│ @ts-expect-error      │ 0            │ 0            │ GREEN                        │
│ eslint-disable       │ 0            │ 1 (justified)│ GREEN                        │
│ biome-ignore         │ 0            │ 1 (justified)│ GREEN                        │
└──────────────────────┴──────────────┴──────────────┴─────────────────────────────┘
```

### Risk Classification

| Level               | Count | Description                                               |
| ------------------- | ----- | --------------------------------------------------------- |
| **P0_BLOCKER_PROD** | 0     | No type-safety bypasses in production code                |
| **P2_TECH_DEBT**    | 47    | All confined to test/e2e/scripts — zero production impact |

### Key Finding

**The Kloel codebase has zero `as any`, zero `Record<string, any>`, zero `@ts-ignore`, and zero `@ts-expect-error` in any production code path** (`backend/src/`, `frontend/src/`, `worker/src/`).

All ANE debt is confined to test files (`.spec.ts`, `.test.ts`) and test infrastructure (`e2e-helpers.ts`). The one `eslint-disable` and one `biome-ignore` are both in non-production scripts with documented justifications.

The codebase scores **100% clean** on this audit dimension.

### Recommendations

1. **Test file `as any` cleanup (backlog):** The 26 backend + 12 frontend test `as any` usages are mostly for mock/partial object construction. Consider adding a `typedMock<T>(partial)` helper in test utils to eliminate these over time. Example:

   ```typescript
   // test-utils.ts
   export function typedMock<T>(partial: Partial<T>): T {
     return partial as T; // single suppression point
   }
   ```

2. **E2E `parseAuth` typing:** Model the Playwright `APIResponse` auth shape with a `LoginResponse` interface to eliminate the 3 e2e `as any` casts.

3. **`Record<string, any>` in e2e:** Model WhatsApp mock states with proper interfaces — low priority since these are test fixtures.

4. **PULSE meta-tooling:** The 9 "occurrences" in `scripts/pulse/` are detection patterns, not debt. No action needed.
