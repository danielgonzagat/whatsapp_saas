# Findings Engines — Tool Requirements

Each engine is optional. If a required tool is not installed, the engine
reports `engine_unavailable: true` and skips gracefully (no crash).

## Required Tools

| Engine       | Tool              | Install Command                    |
| ------------ | ----------------- | ---------------------------------- |
| yamllint     | yamllint          | `brew install yamllint`            |
| actionlint   | actionlint        | `brew install actionlint`          |
| shellcheck   | shellcheck        | `brew install shellcheck`          |
| hadolint     | hadolint          | `brew install hadolint`            |
| gitleaks     | gitleaks          | `brew install gitleaks`            |
| depcheck     | depcheck          | `npm install -g depcheck`          |
| npmaudit     | npm (built-in)    | Included with Node.js              |
| markdownlint | markdownlint-cli2 | `npm install -g markdownlint-cli2` |

## Status

Run `npm run findings:dry` to see which engines are available.
