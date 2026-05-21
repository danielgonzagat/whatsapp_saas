# MISSAO
Audit the current backend payout/withdrawal surfaces and report whether payout creation is already protected by human approval and workspace ownership.

# ARQUIVOS PERMITIDOS
Read-only audit. Do not edit any file.

# ARQUIVOS PROIBIDOS
All files are prohibited for writing. Do not edit governance/protected files, package files, CI, ops, or source files.

# PRE-LEITURA OBRIGATORIA
- `AGENTS.md`
- `CODEX.md`
- `docs/implementation/kloel-cia-vision-traceability.md`
- `docs/implementation/kloel-cia-gap-inventory.md`
- `scripts/decomp/opencode-subagent-delegation-rules.md` only to classify it as PULSE-only and not apply PULSE debt rules to this task.

# COMPORTAMENTO ESPERADO
Produce a concise audit report in stdout. Identify payout controllers/services, ApprovalRequest usage, owner/admin decision APIs, idempotency, and workspace-boundary checks.

# COMANDOS DE VALIDACAO PERMITIDOS
- `rg -n "payout|saque|ApprovalRequest|approval|workspaceId|accountBalanceId" backend/src/payments backend/src/wallet backend/src/kloel`
- `sed -n` on relevant files

# CRITERIO DE SUCESSO
Report exact paths and a recommendation: no code change needed, or smallest backend guard needed.

# CRITERIO DE FALHA
Any file modification, secret printing, or broad refactor suggestion without repo evidence.

# FORMATO DE RELATORIO
- files inspected
- payout paths found
- approval status
- workspace-boundary evidence
- recommendation
- residual risk

# REGRAS DE SEGURANCA
Never print secrets. Never write files. Never run destructive git commands.

# REGRA DE CONFLITO
If controller semantics are ambiguous, mark the ambiguity with exact route and service references.
