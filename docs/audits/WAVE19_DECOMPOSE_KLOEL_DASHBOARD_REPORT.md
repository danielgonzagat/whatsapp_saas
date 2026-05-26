# Wave 19 — Decompose KloelDashboard.tsx

> Authored by PI atomic subagent `w19-decompose-kloel-dashboard` (DeepSeek V4 Pro). Materialized 2026-05-26.


## Summary

Extracted the **message interaction handlers** (`handleUserRetry`, `handleUserEdit`, `handleAssistantFeedback`, `handleAssistantRegenerate`) from `KloelDashboard.tsx` into a custom hook `useKloelMessageHandlers` in a sibling file.

## 1. Lines Extracted + New LOC

| File | Before | After | Delta |
|------|--------|-------|-------|
| `KloelDashboard.tsx` | 590 LOC | 483 LOC | **−107** |
| `KloelDashboard.messageHandlers.ts` | — | 148 LOC | **+148** |

### What was extracted

Four `useCallback`-wrapped handlers (107 lines of logic):

- `handleUserRetry` — re-sends a user message to the assistant
- `handleUserEdit` — updates a thread message then re-sends
- `handleAssistantFeedback` — records positive/negative feedback via API
- `handleAssistantRegenerate` — rewrites an assistant response in-place with streaming UI state management

## 2. Files Created

### `frontend/src/components/kloel/dashboard/KloelDashboard.messageHandlers.ts`

- **148 lines**
- Exports `useKloelMessageHandlers(deps)` hook
- Exports `UseKloelMessageHandlersDeps` interface
- Imports only what the handlers need: `useCallback`, `KloelChatRequestMetadata`, `updateKloelThreadMessage`, `updateKloelMessageFeedback`, `regenerateKloelConversationMessage`, `getAssistantResponseVersions`, `toErrorMessage`, `toMessageMetadata`, `DashboardMessage`

## 3. Frontend tsc Result

```
✅ PASS — npx tsc --noEmit exited 0, no errors
```

## 4. Shell-Preservation Confirmation

### Verified invariant: the `<KloelDashboardView>` JSX return block is byte-identical

The return statement in `KloelDashboard.tsx` passes every prop in the same order, with the same variable names:

```tsx
<KloelDashboardView
  ...
  onUserEdit={handleUserEdit}
  onUserRetry={handleUserRetry}
  onAssistantFeedback={handleAssistantFeedback}
  onAssistantRegenerate={handleAssistantRegenerate}
  ...
/>
```

These four handlers are now destructured from `useKloelMessageHandlers({...})` instead of being defined inline — but the JSX shell, every `className`, every `style` object, every `motion` config, and every `framer-motion` animation lives untouched inside `KloelDashboardView.tsx` and its sub-components.

### Verified: all existing tests pass

```
✅ KloelDashboardView.test.tsx — 1 test passed (231ms)
```

## 5. Removed Imports from KloelDashboard.tsx

These imports moved to the new hook file where they belong:

- `regenerateKloelConversationMessage`, `updateKloelMessageFeedback`, `updateKloelThreadMessage` (from `@/lib/kloel-conversations`)
- `getAssistantResponseVersions` (from `@/lib/kloel-message-ui`)
- `toErrorMessage` (from `./KloelDashboard.helpers`)
- `type KloelChatRequestMetadata` (from `@/lib/kloel-chat`)

## 6. Architectural Notes

- The extraction follows the existing pattern: `useKloelFiles`, `useKloelDragDrop`, `useBrainRouter` are already custom hooks in sibling/child files.
- `useKloelMessageHandlers` takes a single `deps` object (mirroring `useBrainRouter`'s pattern) rather than positional arguments.
- Zero behavioral change. No new allocations beyond the hook call itself (same `useCallback` memoization, same dependency arrays).
