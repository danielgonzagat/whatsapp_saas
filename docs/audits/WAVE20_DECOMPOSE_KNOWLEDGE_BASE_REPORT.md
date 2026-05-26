# Wave 20 — Decompose knowledge-base.service.ts

> Authored by PI atomic subagent `w20-decompose-knowledge-base` (DeepSeek V4 Pro). Materialized 2026-05-26.


## Summary

Extracted the **text chunking / splitting** logic (7 symbols) from `knowledge-base.service.ts` (569 LOC → 506 LOC) into a sibling `knowledge-base.chunking.helpers.ts` (80 LOC).

## Extracted group: Text Chunking

| # | Symbol | Kind | Exported |
|---|--------|------|----------|
| 1 | `SENTENCE_ENDINGS` | const | yes |
| 2 | `KNOWLEDGE_BASE_CHUNK_SIZE` | const | yes |
| 3 | `KNOWLEDGE_BASE_CHUNK_OVERLAP` | const | yes |
| 4 | `isSplitCandidate` | function | no (internal) |
| 5 | `findSentenceSplit` | function | no (internal) |
| 6 | `findChunkEnd` | function | no (internal) |
| 7 | `splitKnowledgeBaseText` | function | yes |

**Rationale**: These are pure text-processing utilities with no NestJS dependencies, no injected services, and a single external import (`WHITESPACE_G_RE` from `../common/regex`). The comment explicitly says "Keep this aligned with worker/processors/memory-processor.ts" — extracting into a dedicated module makes cross-package alignment easier.

## Line Counts

| File | Before | After | Delta |
|------|--------|-------|-------|
| `knowledge-base.service.ts` | 569 | 506 | −63 |
| `knowledge-base.chunking.helpers.ts` | — | 80 | +80 |
| **Net** | 569 | 586 | +17 |

## Files Created

- `backend/src/ai-brain/knowledge-base.chunking.helpers.ts` — 80 LOC

## Files Modified

- `backend/src/ai-brain/knowledge-base.service.ts` — removed chunking symbols, added import

## Verification

### Backend tsc

```
npm --prefix backend run typecheck
→ exitCode 0
```

### Specs

```
npm --prefix backend run test -- --runInBand backend/src/ai-brain/knowledge-base.service.spec.ts
→ exitCode 0

npm --prefix backend run test -- --runInBand backend/src/ai-brain/knowledge-base.controller.spec.ts
→ exitCode 0
```

## Public API

No public API changes. `KnowledgeBaseService` class signature and all public method signatures are unchanged. The internal `estimateEmbeddingQuote` method now imports `splitKnowledgeBaseText`, `KNOWLEDGE_BASE_CHUNK_SIZE`, and `KNOWLEDGE_BASE_CHUNK_OVERLAP` from the helper module — behavior is identical.
