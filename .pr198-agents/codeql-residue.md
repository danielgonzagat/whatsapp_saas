# CodeQL Residue — PR198

Pre-existing alerts surfaced in the CodeQL rollup gate. All flagged lines predate this PR.
The underlying `Analyze (javascript-typescript)` job IS passing — only the rollup is red
due to these pre-existing alerts.

Daniel should review and dismiss individually; **do not auto-dismiss**.

| Alert # | Severity | Rule                                       | File:Line                                                      | Created    |
| ------- | -------- | ------------------------------------------ | -------------------------------------------------------------- | ---------- |
| #109    | high     | `js/insufficient-password-hash`            | `backend/src/common/utils/unsubscribe-token.util.ts:23`        | 2026-05-03 |
| #89     | high     | `js/xss-through-dom`                       | `frontend/src/components/kloel/produtos/ProdutosView.tsx:3486` | 2026-04-20 |
| #88     | high     | `js/xss-through-dom`                       | `frontend/src/components/kloel/produtos/ProdutosView.tsx:3312` | 2026-04-20 |
| #87     | high     | `js/incomplete-url-substring-sanitization` | `backend/src/config/redis-env-validator.ts:50`                 | 2026-04-20 |
| #86     | high     | `js/incomplete-url-substring-sanitization` | `backend/src/config/redis-env-validator.ts:50`                 | 2026-04-20 |
| #79     | high     | `js/insufficient-password-hash`            | `backend/src/admin/common/admin-crypto.ts:55`                  | 2026-04-17 |
| #77     | high     | `js/incomplete-url-substring-sanitization` | `worker/resolve-redis-url.ts:55`                               | 2026-04-15 |
| #76     | high     | `js/incomplete-url-substring-sanitization` | `worker/resolve-redis-url.ts:55`                               | 2026-04-15 |
| #75     | high     | `js/incomplete-url-substring-sanitization` | `backend/src/common/redis/resolve-redis-url.ts:55`             | 2026-04-15 |
| #74     | high     | `js/incomplete-url-substring-sanitization` | `backend/src/common/redis/resolve-redis-url.ts:55`             | 2026-04-15 |
| #56     | high     | `js/incomplete-url-substring-sanitization` | `backend/scripts/test-redis.ts:29`                             | 2026-04-13 |
| #55     | high     | `js/incomplete-url-substring-sanitization` | `backend/scripts/test-redis.ts:29`                             | 2026-04-13 |

All alerts predate this branch (oldest: Apr 13, newest: May 3). None are caused by changes in this PR.
