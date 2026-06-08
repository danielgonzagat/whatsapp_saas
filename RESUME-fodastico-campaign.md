# RESUME — Campanha "Kloel é fodástico? → resolver tudo" (PR #488)

> Cinto+suspensório do estado salvo. A fonte autoritativa é a **memória** do Claude
> (`~/.claude/projects/-Users-danielpenin-kloel/memory/kloel-fodastico-resolve-campaign.md`),
> que carrega sozinha. Abra o Claude nesta pasta e escreva **"continuar"** — ele retoma daqui.

Branch: `codex/kloel-production-recovery-pr-20260604` (PR #488). Backend `tsc --noEmit` = **0 erros**.

## Decisões do Daniel (não re-perguntar)
- Módulos mortos: **TRIAR** — ligar valiosos, deletar cerimônia.
- Finalização: **commit por lote, só os arquivos do enxame, sem push** (`git commit -- <paths>`, only-mode, header≤100, body≤100, retry no index.lock).

## Modelo operacional (crítico)
Outro agente commita o working tree inteiro nesta branch. **Committed sobrevive; uncommitted é revertido.** Por isso cada enxame edita → verifica → commita os próprios arquivos rápido. Manter tsc=0 sempre.

## Já resolvido (committed)
- `17c5a90e6` — gate Lean/Z3 honesto (roda os provers de verdade), OAuth hardening, admin-MFA rate-limit.
- `544247a78` — beliefs→recall vivo, Hebbian durável (sem migration), capabilities honestas, MemoryEdge defense-in-depth, embed-test.
- `f7d19e2d0` — recuperou recallGraph/updateGraphNode + WireContextBlock fallback (tsc voltou a 0).
- `1d14025df` — 7 testes stale do kloel-thinker sincronizados (labels PT-BR, trace markdown, surface dashboard-chat).

## Falta (próximos enxames)
1. **Triagem** (plano pronto): LIGAR no mind-bg tick os cognitivos com lógica real (`agency, evol, hypproof, wisdom, commem`); `lineage` já vivo = MANTER; `goal-field` = LIGAR entrypoint real. Os defensivos (`defens, legit, role, incent, recovery, offer, cash`) + `daily-dashboard` têm lógica real mas zero consumers → **CONFIRMAR a lista de deleção com o Daniel antes de apagar** (ele já se queimou com deleção).
2. **Catchup do WhatsApp** pula o mind-percept do inbound → ligar (aditivo).
3. **Flag `KLOEL_THINK_LOOP_ENABLED`** (telemetria surprise/belief) default OFF → decisão do Daniel (ligar ou documentar). Não flipar prod-default sozinho.

## MCP atomic-edit (caiu, -32000)
Build SÃO. Falta o broker. Daniel sobe no terminal real:
`cd /Users/danielpenin/kloel && node scripts/mcp/atomic-edit/codex-atomic-host-launcher.mjs -- sleep 86400` (deixa aberto) → depois `/mcp` → reconnect atomic-edit. A campanha não depende dele.
