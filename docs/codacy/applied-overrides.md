# Codacy Override Audit Log

This file records every mutation applied to Codacy's tool/pattern configuration
for the `whatsapp_saas` repository, both via REST API and via committed config
files. It is the source of truth for "what did we tell Codacy to do, and why".

## Phase 0 — Discovery findings (2026-04-13)

### Tool inventory

24 tools available at the org level. Critical UUIDs saved to
`docs/codacy/tool-uuids.json`:

- `cf05f3aa-fd23-4586-8cce-5368917ec3e5` — **ESLint (deprecated)** ← legacy v8
  with `eslint-plugin-es` and `eslint-plugin-fp` enabled by default
- `f8b29663-2cb2-498d-b923-a10c6a8c05cd` — **ESLint** (current)
- `2a30ab97-477f-4769-8b88-af596ce7a94c` — **ESLint9**
- `934a97f8-835c-42fc-a6d1-02bdfca3bdfa` — **Biome**
- `6792c561-236d-41b7-ba5e-9d6bee0d548b` — **Opengrep** (security; preserved)
- `2fd7fbe0-33f9-4ab3-ab73-e9b62404e2cb` — **Trivy** (security; preserved)
- `13af9d89-1ce5-4fec-a168-765c3e7b26b3` — **Checkov** (security; preserved)
- `76348462-84b3-409a-90d3-955e90abfb87` — **Lizard** (complexity)

### Coding standards

Two standards available at the org level:

- `151338` — **AI Policy** (`isDraft: false`, `isDefault: true`,
  `linkedRepositoriesCount: 1`, `complianceType: ai-risk`,
  `enabledToolsCount: 3`, `enabledPatternsCount: 46`).
  This is the standard linked to `whatsapp_saas`.
- `151337` — **Default coding standard** (`isDraft: false`, `isDefault: true`).

### REST API capability assessment

I probed every plausible mutation endpoint with the
`CODACY_ACCOUNT_TOKEN`. Findings:

| Endpoint                                               | Method                                                                           | Result                                                                          | Verdict                                                                                         |
| ------------------------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `/repositories/{repo}/tools/{tool}/patterns/{pattern}` | `GET`                                                                            | 200, returns full pattern definition                                            | read-only OK                                                                                    |
| `/repositories/{repo}/tools/{tool}/patterns/{pattern}` | `PATCH`                                                                          | 405 Method Not Allowed                                                          | repo-level pattern toggle not allowed via direct endpoint                                       |
| `/repositories/{repo}/tools/{tool}`                    | `PATCH` body `{patterns:[{id,enabled}]}`                                         | 409 `Cannot disable a pattern that is enabled by a Coding Standard`             | pattern enable/disable is gated by the linked standard                                          |
| `/repositories/{repo}/tools/{tool}`                    | `PATCH` body `{settings:{isEnabled:false}}` or `{isEnabled:false}` or variations | 204 No Content but **state did not change** in subsequent reads                 | endpoint accepts the request shape but silently ignores the toggle when `followsStandard: true` |
| `/coding-standards/{standardId}/tools/{tool}`          | `PATCH` body `{patterns:[...]}`                                                  | 409 `Standard is not a draft and cannot be updated` (on the published `151338`) | ✅ correct shape, requires draft mode                                                           |
| `/coding-standards/{standardId}/tools/{tool}`          | `PATCH` body `{patterns:[...]}`                                                  | 204 (on the test draft `151378`) — confirmed `enabledPatternsCount` decremented | ✅ **mutates correctly when standard is in draft**                                              |
| `/coding-standards`                                    | `POST` body `{name, languages}`                                                  | 201 with new id                                                                 | ✅ creates new draft standard                                                                   |
| `/coding-standards/{id}/draft`                         | `POST`                                                                           | 404                                                                             | not the right path                                                                              |
| `/coding-standards/{id}/clone`                         | `POST`                                                                           | 404                                                                             | not the right path                                                                              |
| `/coding-standards/{id}/edit`                          | `POST`                                                                           | 404                                                                             | not the right path                                                                              |
| `/coding-standards/{id}/promote`                       | `POST`                                                                           | 409 `Cannot update non-draft standard`                                          | promote requires the standard to already be a draft                                             |
| `/coding-standards/{id}`                               | `DELETE`                                                                         | 204                                                                             | ✅ delete works (used for cleanup of test draft)                                                |

**Conclusion**: the API IS authorized for mutation, but the only viable
mutation path goes through **draft coding standards**:

1. Create a new draft via `POST /coding-standards`.
2. PATCH patterns into the draft via
   `PATCH /coding-standards/{id}/tools/{tool}` with body
   `{patterns:[{id,enabled}]}`.
3. Promote draft to published via `POST .../promote`.
4. Link the repo to the new published standard.
5. Unlink the previous standard.

This path works but is operationally complex (multi-step state transitions,
risk of starting from Codacy defaults that may have MORE noise than the
existing AI Policy). It is preserved as a **fallback** for Phase 1 if the
file-only approach (`.codacy.yml` + `biome.json`) does not deliver the
expected delta.

### Phase 0 cleanup

- Deleted test draft standard `151378` (`AI Policy Convergence`).
- Tool UUID inventory committed at `docs/codacy/tool-uuids.json`.
- Noise pattern inventory committed at `docs/codacy/noise-patterns.json`
  (19 patterns, 16,481 issues = 47.3% of total — **the headroom Phase 1
  is targeting**).

### Decision log

- **Phase 1 will use file-only approach** (`.codacy.yml` + `biome.json`)
  as the primary path. Reasoning: committable, reversible, predictable,
  doesn't fight Codacy's coding-standard internals.
- **Coding-standard draft mutation** is documented above as fallback. If
  Phase 1 file-only delta is < 5,000 issues, a Phase 1.5 will revisit
  the draft mutation path with more deliberate sequencing.

## Phase 1 — File-only configuration (PENDING)

(no overrides applied yet — to be filled when commits land)
