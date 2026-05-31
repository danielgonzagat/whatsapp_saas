# Kloel Motor — Production Triage Runbook

> Wave-K1+K2 observability (PR #463 / #462). On-call triage for chat-fallback symptoms.

## 1. Symptoms

User-facing strings (verbatim) indicating motor failure:

- **Dashboard chat:** `"Eu fiquei sem acesso ao motor de resposta agora. Me chama de novo em instantes que eu retomo sem te fazer repetir tudo."` — `kloel-reply-engine.service.ts:43`.
- **Onboarding:** `"Tive uma instabilidade momentânea pra processar agora. Pode repetir a mensagem em alguns segundos? Estou aqui pra continuar o onboarding."` — `conversational-onboarding.service.ts:317`.
- **Mind runtime:** `"O Kloel teve uma instabilidade momentânea..."` — `mind/coordination/mind-runtime.controller.ts:113`, `mind-decide-degrade.filter.ts:75`.

## 2. First response (under 60 seconds)

```bash
KLOEL_BACKEND_URL=https://<railway-host> \
DIAG_TOKEN=$(op read 'op://Private/kloel-backend-diag-jwt/credential') \
  npm run probe:kloel-prod
```

Hits `/diag`, `/diag/full`, `/diag/kloel-motor` (`JwtAuthGuard` via `InternalEndpoint`). One JSON per probe + final `summary`. Exit `0` healthy, `1` degraded. Token never echoed.

`/diag/kloel-motor` (`diagnostics.controller.ts:339-372`): `{ status, provider, hasPrimaryKey, hasAnthropicFallback, notes[] }`.

| Scenario        | motor_status | motor_provider                    | Read |
| --------------- | ------------ | --------------------------------- | ---- |
| **Healthy**     | `healthy`    | `deepseek` / `generic` / `openai` | At least one primary key set. Chat works. |
| **No key**      | `degraded`   | `null`                            | No `DEEPSEEK_API_KEY` / `LLM_API_KEY` / `OPENAI_API_KEY`. Every chat returns the fallback. Fix env. |
| **Degraded other** | `degraded` | provider name                    | Key present but a probe failed or `notes[]` flags drift. Go to §3. |

`notes[]` is the smoking gun (empty when healthy, populated otherwise).

## 3. Log triage

Search Railway logs by `tag` (StructuredLogger flattens it into the JSON payload).

### `kloel_motor_unavailable`

| reason                       | File:line                              | Upstream fix |
|------------------------------|----------------------------------------|--------------|
| `no_llm_client`              | `kloel-reply-engine.service.ts:454`    | `this.openai` is null → no primary key. Set `DEEPSEEK_API_KEY` / `LLM_API_KEY` / `OPENAI_API_KEY`. |
| `no_llm_key_and_no_anthropic`| `kloel-reply-engine.helpers.ts:242`    | Same + no `ANTHROPIC_API_KEY`. Set at least one. |
| `empty_llm_response`         | `kloel-reply-engine.helpers.ts:365`    | LLM 200 with empty content. Check provider rate-limit / outage (`finishReason` in payload). |
| `stream_aborted_unknown`     | `kloel-reply-engine.service.ts:180`    | SSE aborted (non-`timeout`/`client_disconnected`). Inspect `abortReason`; usually LB/WAF reset. |

### `kloel_abi_degraded`

`kloel-reply-engine.service.ts:250 / 265 / 287` inside `buildChatModelMessages`. Chat still replies via structured fallback ABI.

| Payload signal                          | Meaning                  | Upstream fix |
|-----------------------------------------|--------------------------|--------------|
| `build_status != "ok"` (abi_build_failed) | `AbiBuilder.build()` non-ok | Check `AbiBuilderService` + its dependencies. |
| `validation_issues[]` (abi_validation_failed) | Built but failed `validateAbiPayload` | First 3 issues sliced into log. Fix schema drift. |
| `exception_message` non-null (abi_exception) | Build threw | Read `exception_message`; usually upstream timeout / DB. |

### `kloel_onboarding_degraded`

`conversational-onboarding.service.ts:318` in `buildOnboardingFallback`. `reason` set earlier in same file:

| reason            | Where set (line)  | Upstream fix |
|-------------------|-------------------|--------------|
| `token_budget`    | `:205`            | Workspace hit `planLimits.ensureTokenBudget`. Top up plan / audit token spend. |
| `llm_call`        | `:226`            | LLM call in `runOnboardingCompletion` threw. Check `errorName`. |
| `tool_execution`  | `:382`            | `handleInitialToolCalls` threw. Inspect referenced tool. |
| `persist`         | `:392`            | `saveOnboardingMessage` (Prisma) threw. Check DB / `kloelMemory`. |
| `sse_write`       | `:400`            | `res.write` threw — client disconnected after persistence. See §6. |
| `unknown`         | fallthrough `:416` | Read `errorMessage` / `errorName` payload fields. |

### `kloel_mind_signal_skipped`

`kloel-reply-engine.service.ts:225`. Attention/valence services swallowed an error writing mind signals. Non-fatal: chat continues with `mindSignals: { status: 'no_event_source' }`. Read `reason`.

> `kloel_mind_belief_skipped` / `kloel_mind_concept_skipped` are **not emitted today** (post-#463 only `signal` exists). Update this table if a later wave adds them.

### `kloel_onboarding_intent` / `kloel_onboarding_intent_skipped`

Telemetry only — log-level `log`. `:356` (classified) and `:363` (classifier threw). Sustained 100% `_skipped` = `IntentRouter` misconfigured.

## 4. Provider failover

`chatCompletionWithProviderFallback` (`backend/src/lib/llm-provider.ts:197`) iterates `createTextLlmClientPool` in order `deepseek → generic → openai`. Catches `AuthenticationError` + `APIConnectionError` only; other errors propagate. On the last provider, retries once with `fallbackModel` if given, else throws `ProviderPoolExhaustedError`.

Expected logs on a successful deepseek→openai failover:

```
[warn] kloel_motor_unavailable reason=empty_llm_response model=deepseek-chat
[info] chat.completions.create provider=deepseek error=AuthenticationError
[info] chat.completions.create provider=generic error=APIConnectionError
[info] chat.completions.create provider=openai status=200
[info] kloel_onboarding_intent classification=... isChat=true
```

`ProviderPoolExhaustedError` in the next trace = every provider failed; escalate (§6).

## 5. Common fixes

Ranked by frequency:

1. **Missing/expired `DEEPSEEK_API_KEY`** on Railway backend. `/diag/kloel-motor` returns `hasPrimaryKey: false`. Fix: rotate in 1Password and set on Railway.
2. **DeepSeek rate-limit or outage** (`empty_llm_response` / `AuthenticationError` bursts). Fix: also set `LLM_API_KEY` and/or `OPENAI_API_KEY` so the pool has length > 1.
3. **`token_budget` storm from one workspace.** Repeated `kloel_onboarding_degraded reason=token_budget` for same `workspaceId`. Fix: top up that workspace; do **not** raise the global cap.

## 6. When to escalate

Page the human owner when:

- **All providers fail** — `ProviderPoolExhaustedError` from `chatCompletionWithProviderFallback`. Every provider raised auth/connection error for the same request. Likely Railway egress or simultaneous key rotation.
- **`kloel_abi_degraded reason=abi_exception` for >5 % of requests** over 5 min. `AbiBuilder.build` itself throwing; cognitive state broken for that traffic slice.
- **`kloel_onboarding_degraded reason=sse_write`** repeating. SSE closed mid-flight after persistence — user saw fallback but the assistant message is already in `kloelMemory`. Check Railway → Vercel proxy / LB idle timeouts.
