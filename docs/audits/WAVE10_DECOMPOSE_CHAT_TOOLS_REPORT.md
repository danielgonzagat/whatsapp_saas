# Wave 10 — Decompose kloel-chat-tools.service.ts (settings/policy)

> Authored by PI atomic subagent `w10-decompose-chat-tools` (DeepSeek V4 Pro, 21k events). Extracts the 4 settings/policy tools from the 852-LOC `kloel-chat-tools.service.ts` into a new `kloel-chat-tools.settings-policy.helpers.ts`, dropping the service to 694 LOC (under 800-LOC cap). Materialized 2026-05-26.


## 1. Lines Extracted + LOC Reduction

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| `kloel-chat-tools.service.ts` | **852 LOC** | **695 LOC** | **−157 LOC** |
| `kloel-chat-tools.settings-policy.helpers.ts` (new) | — | 213 LOC | +213 LOC |

**Target met**: Main service is now at 695 LOC, **well under** the 800-LOC cap.

### What was extracted

All four settings/policy tool methods were extracted:

| Method | Lines (original) | Lines (delegated) |
|--------|-------------------|-------------------|
| `toolToggleAutopilot` | 49 | 7 |
| `toolSetBrandVoice` | 23 | 5 |
| `toolSetSalesPolicy` | 47 | 9 |
| `toolRememberUserInfo` | 60 | 9 |

Also removed from the main service:
- `NON_SLUG_CHAR_RE` constant (used only by `toolRememberUserInfo`)
- `import { safeStr }` (used only by the extracted methods)
- 4 interface declarations: `ToolToggleAutopilotArgs`, `ToolSetBrandVoiceArgs`, `ToolSetSalesPolicyArgs`, `ToolRememberUserInfoArgs`

## 2. Files Created

- **`backend/src/kloel/kloel-chat-tools.settings-policy.helpers.ts`** (213 LOC)
  - Exports 4 interfaces (`ToolToggleAutopilotArgs`, `ToolSetBrandVoiceArgs`, `ToolSetSalesPolicyArgs`, `ToolRememberUserInfoArgs`)
  - Exports 4 standalone functions: `runToggleAutopilot`, `runSetBrandVoice`, `runSetSalesPolicy`, `runRememberUserInfo`
  - Each function takes `PrismaService` as first parameter (matching the existing `kloel-chat-tools.settings.helpers.ts` pattern)
  - Functions use their own `StructuredLogger` instance scoped to `'KloelChatToolsSettingsPolicy'`

### Pattern consistency

The new helper follows the exact same pattern as `kloel-chat-tools.settings.helpers.ts`:
- Standalone exported `run*` functions
- `PrismaService` passed as a parameter (no DI)
- `ToolResult` return type from `kloel-chat-tools.agent-runtime.helpers`

## 3. Backend `tsc` Result

```
✅ PASS — npm run typecheck (tsc -p tsconfig.build.json --noEmit)
   Exit code: 0, no errors
```

## 4. Spec Runs

```
✅ PASS — kloel-chat-tools.service.spec.ts
   Exit code: 0
```

All 10 test cases pass, including:
- `toolToggleAutopilot` → blocks activation when billing suspended, enables via transaction
- `toolSetBrandVoice` → upserts brandVoice in kloelMemory
- `toolSaveProduct`, `toolListProducts`, `toolDeleteProduct` (untouched)

No test changes were needed — the delegation preserves the exact same public API and behavior.

## 5. Public API Preservation

`KloelChatToolsService` retains all 4 method signatures unchanged:

```typescript
toolToggleAutopilot(workspaceId: string, args: ToolToggleAutopilotArgs): Promise<ToolResult>
toolSetBrandVoice(workspaceId: string, args: ToolSetBrandVoiceArgs): Promise<ToolResult>
toolSetSalesPolicy(workspaceId: string, args: ToolSetSalesPolicyArgs, userId?: string): Promise<ToolResult>
toolRememberUserInfo(workspaceId: string, args: ToolRememberUserInfoArgs, userId?: string): Promise<ToolResult>
```

Interfaces are re-exported from `kloel-chat-tools.settings-policy.helpers` via `type` imports, so all existing callers (`kloel-tool-dispatcher`, `kloel-chat-tools.definition`, etc.) continue to resolve types identically.

## 6. Remaining Splits (for future waves)

The audit's other recommended splits remain:
1. **Imports + shared utils** (~lines 1-122) — `centsFromUnknown()`, remaining interfaces
2. **Core product CRUD tools** (~lines 125-202) — `toolSaveProduct`, `toolListProducts`, `toolDeleteProduct`
3. **Remaining tools + class boilerplate** — dashboard, payments, agent runtime delegators, stub tools

This extraction (settings/policy) was the safest first slice: no shared mutable state, pure delegation pattern.