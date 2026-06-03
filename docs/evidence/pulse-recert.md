# PULSE Re-Certification Guide

## When to Run

Execute the PULSE re-certification runner whenever:

- A significant amount of code has changed (feature branch complete, PR merge)
- Before declaring a module or the platform production-ready
- After fixing structural breaks or route mismatches reported by PULSE
- Before deploying to production
- As part of CI quality gates (complementary, not a replacement)
- When resetting the PULSE authority state after governance changes

Run:

```bash
bash scripts/dev/run-pulse-recert.sh
```

This script:

1. Invokes the full PULSE scan via `scripts/pulse/index.ts --report`, which regenerates all PULSE artifacts in `.pulse/current/`.
2. Runs `scripts/dev/check-pulse-status.mjs` to parse the artifacts and surface the certification status.

## Certification Statuses

### READY

The platform or module has passed all PULSE gates, including:

- `pulseSelfTrustPass` — internal PULSE parsers are consistent
- `noOverclaimPass` — PULSE does not claim phantom capabilities
- `multiCycleConvergencePass` — autonomous cycles converge without regression
- `finalReadinessPass` — all final readiness criteria are satisfied

When READY, the check script exits with code `0`.

### READY_WITH_CAVEATS

Derived status: the PULSE certification is `NOT_READY`, but all break counts for *critical* and *high* severity are zero. This means:

- All remaining breaks are medium or low severity.
- The system may be safe for bounded autonomous work but has not reached the final readiness bar.
- The caveats list enumerates what remains.

When READY_WITH_CAVEATS, the check script exits with code `0`.

### NOT_READY

At least one critical or high-severity break exists, or one or more PULSE gates are failing. The system is not safe for autonomous operation. The check script:

- Prints the count of breaks by severity.
- Lists the specific caveats.
- Exits with code `1`.

## Interpreting Breaks

PULSE analyzes the codebase for structural integrity and classifies each violation as a Break. Break severity levels:

| Severity | Meaning | Example |
|----------|---------|---------|
| critical | Blocks production readiness; must be fixed | Missing auth guard on a payment route |
| high | Signals a real gap that could cause failures | API route with no matching backend controller |
| medium | Prisma model with no service/controller access, or unobserved route caller | Unused DB model |
| low | Minor structural inconsistency; often admin or debug routes | Uncalled admin route |

Breaks are surfaced in `.pulse/current/PULSE_HEALTH.json` under the `breaks` array.

## Artifact Sources

The check script resolves artifacts in this order:

1. `.pulse/current/PULSE_CERTIFICATE.json` — Human replacement status and score
2. `.pulse/current/PULSE_HEALTH.json` — Break counts by severity
3. `.pulse/current/PULSE_REPORT.md` — Markdown summary (fallback)

If no artifacts are found, the script exits with code `1` and an error message.

## Related Files

- `scripts/pulse/index.ts` — PULSE entry point
- `scripts/pulse/tsconfig.json` — TypeScript configuration for PULSE
- `scripts/pulse/artifacts/generate.ts` — Artifact generation pipeline
- `scripts/pulse/artifacts.report/report-build.ts` — PULSE report builder
- `.pulse/current/` — Canonical artifact directory
