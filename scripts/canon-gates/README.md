# Canonicalization Anti-Regression Gates (Phase 7, Lane L9)

Five executable Node.mjs gate scripts that enforce semantic entropy boundaries and prevent drift from canonical patterns. These gates detect violations before they land in the codebase.

## Overview

Each gate is a standalone, zero-dependency Node.mjs script that:
- Reads canonical source files (AsyncAPI spec, phone normalization, capability registry, etc.)
- Scans the codebase for violations using regex/AST patterns
- Exits with code 0 (pass) or 1 (fail)
- Outputs clear violation reports to stderr

**Running all gates:**
```bash
node scripts/canon-gates/gate-asyncapi-taxonomy.mjs && \
node scripts/canon-gates/gate-message-dispatcher.mjs && \
node scripts/canon-gates/gate-no-dup-normalizer.mjs && \
node scripts/canon-gates/gate-domain-vocabulary.mjs && \
node scripts/canon-gates/gate-worker-capability.mjs
echo "All gates passed!"
```

## Gate Descriptions

### 1. gate-asyncapi-taxonomy.mjs

**Violation Class:** New events outside the canonical AsyncAPI taxonomy.

**What it enforces:**
- Every event emitted via `.emit(eventName, ...)` must be listed in `tools/asyncapi/asyncapi-spec.json`
- Detects rogue event names that aren't in the canonical 125-event AsyncAPI spec

**Detection patterns:**
- `.emit('eventName', ...)`
- `.emit(..., 'eventName')`
- `emitter('eventName', ...)`
- `fireEvent('eventName', ...)`
- `publishEvent('eventName', ...)`

**Scan scope:** `backend/src/**/*.{ts,tsx}`

**Sample output (violation):**
```
FAIL gate-asyncapi-taxonomy: 3 event(s) not in canonical AsyncAPI spec:
  backend/src/legacy/chat.service.ts:42: "rogue.event.name"
  backend/src/experimental/dispatch.ts:18: "custom.notification.fired"
  worker/processors/custom-handler.ts:7: "brain.unknown.signal"
```

---

### 2. gate-message-dispatcher.mjs

**Violation Class:** New message-dispatcher outside the canonical path.

**What it enforces:**
- All message dispatch logic must live in one of:
  - `worker/providers/channel-dispatcher.ts`
  - `worker/providers/outbound-dispatcher.ts`
  - `backend/src/integrations/*` (channel-specific handlers only)
- Prevents rogue `dispatch*`, `send*`, `route*`, `*Dispatcher` functions elsewhere

**Detection patterns:**
- `function dispatch*(...)`
- `function send*(...)`
- `function route*(...)`
- `class *Dispatcher`
- `private dispatch(...)`

**Scan scope:** `backend/src/**/*.{ts,tsx}`, `worker/**/*.{ts,tsx}` (excluding canonical paths)

**Sample output (violation):**
```
FAIL gate-message-dispatcher: 2 rogue dispatcher(s) found outside canonical paths:
  backend/src/legacy/whatsapp.service.ts:34: dispatchMessage()
  backend/src/experimental/custom-routing.ts:12: CustomDispatcher

All message dispatch logic must reside in:
  - worker/providers/{channel,outbound}-dispatcher.ts
  - backend/src/integrations/* (channel-specific handlers)
```

---

### 3. gate-no-dup-normalizer.mjs

**Violation Class:** New phone-normalizer / tenant-resolver / webhook-parser duplicates.

**What it enforces:**
- Core utility functions have exactly ONE canonical location
- `normalizePhone*`, `extractPhone*`, `normalizeDigits*` → `backend/src/common/phone/phone-normalization.util.ts`
- `digitsOnly`, `digitsOrNull`, `digitsOrUndefined`, `whatsappDigits` → `backend/src/common/phone.ts`
- `resolveTenant*` → `backend/src/common/tenant/tenant-resolver.util.ts`
- `parseWebhook*`, `parsePayload*` → `backend/src/webhooks/webhook-parser.util.ts`

**Detection patterns:**
- Finds function declarations matching canonical utility names
- Reports violations if they appear in non-canonical files

