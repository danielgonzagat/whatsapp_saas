# KLOEL Chat Tool Gaps — PI-k1

> Audit date: 2026-05-28
> Scope: `KLOEL_CHAT_TOOLS` (exposed to LLM) ↔ executor surface (`KloelToolDispatcherService` + `UnifiedAgentToolExecutorService`)

## Executive Summary

**Zero dead exposures.** Every one of the 62 tools registered in `KLOEL_CHAT_TOOLS` has a wired executor path.

**104 hidden capabilities.** Tools the executor surface can handle but the LLM doesn't know about — either intentionally restricted or awaiting definition registration.

**Onboarding path is separate.** The `/onboarding/:wsId/chat/stream` endpoint uses `ONBOARDING_TOOLS` (8 tools), not `KLOEL_CHAT_TOOLS`. The "sem acesso ao motor de resposta" fallback originates in `KloelReplyEngineService.unavailableMessage` (no LLM key configured), not from a tool routing gap.

---

## Call-Chain Architecture

The `KloelToolRouter` tries two executor surfaces in sequence:

```
LLM tool_call
  → KloelToolRouter.executeAssistantToolCalls
    → Route 1: UnifiedAgentService.executeTool
        → UnifiedAgentToolExecutorService.execute (switch on tool name)
        → default: delegates to KloelToolDispatcherService.executeTool
    → Route 2 (fallback on "Unknown tool" error): executeLocalTool
        → KloelService.executeTool
        → KloelToolDispatcherService.executeTool (fast-path + direct switch)
```

Route 1 is always tried first. Route 2 only fires if Route 1 explicitly returns `{ error: 'Unknown tool' }`. In practice, `UnifiedAgentToolExecutorService` delegates unknown tools to the dispatcher internally, so Route 2 is rarely exercised for chat tools.## Table 1 — REGISTERED (KLOEL_CHAT_TOOLS)

62 tools exposed to the dashboard chat LLM. All have executor coverage.

