# MIRROR_VALIDATION

> Mode: quick
> Generated: 2026-05-03T01:59:45.369Z

## Acceptance tests

| #                      | Test                 | Pass | Elapsed | Note                                                |
| ---------------------- | -------------------- | ---- | ------- | --------------------------------------------------- |
| 1-new-file-with-errors | new-file-with-errors | ❌   | 12226ms | sidecar did not appear or had no findings within 8s |
| 2-edit-fixes-error     | edit-fixes-error     | ✅   | 12185ms | sidecar removed (no findings → cleaned up)          |
| 3-delete-file          | delete-file          | ✅   | 3ms     | sidecar removed                                     |
| 4-move-file            | move-file            | ❌   | 24345ms | new sidecar=false old gone=true                     |

## Raw report

```json
[
  {
    "test": "1-new-file-with-errors",
    "pass": false,
    "elapsedMs": 12226,
    "sidecar": "/Users/danielpenin/Documents/Obsidian Vault/Kloel/99 - Espelho do Codigo/_source/backend/src/__mirror_acceptance_tmp__/buggy.ts.findings.json",
    "findingsCount": 0,
    "note": "sidecar did not appear or had no findings within 8s"
  },
  {
    "test": "2-edit-fixes-error",
    "pass": true,
    "elapsedMs": 12185,
    "sidecar": "/Users/danielpenin/Documents/Obsidian Vault/Kloel/99 - Espelho do Codigo/_source/backend/src/__mirror_acceptance_tmp__/buggy.ts.findings.json",
    "note": "sidecar removed (no findings → cleaned up)"
  },
  {
    "test": "3-delete-file",
    "pass": true,
    "elapsedMs": 3,
    "sidecar": "/Users/danielpenin/Documents/Obsidian Vault/Kloel/99 - Espelho do Codigo/_source/backend/src/__mirror_acceptance_tmp__/buggy.ts.findings.json",
    "note": "sidecar removed"
  },
  {
    "test": "4-move-file",
    "pass": false,
    "elapsedMs": 24345,
    "note": "new sidecar=false old gone=true"
  }
]
```