**Scan scope:** `backend/src/**/*.{ts,tsx}` (excluding canonical locations)

**Sample output (violation):**
```
FAIL gate-no-dup-normalizer: 2 duplicate utility(ies) found:
  Domain "normalizePhone" (1 occurrence(s)):
    backend/src/legacy/phone-utils.ts:18 normalizePhone() must live in backend/src/common/phone/phone-normalization.util.ts
  Domain "digitsOnly" (1 occurrence(s)):
    backend/src/checkout/payment.service.ts:45 digitsOnly() must live in backend/src/common/phone.ts
```

---

### 4. gate-domain-vocabulary.mjs

**Violation Class:** New domain terms outside the canonical vocabulary.

**What it enforces:**
- Event domain prefixes must be declared in AsyncAPI spec
- Example: `"custom.event"` is forbidden; `"account.event"` is OK (if `account` is canonical)
- Detects undeclared domain names in event emissions and capability declarations

**Detection patterns:**
- Event names: `'domain.verb'` pattern matching
- Domain union types: `domain: 'undeclared_domain'`

**Canonical domains extracted from:** `tools/asyncapi/asyncapi-spec.json` channels

**Sample output (violation):**
```
FAIL gate-domain-vocabulary: 2 undeclared domain(s) found:
  Domain "experimental" (1 occurrence(s)):
    backend/src/features/custom.service.ts:22 "experimental.event.fired"
  Domain "custom_domain" (1 occurrence(s)):
    worker/processors/handler.ts:51 domain union type

Canonical domains: account, billing, chat, cognition, checkout, control, crm, messaging, ...
```

---

### 5. gate-worker-capability.mjs

**Violation Class:** New worker/module without declared capability/domain.

**What it enforces:**
- Every module in `worker/` must declare its capability (what it does) and domain
- Declarations use JSDoc header annotations: `@capability`, `@domain`, `@processor`, `@provider`
- Or: export a `CAPABILITY_DEFINITION` constant
- Prevents orphan modules without explicit registration

**Declaration form (in file header):**
```typescript
/**
 * @capability EmailSender
 * @domain communication
 */
export class EmailService { ... }
```

**Exclusions (OK without declaration):**
- Barrel exports (files with only `export *` or `export {`)
- Utils/helpers in `worker/utils/**`
- Type definitions in `worker/types/**`
- Infrastructure files (redis-client, metrics-server, etc.)

**Scan scope:** `worker/**/*.{ts,tsx,mjs}` (excluding test files and infrastructure)

**Sample output (violation):**
```
FAIL gate-worker-capability: 3 orphan module(s) without declared capability:
  worker/new-processor/index.ts
  worker/experimental/handler.ts
  worker/custom-logic/service.ts

Add a capability declaration to each worker module:
  /**
   * @capability EmailSender
   * @domain communication
   */
```

---

## Wiring into Pre-Push and CI

### Option A: Pre-Push Hook (Recommended for Developer Feedback)

**File:** `.husky/pre-push` (protected file — wiring only, do not edit)

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Run canonicalization gates
echo "[GATES] Running canonicalization anti-regression gates..."
node scripts/canon-gates/gate-asyncapi-taxonomy.mjs || exit 1
node scripts/canon-gates/gate-message-dispatcher.mjs || exit 1
node scripts/canon-gates/gate-no-dup-normalizer.mjs || exit 1
node scripts/canon-gates/gate-domain-vocabulary.mjs || exit 1
node scripts/canon-gates/gate-worker-capability.mjs || exit 1

