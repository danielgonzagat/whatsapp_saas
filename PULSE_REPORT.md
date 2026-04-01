# PULSE REPORT — 2026-04-01T14:41:56.163Z

## Health Score: 100/100
`████████████████████` 100%

## Summary

| Metric | Total | Issues |
|--------|-------|--------|
| UI Elements | 902 | 0 dead handlers |
| API Calls | 643 | 0 no backend |
| Backend Routes | 631 | 0 empty |
| Prisma Models | 107 | 0 orphaned |
| Facades | 0 | 0 critical, 0 warning |
| Proxy Routes | 48 | 0 no upstream |

## Breaks (1 total)

### Backend Routes Not Called by Frontend (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| INFO | backend/src/kloel/upload.controller.ts:71 | POST /kloel/upload is not called by any frontend code |

---

## CORRECTION PROMPT

Copy and paste the following into Claude Code to fix all critical and warning issues:

```
Fix the following codebase connectivity issues found by PULSE:

```