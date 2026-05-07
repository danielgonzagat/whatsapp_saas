# MIRROR_VALIDATION

> Mode: quick
> Generated: 2026-05-02T18:38:25.955Z

## Acceptance tests

| #                      | Test                 | Pass | Elapsed | Note                                       |
| ---------------------- | -------------------- | ---- | ------- | ------------------------------------------ |
| 1-new-file-with-errors | new-file-with-errors | ✅   | 4020ms  | sidecar appeared with findings             |
| 2-edit-fixes-error     | edit-fixes-error     | ✅   | 12051ms | sidecar removed (no findings → cleaned up) |
| 3-delete-file          | delete-file          | ✅   | 1ms     | sidecar removed                            |
| 4-move-file            | move-file            | ✅   | 10547ms | new sidecar=true old gone=true             |

## Raw report

```json
[
  {
    "test": "1-new-file-with-errors",
    "pass": true,
    "elapsedMs": 4020,
    "sidecar": "/Users/danielpenin/Documents/Obsidian Vault/Kloel/99 - Espelho do Codigo/_source/backend/src/__mirror_acceptance_tmp__/buggy.ts.findings.json",
    "findingsCount": 2,
    "note": "sidecar appeared with findings"
  },
  {
    "test": "2-edit-fixes-error",
    "pass": true,
    "elapsedMs": 12051,
    "sidecar": "/Users/danielpenin/Documents/Obsidian Vault/Kloel/99 - Espelho do Codigo/_source/backend/src/__mirror_acceptance_tmp__/buggy.ts.findings.json",
    "note": "sidecar removed (no findings → cleaned up)"
  },
  {
    "test": "3-delete-file",
    "pass": true,
    "elapsedMs": 1,
    "sidecar": "/Users/danielpenin/Documents/Obsidian Vault/Kloel/99 - Espelho do Codigo/_source/backend/src/__mirror_acceptance_tmp__/buggy.ts.findings.json",
    "note": "sidecar removed"
  },
  {
    "test": "4-move-file",
    "pass": true,
    "elapsedMs": 10547,
    "note": "new sidecar=true old gone=true"
  }
]
```