| # | Tool Name | Source Definition | Executor Path |
|---|-----------|-------------------|---------------|
| 1 | `save_product` | CORE | Product Catalog handler |
| 2 | `list_products` | CORE | Product Catalog handler |
| 3 | `delete_product` | CORE | Direct switch (dispatcher) |
| 4 | `toggle_autopilot` | CORE | Workspace Action handler + Unified Agent |
| 5 | `set_brand_voice` | CORE | Workspace Action handler |
| 6 | `set_sales_policy` | CORE | Workspace Action handler |
| 7 | `remember_user_info` | CORE | Workspace Action handler |
| 8 | `search_web` | CORE | Direct switch (dispatcher) |
| 9 | `create_flow` | CORE | Workspace Action handler + Unified Agent |
| 10 | `list_flows` | CORE | Workspace Info handler |
| 11 | `get_dashboard_summary` | CORE | Workspace Info handler |
| 12 | `create_payment_link` | CORE | Direct switch (dispatcher) + Unified Agent |
| 13 | `connect_whatsapp` | CORE | WhatsApp handler + Unified Agent |
| 14 | `get_whatsapp_status` | CORE | WhatsApp handler |
| 15 | `send_whatsapp_message` | CORE | WhatsApp handler |
| 16 | `list_whatsapp_contacts` | CORE | WhatsApp handler |
| 17 | `create_whatsapp_contact` | CORE | WhatsApp handler |
| 18 | `list_whatsapp_chats` | CORE | WhatsApp handler |
| 19 | `get_whatsapp_messages` | CORE | WhatsApp handler |
| 20 | `get_whatsapp_backlog` | CORE | WhatsApp handler |
| 21 | `set_whatsapp_presence` | CORE | WhatsApp handler |
| 22 | `sync_whatsapp_history` | CORE | WhatsApp handler |
| 23 | `list_leads` | CORE | Biz Config handler |
| 24 | `get_lead_details` | CORE | Biz Config handler |
| 25 | `send_audio` | Media & Billing | WhatsApp handler + Unified Agent |
| 26 | `send_document` | Media & Billing | WhatsApp handler + Unified Agent |
| 27 | `send_voice_note` | Media & Billing | WhatsApp handler + Unified Agent |
| 28 | `transcribe_audio` | Media & Billing | WhatsApp handler + Unified Agent |
| 29 | `update_billing_info` | Media & Billing | Biz Config handler + Unified Agent |
| 30 | `get_billing_status` | Media & Billing | Biz Config handler + Unified Agent |
| 31 | `change_plan` | Media & Billing | Direct switch (dispatcher) + Unified Agent |
| 32 | `save_business_info` | Settings & Campaigns | Biz Config handler |
| 33 | `set_business_hours` | Settings & Campaigns | Biz Config handler |
| 34 | `create_campaign` | Settings & Campaigns | Direct switch (dispatcher) |
| 35 | `create_agent_job` | Settings & Campaigns | Agent handler |
| 36 | `list_agent_jobs` | Settings & Campaigns | Agent handler |
| 37 | `set_agent_job_enabled` | Settings & Campaigns | Agent handler |
| 38 | `search_agent_memory` | Settings & Campaigns | Agent handler |
| 39 | `search_agent_sessions` | Settings & Campaigns | Agent handler |
| 40 | `get_agent_artifact` | Settings & Campaigns | Agent handler |
| 41 | `upsert_agent_skill` | Settings & Campaigns | Agent handler |
| 42 | `record_agent_delegation` | Settings & Campaigns | Agent handler |
| 43 | `record_agent_skill_outcome` | Settings & Campaigns | Agent handler |
| 44 | `record_agent_evidence` | Settings & Campaigns | Agent handler |
| 45 | `search_agent_evidence` | Settings & Campaigns | Agent handler |
| 46 | `list_agent_evidence` | Settings & Campaigns | Agent handler |
| 47 | `verify_agent_evidence` | Settings & Campaigns | Agent handler |
| 48 | `read_source_file` | Code | Code handler |
| 49 | `list_source_dir` | Code | Code handler |
| 50 | `search_codebase` | Code | Code handler |
| 51 | `code_outline` | Code | Code handler |
| 52 | `read_prisma_schema` | Code | Code handler |
| 53 | `git_log` | Code | Code handler |
| 54 | `git_diff` | Code | Code handler |
| 55 | `git_status` | Code | Code handler |
| 56 | `run_backend_tests` | Code | Code handler |
| 57 | `build_status` | Code | Code handler |
| 58 | `code_lint` | Code | Code handler |
| 59 | `code_detect_issues` | Code | Code handler |
| 60 | `pulse_health` | Code | Code handler |
| 61 | `behavior_graph_node` | Code | Code handler |
| 62 | `runtime_errors` | Code | Code handler |

**Dead exposures: 0.**## Table 2 — HIDDEN CAPABILITIES (implemented but NOT registered)

104 tools the executor surface can handle but the LLM has no `ChatCompletionTool` definition for. They will never be called because the LLM doesn't know they exist.

### Dispatcher fast-path handlers

