# MISSAO
Audit mass-send, campaign-send, and provider ad activation surfaces and report whether autonomous execution paths are protected by human approval.

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
Produce a concise audit report in stdout. Distinguish draft campaign creation from actual mass send/provider-side mutation.

# COMANDOS DE VALIDACAO PERMITIDOS
- `rg -n "sendCampaign|send campaign|send.*campaign|bulk|mass|campaign|ad rule|activate|pause|budget|provider" backend/src frontend/src worker`
- `sed -n` on relevant files

# CRITERIO DE SUCESSO
Report exact paths and a recommendation: no code change needed, or smallest backend guard needed.

# CRITERIO DE FALHA
Any file modification, secret printing, or broad refactor suggestion without repo evidence.

# FORMATO DE RELATORIO
- files inspected
- mass-send/provider mutation paths found
- approval status
- recommendation
- residual risk

# REGRAS DE SEGURANCA
Never print secrets. Never write files. Never run destructive git commands.

# REGRA DE CONFLITO
If a path only creates a draft, say so explicitly and do not classify it as a live send.
