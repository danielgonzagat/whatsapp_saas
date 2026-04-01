# PULSE REPORT — 2026-04-01T04:07:52.391Z

## Health Score: 95/100
`███████████████████░` 95%

## Summary

| Metric | Total | Issues |
|--------|-------|--------|
| UI Elements | 904 | 0 dead handlers |
| API Calls | 640 | 0 no backend |
| Backend Routes | 630 | 0 empty |
| Prisma Models | 107 | 0 orphaned |
| Facades | 0 | 0 critical, 0 warning |
| Proxy Routes | 48 | 0 no upstream |
| Security | - | 0 issues |
| Data Safety | - | 1 issues |
| Quality | - | 162 issues |

## Breaks (163 total)

### Empty Catch Blocks (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/kloel/cart-recovery.service.ts:84 | catch block only logs without throw/return — error effectively swallowed |

---

## CORRECTION PROMPT

Copy and paste the following into Claude Code to fix all critical and warning issues:

```
Fix the following codebase connectivity issues found by PULSE:

```