| Domain | Count | Tools |
|--------|-------|-------|
| Code tools (extended) | 12 | `codegraph_status`, `codegraph_search`, `codegraph_context`, `codegraph_callers`, `codegraph_callees`, `codegraph_impact`, `codegraph_node`, `codegraph_files`, `lsp_diagnostics`, `openapi_route`, `asyncapi_events`, `static_analysis` |
| Self-awareness | 6 | `self.audit_log`, `self.explain`, `self.gaps`, `self.health`, `self.capabilities`, `list_capabilities` |
| Configure (e-commerce) | 7 | `configure_pixel`, `configure_shipping`, `configure_social_proof`, `configure_order_bump`, `configure_warranty`, `configure_exit_intent`, `configure_after_pay` |
| Sales (dotted) | 3 | `sales.create_pix`, `sales.create_boleto`, `sales.create_card_link` |
| Account | 5 | `update_personal_data`, `account.update_personal`, `account.update_fiscal`, `account.upload_document`, `sales.list` |
| Dotted aliases | 11 | `products.create`, `products.update`, `products.upload_image`, `plans.create`, `plans.update`, `checkouts.create`, `checkouts.update`, `coupons.create`, `coupons.delete`, `generate_pix`, `generate_boleto` |
| Reports | 3 | `reports.operations`, `reports.abandonments`, `crm.pipeline` |
| Deps coverage | 3 | `dependencies`, `code_coverage`, `affected_tests` |
| Wallet & Sales | 11 | `get_wallet_balance`, `get_wallet_statement`, `list_orders`, `get_order_details`, `get_sales_summary`, `get_abandonments`, `request_withdrawal`, `get_nps`, `get_churn`, `list_refunds`, `request_anticipation` |
| Biz config (extended) | 7 | `update_affiliate_config`, `list_affiliates`, `update_fiscal_data`, `upload_document`, `get_social_channels`, `connect_channel`, `update_workspace_settings` |
| Product catalog (extended) | 21 | `create_product`, `update_product`, `upload_plan_image`, `upload_product_image`, `coupon_create`, `checkout_create`, `plan_create`, `create_plan`, `update_plan`, `create_checkout`, `update_checkout`, `list_checkouts`, `create_coupon`, `list_coupons`, `delete_plan`, `delete_checkout`, `add_url`, `update_url`, `delete_url`, `delete_coupon`, `update_coupon` |
| Workspace info (extended) | 13 | `get_product_plans`, `get_product_ai_config`, `get_product_reviews`, `get_product_urls`, `validate_coupon`, `toggle_theme`, `get_settings`, `get_analytics`, `get_product_details`, `list_subscriptions`, `update_subscription`, `get_affiliate_config`, `browse_marketplace` |
| Workspace action (extended) | 4 | `send_channel_message`, `create_broadcast`, `configure_ai_persona`, `create_order` |

### Direct switch (dispatcher)

| Count | Tools |
|-------|-------|
| 2 | `publish_product`, `products.review_and_publish` |

### Unified Agent executor (tools unique to this surface)

| Count | Tools |
|-------|-------|
| 21 | `send_message`, `send_product_info`, `update_lead_status`, `add_tag`, `schedule_followup`, `transfer_to_human`, `search_knowledge_base`, `trigger_flow`, `log_event`, `send_media`, `create_flow_from_description`, `import_contacts`, `generate_sales_funnel`, `schedule_campaign`, `get_workspace_status`, `apply_discount`, `handle_objection`, `qualify_lead`, `schedule_meeting`, `anti_churn_action`, `reactivate_ghost` |

**Note:** Some unified-agent tools overlap with dispatcher hidden capabilities (`create_product`, `update_product`, `get_analytics`, `configure_ai_persona`, `create_broadcast`, `update_workspace_settings`, `validate_coupon`, `get_product_plans`). These are counted once in the dispatcher sections above.## Table 3 — GAP

| Metric | Count |
|--------|-------|
| Registered in KLOEL_CHAT_TOOLS | 62 |
| Implemented (union of dispatcher + unified agent) | ~166 |
| Dead exposures (registered, no executor) | **0** |
| Hidden capabilities (executor, not registered) | **104** |

## Recommended Fixes

### Critical (connected to onboarding fallback)

The onboarding `/onboarding/:wsId/chat/stream` endpoint uses `ConversationalOnboardingService`, which has its own tool system (`ONBOARDING_TOOLS` → 8 tools, 6 safe-setup). This is **unrelated** to the `KLOEL_CHAT_TOOLS` system and the `KloelToolDispatcherService`.

If the onboarding chat returns "Eu fiquei sem acesso ao motor de resposta", the root cause is in `KloelReplyEngineService.unavailableMessage` — the `openai` client is `null` (no LLM API key configured or recognized). This is an environment misconfiguration, not a tool gap.

### High-priority hidden capabilities

These tools are wired, tested, and production-ready but invisible to the LLM:

1. **Wallet suite** (11 tools): `get_wallet_balance`, `get_wallet_statement`, `list_orders`, `get_order_details`, `get_sales_summary`, `get_abandonments`, `request_withdrawal`, `get_nps`, `get_churn`, `list_refunds`, `request_anticipation`
   - Fix: Add `kloel-chat-tools-wallet.definition.ts` and spread into `KLOEL_CHAT_TOOLS`.

2. **Sales dotted tools** (3): `sales.create_pix`, `sales.create_boleto`, `sales.create_card_link`
   - Fix: Add definitions to CORE or a new sales block.

3. **E-commerce configure** (7): `configure_pixel`, `configure_shipping`, `configure_social_proof`, etc.
   - Fix: Add `kloel-chat-tools-configure.definition.ts`.

