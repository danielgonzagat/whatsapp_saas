# Kloel Canonical Vocabulary

> Starter dictionary. Each row maps a canonical name to forbidden/deprecated aliases. Extend as canonicalization decisions are made.

| Canonical | Aliases to migrate | Notes |
|---|---|---|
| `ChannelSession` | `whatsappSession`, `waSession`, `connection`, `instance`, `botSession` | Authoritative session entity across all messaging channels |
| `Contact` | `Lead`, `Client`, `Customer`, `Prospect`, `User` (in messaging context) | General entity; `Lead`/`Customer` allowed only as funnel-stage labels |
| `MessageDispatchService` | `WahaService.sendMessage`, `WhatsappApiService.sendText`, `MessageWorker.process` (in send role) | Single send pipeline; channel-specific adapters live below it |
| `Webhook` | `Hook`, `Callback`, `Notification`, `IncomingEvent` | External provider → internal event boundary |
| `Workspace` | `Tenant`, `Org`, `Account` (in scope context) | The multi-tenant unit |

## How to add an entry

1. Find duplication: see `DUPLICATION_REGISTER.md` or `CAPABILITY_MAP.md`
2. Pick the canonical name (preferred: domain-clear, no abbreviation)
3. List all aliases
4. Add row above
5. Migration codemod can read this table to perform safe renames via `mcp__atomic-edit__atomic_rename_symbol_cross_file`
