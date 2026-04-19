# GitHub Actions: Pin Third-Party Actions to Commit SHA

> **Status:** Recommendation (ci-cd.yml is a protected file)
> **Semgrep rule:**
  `yaml.github-actions.security.third-party-action-not-pinned-to-commit-sha`
> **Date:** 2026-04-16

## Why

Version tags (e.g. `@v4` ) are mutable Git refs. A compromised upstream
repository
can silently replace a tag's target, injecting malicious code into every
workflow
that references it. Pinning to a full commit SHA makes the reference immutable
and
auditable.

## Recommended Changes for `.github/workflows/ci-cd.yml`

Each line below shows the current reference and its replacement. The comment
after
the SHA preserves the human-readable version for Dependabot and reviewers.

### actions/checkout

```yaml
# Current (3 occurrences: lines 20, 78, 321)
- uses: actions/checkout@v4

# Pinned
- uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4.3.1
```

### actions/setup-node

```yaml
# Current (3 occurrences: lines 25, 81, 324)
- uses: actions/setup-node@v4

# Pinned
- uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
```

### actions/upload-artifact

```yaml
# Current (2 occurrences: lines 258, 434)
- uses: actions/upload-artifact@v4

# Pinned
- uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2
```

### codecov/codecov-action

```yaml
# Current (3 occurrences: lines 186, 195, 204)
- uses: codecov/codecov-action@v5

# Pinned
- uses: codecov/codecov-action@75cd11691c0faa626561e295848008c8a7dddffe # v5.5.4
```

### codecov/test-results-action

```yaml
# Current (3 occurrences: lines 218, 226, 234)
- uses: codecov/test-results-action@v1

# Pinned
- uses: codecov/test-results-action@0fa95f0e1eeaafde2c782583b36b28ad0d8c77d3 # v1.2.1
```

### codacy/codacy-coverage-reporter-action

```yaml
# Current (1 occurrence: line 241)
- uses: codacy/codacy-coverage-reporter-action@v1.3.0

# Pinned
- uses: codacy/codacy-coverage-reporter-action@89d6c85cfafaec52c72b6c5e8b2878d33104c699 # v1.3.0
```

## Total: 8 action references across 6 distinct actions

| Action                                 | N   | Ref     | Pinned SHA (short)     | Version |
| -------------------------------------- | --- | ------- | ---------------------- | ------- |
| actions/checkout                       | 3   | @v4     | 34e114876b0b…f8d5      | v4.3.1  |
| actions/setup-node                     | 3   | @v4     | 49933ea5288c…0020      | v4.4.0  |
| actions/upload-artifact                | 2   | @v4     | ea165f8d65b6…fa02      | v4.6.2  |
| codecov/codecov-action                 | 3   | @v5     | 75cd11691c0f…dffe      | v5.5.4  |
| codecov/test-results-action            | 3   | @v1     | 0fa95f0e1eea…77d3      | v1.2.1  |
| codacy/codacy-coverage-reporter-action | 1   | @v1.3.0 | 89d6c85cfafa…c699      | v1.3.0  |

## How to Apply

The repository owner should update `.github/workflows/ci-cd.yml` with the pinned
references listed above. After pinning, ensure Dependabot is configured to
update
GitHub Actions so pinned SHAs stay current:

```yaml
# .github/dependabot.yml (should already exist)
- package-ecosystem: 'github-actions'
  directory: '/'
  schedule:
    interval: 'weekly'
```