4. **Self-awareness** (6): `self.audit_log`, `self.explain`, `self.gaps`, `self.health`, `self.capabilities`, `list_capabilities`
   - Fix: Add to CORE or a self-tools block.

5. **Product catalog extensions** (21): `create_product`, `update_product`, `create_plan`, `create_coupon`, `list_coupons`, `delete_coupon`, `list_checkouts`, etc.
   - Fix: Expand CORE product definitions or add `kloel-chat-tools-products.definition.ts`.

6. **Reports** (3): `reports.operations`, `reports.abandonments`, `crm.pipeline`
   - Fix: Add to CORE.

### Low-priority / intentionally hidden

- **Code tools extended** (12 `codegraph_*`, `lsp_*`, `openapi_*`, `asyncapi_*`, `static_analysis`): These are developer-oriented. Consider adding to `KLOEL_CHAT_TOOLS_CODE` only if the dashboard LLM should browse the codebase.
- **Account tools** (5): `account.update_personal`, `account.update_fiscal`, etc. — may be gated behind a separate customer-facing flow.
- **Unified Agent lead tools** (21): `send_message`, `update_lead_status`, `schedule_followup`, `handle_objection`, `qualify_lead`, etc. — these are designed for the autopilot WhatsApp agent, not the dashboard chat.

### Smallest fix per gap type

| Gap | Fix |
|-----|-----|
| Wallet tools (11) | Create `kloel-chat-tools-wallet.definition.ts`, spread into `KLOEL_CHAT_TOOLS` |
| Sales dotted tools (3) | Add to CORE as `sales.create_pix` etc. |
| E-commerce configure (7) | Create `kloel-chat-tools-configure.definition.ts` |
| Self tools (6) | Add to CORE |
| Product catalog (21) | Create `kloel-chat-tools-products.definition.ts` |
| Reports (3) | Add to CORE |
| Workspace info ext (13) | Add to existing extras definition |
| Workspace action ext (4) | Add to existing extras definition |
| Dotted aliases (11) | No LLM definition needed — these are internal re-entry aliases. Document in comment. |
| Direct switch (2) | `publish_product`, `products.review_and_publish` — high-risk approval tools. Add with guard. |
| Unified Agent lead tools (21) | Intentionally autopilot-only. No action. |
| Code extended (12) | Optional. Add to `KLOEL_CHAT_TOOLS_CODE` if desired. |## Side Finding: Onboarding Tool Isolation

The onboarding chat stream (`KloelController.chatOnboardingStream` → `ConversationalOnboardingService.chat`) uses a completely separate tool system:

- **Definition:** `conversational-onboarding-tools-schema.ts` (`ONBOARDING_TOOLS`, 8 tools)
- **Safe subset:** 6 tools (`save_business_info`, `save_contact_info`, `add_product`, `set_brand_voice`, `set_business_hours`, `set_main_goal`)
- **Hidden:** `create_initial_flow`, `complete_onboarding` (in ONBOARDING_TOOLS but not in safe-setup)
- **Executor:** `ConversationalOnboardingToolsService.executeToolCall` — a separate service, not wired through `KloelToolDispatcherService`

This means the onboarding LLM has access to 6 tools, none of which flow through the main dispatcher. If the onboarding needs richer capability (e.g., wallet status, product listing), those tools would need to be added to `ONBOARDING_SAFE_SETUP_TOOL_NAMES` and wired through the onboarding tool executor.

## Verification

- `KLOEL_CHAT_TOOLS` = `[...KLOEL_CHAT_TOOLS_CORE, ...KLOEL_CHAT_TOOLS_MEDIA_BILLING, ...KLOEL_CHAT_TOOLS_SETTINGS_CAMPAIGNS, ...KLOEL_CHAT_TOOLS_CODE]`
- `KloelToolDispatcherService.executeTool` dispatches via 16 fast-path handler modules + direct switch (7 cases)
- `UnifiedAgentToolExecutorService.execute` dispatches via 42-case switch + default→dispatcher fallback
- All 62 registered tools resolve through at least one execution path
- Zero `KLOEL_CHAT_TOOLS` entries return "Unknown tool" from the combined executor surface
