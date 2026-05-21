# Legacy Scripts

Ad-hoc instrumentation and fix scripts preserved for evidence. None are actively
called by CI, runbooks, or workflows. They were run manually during a specific
cleanup campaign (April--May 2026).

## Preserved Scripts

### `fix_context_strings.py`

- **Purpose**: Fixed `alertOnCriticalError()` context strings where the
  method-name finder incorrectly matched logger calls (e.g. `'ClassName.log'`
  instead of the real enclosing method).
- **Last run**: ~2026-05-09
- **When safe to delete**: When all context strings in the codebase have been
  validated as correct.

### `fix_opsalert_contexts.py`

- **Purpose**: Fixed hardcoded list of files where
  `alertOnCriticalError()` context strings had `Injectable` or `unknown` as the
  method name component, replacing them with the actual enclosing method.
- **Last run**: ~2026-05-09
- **When safe to delete**: Same as `fix_context_strings.py`.

### `instrument_opsalert.py` (v1)

- **Purpose**: Batch-instrumented catch blocks with
  `void opsAlert?.alertOnCriticalError()` by reading `PULSE_HEALTH.json` for
  `OBSERVABILITY_NO_ALERTING` breaks. Added import, constructor injection, and
  alert calls.
- **Last run**: ~2026-04-22
- **When safe to delete**: All target services are already instrumented.

### `instrument_opsalert_v2.py` (v2)

- **Purpose**: Improved version of v1 with better brace tracking and error
  variable name detection. Same workflow (PULSE_HEALTH.json-driven).
- **Last run**: ~2026-05-01
- **When safe to delete**: Same as v1.

### `instrument-ops-alert.py`

- **Purpose**: Instrumented a hardcoded list of 47 priority services (kloel,
  whatsapp, auth, checkout, campaigns, etc.) with `OpsAlertService` import,
  `@Optional()` constructor injection, and `alertOnCriticalError()` calls
  after `this.logger.error()` in catch blocks.
- **Last run**: ~2026-05-05
- **When safe to delete**: All listed services are instrumented.

### `instrument-ops-alert-catches.py`

- **Purpose**: Variant of `instrument-ops-alert.py` targeting the same 47
  services but with different insertion logic (after logger line instead of
  before closing brace).
- **Last run**: ~2026-05-05
- **When safe to delete**: Same as `instrument-ops-alert.py`.

### `instrument-ops-v2.py`

- **Purpose**: "Robust" re-implementation combining import/constructor
  injection and catch alerts into a two-pass pipeline. Same 47-service
  hardcoded target list.
- **Last run**: ~2026-05-06
- **When safe to delete**: Productions services are all instrumented.

### `instrument-v3.py`

- **Purpose**: Minimal/reduced variant attempting character-level insertion
  for catch alerts. Same 47-service hardcoded target list.
- **Last run**: ~2026-05-07
- **When safe to delete**: Same as v2.