echo "[GATES] All gates passed. Proceeding with push..."
```

**Effect:**
- Runs on every local `git push`
- Fails the push if any gate detects a violation
- Immediate developer feedback (fail-fast)
- Prevents bad commits from reaching remote

### Option B: CI Pipeline (Centralized Enforcement)

**File:** `.github/workflows/ci-cd.yml` or `scripts/ops/ci-gates.sh` (protected file — wiring only)

```yaml
# In ci-cd.yml under a new job or existing lint/quality stage:
- name: Run Canonicalization Gates
  run: |
    echo "[GATES] Running canonicalization anti-regression gates..."
    node scripts/canon-gates/gate-asyncapi-taxonomy.mjs || exit 1
    node scripts/canon-gates/gate-message-dispatcher.mjs || exit 1
    node scripts/canon-gates/gate-no-dup-normalizer.mjs || exit 1
    node scripts/canon-gates/gate-domain-vocabulary.mjs || exit 1
    node scripts/canon-gates/gate-worker-capability.mjs || exit 1
```

**Effect:**
- Runs on every PR and push to main
- Blocks PR merge if a gate fails
- Catch violations before they land
- Centralized audit trail (CI logs)

### Option C: Manual Pre-Commit

**File:** `.husky/pre-commit` (protected file — optional wiring)

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Optionally run gates on staged changes only
echo "[GATES] Checking staged changes..."
node scripts/canon-gates/gate-asyncapi-taxonomy.mjs || true  # warn, don't block
```

---

## Testing the Gates

Run all gates against the current codebase:

```bash
cd /Users/danielpenin/whatsapp_saas

# Run each gate individually to see pass/fail
node scripts/canon-gates/gate-asyncapi-taxonomy.mjs
echo "Exit code: $?"

node scripts/canon-gates/gate-message-dispatcher.mjs
echo "Exit code: $?"

node scripts/canon-gates/gate-no-dup-normalizer.mjs
echo "Exit code: $?"

node scripts/canon-gates/gate-domain-vocabulary.mjs
echo "Exit code: $?"

node scripts/canon-gates/gate-worker-capability.mjs
echo "Exit code: $?"
```

### Triggering a Violation (for testing)

To verify gates detect violations, add a rogue emit:

```typescript
// backend/src/test-violation.ts (temporary)
export class TestViolation {
  emit(event: string, payload: any) {
    // This will trigger gate-asyncapi-taxonomy.mjs
    this.emit('rogue.event.name', {});
  }
}
```

Then run: `node scripts/canon-gates/gate-asyncapi-taxonomy.mjs` — it will FAIL with:
```
FAIL gate-asyncapi-taxonomy: 1 event(s) not in canonical AsyncAPI spec:
  backend/src/test-violation.ts:5: "rogue.event.name"
```

Delete the test file and re-run to verify PASS.

---

## Exit Codes

- **0 (success):** All canonical rules enforced; no violations found.
- **1 (failure):** One or more violations detected; details in stderr.

---

## Dependencies

- Node.js (built-in `fs`, `path`, `url` modules only)
- `glob` (npm install required — already in `package.json`)
- No external validation libraries

All gates are:
- **Zero dependencies** (besides glob, which is already installed)
- **Deterministic** (same input → same output)
- **Fast** (< 1s per gate on typical codebase)
- **Testable** (can be run independently)

---

## Future Extensions

Each gate is designed to be extended:

1. **Configurable canonical paths:** Move hardcoded paths to a `canonical.config.json`
2. **Allowlist mode:** Permit certain violations with explicit metadata (e.g., `@bypass-gate-asyncapi` JSDoc)
3. **Metrics:** Export gate results as JSON for dashboard/reporting
4. **Parallel execution:** Run all gates in parallel with `Promise.all()` for faster feedback
5. **Incremental mode:** Only scan changed files (with `git diff`) for pre-commit speed

---

## Ownership & Maintenance

- **Gate author:** Lane L9 / Phase 7 canonicalization initiative
- **Canonical source maintainers:**
  - AsyncAPI spec: `tools/asyncapi/asyncapi-spec.json` (auto-generated from `docs/architecture/EVENT_TAXONOMY.md`)
  - Phone normalization: `backend/src/common/phone/phone-normalization.util.ts` (per ADR-0012)
  - Capability registry: `backend/src/kloel/capability-registry-v2/` (per ADR-0013)
  - Domain vocabulary: extracted from AsyncAPI channels
- **Questions:** See `docs/adr/0012-omnicore.md` and `docs/adr/0013-kloel-mind-unification.md`
