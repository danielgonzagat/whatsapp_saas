# MISSAO
Audit the current backend refund surfaces and report whether any CIA/chat/autonomous path can trigger a refund without human approval.

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
Produce a concise audit report in stdout. Identify exact files/routes/services, whether the path is owner-manual or CIA/autonomous, and whether ApprovalRequest is already used.

# COMANDOS DE VALIDACAO PERMITIDOS
- `rg -n "refund|reembolso|refund_requested|refundUsageCharge|refunds.create|ApprovalRequest|approval" backend/src`
- `sed -n` on relevant files

# CRITERIO DE SUCESSO
Report exact paths and a recommendation: no code change needed, or smallest backend guard needed.

# CRITERIO DE FALHA
Any file modification, secret printing, or broad refactor suggestion without repo evidence.

# FORMATO DE RELATORIO
- files inspected
- refund paths found
- approval status
- recommendation
- residual risk

# REGRAS DE SEGURANCA
Never print secrets. Never write files. Never run destructive git commands.

# REGRA DE CONFLITO
If unsure whether a path is autonomous, mark it uncertain with evidence instead of guessing.
