# Codacy Max-Rigor Lock

Status: active  
Date: 2026-04-19

This repository treats Codacy configuration as governance, not as day-to-day
triage.

## Invariants

- Codacy must analyze the widest possible versioned surface of the repository.
- Only generated/vendor/build outputs are excluded in `.codacy.yml`.
- Because this repository uses `.codacy.yml` , Codacy UI file-ignore toggles do
  not apply; exclusions must go through the protected config file.
- The canonical coding standard linked to `whatsapp_saas` must keep all tools
  and all patterns enabled.
- Repository quality thresholds are hard-set to:
  - `maxIssuePercentage: 0`
  - `maxDuplicatedFilesPercentage: 0`
  - `minCoveragePercentage: 100`
  - `maxComplexFilesPercentage: 0`
  - `fileDuplicationBlockThreshold: 0`
  - `fileComplexityValueThreshold: 0`
- Commit quality gates are hard-set to:
  - `issueThreshold: 0 (Info+)`
  - `securityIssueThreshold: 0 (Info+)`
  - `duplicationThreshold: 0`
  - `coverageThresholdWithDecimals: 0`
  - `complexityThreshold: 0`
- Pull request quality gates are hard-set to:
  - the same zero-tolerance settings above
  - `diffCoverageThreshold: 100`
- Provider integration features must stay enabled:
  - commit status
  - pull request comments
  - pull request summary / unified summary
  - coverage summary
  - suggestions

## Allowed Operations

- `npm run codacy:sync`
- `npm run codacy:check-max-rigor`
- `npm run codacy:enforce-max-rigor`

## Forbidden Operations

- Disabling tools or patterns in Codacy
- Relaxing quality gates / coverage / duplication / complexity thresholds
- Adding new exclude paths for versioned source
- Using suppression comments to satisfy Codacy or its underlying engines
- Using commit skip tags to bypass Codacy or CI analysis

Forbidden suppression forms include:

- `biome-ignore`
- `nosemgrep`
- `eslint-disable`
- `@ts-ignore`
- `@ts-expect-error`
- `@ts-nocheck`
- `codacy:disable`
- `codacy:ignore`
- `NOSONAR`
- `noqa`

Forbidden commit skip tags include:

- `[codacy skip]`
- `[skip codacy]`
- `[ci skip]`
- `[skip ci]`

## Governance

- `.codacy.yml`, `docs/codacy/**`, `scripts/ops/**`, `package.json`,
  `.github/workflows/**`, `AGENTS.md`, and `CLAUDE.md` are governance surfaces.
- Any change that weakens Codacy or reintroduces suppressions requires explicit
  human approval.
