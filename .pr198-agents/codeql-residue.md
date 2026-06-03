# CodeQL alerts open on PR198 — for Daniel to triage

These are pre-existing alerts (created before today). The Analyze workflow itself passes; the rollup fails because alerts exist on the PR. Dismiss via dashboard if false-positive or out-of-scope.

| #    | Severity | Rule                                     | Location                                                     | Created    |
| ---- | -------- | ---------------------------------------- | ------------------------------------------------------------ | ---------- |
| #109 | high     | js/insufficient-password-hash            | backend/src/common/utils/unsubscribe-token.util.ts:56        | 2026-05-03 |
| #89  | high     | js/xss-through-dom                       | frontend/src/components/kloel/produtos/ProdutosView.tsx:3486 | 2026-04-20 |
| #88  | high     | js/xss-through-dom                       | frontend/src/components/kloel/produtos/ProdutosView.tsx:3312 | 2026-04-20 |
| #87  | high     | js/incomplete-url-substring-sanitization | backend/src/config/redis-env-validator.ts:50                 | 2026-04-20 |
| #86  | high     | js/incomplete-url-substring-sanitization | backend/src/config/redis-env-validator.ts:50                 | 2026-04-20 |
| #79  | high     | js/insufficient-password-hash            | backend/src/admin/common/admin-crypto.ts:55                  | 2026-04-17 |
| #77  | high     | js/incomplete-url-substring-sanitization | worker/resolve-redis-url.ts:55                               | 2026-04-15 |
| #76  | high     | js/incomplete-url-substring-sanitization | worker/resolve-redis-url.ts:55                               | 2026-04-15 |
| #75  | high     | js/incomplete-url-substring-sanitization | backend/src/common/redis/resolve-redis-url.ts:55             | 2026-04-15 |
| #74  | high     | js/incomplete-url-substring-sanitization | backend/src/common/redis/resolve-redis-url.ts:55             | 2026-04-15 |
| #56  | high     | js/incomplete-url-substring-sanitization | backend/scripts/test-redis.ts:29                             | 2026-04-13 |
| #55  | high     | js/incomplete-url-substring-sanitization | backend/scripts/test-redis.ts:29                             | 2026-04-13 |
