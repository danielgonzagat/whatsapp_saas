# MISSAO
Audit webhook, rate limit, and observability hardening surfaces that affect W8/S4/S5/O1/O2, and identify local closure slices.

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
Produce a concise audit report in stdout. Focus on inbound webhooks, signature/secret checks, request/correlation ids, ops events, Sentry/metrics hooks, and public endpoint rate limits.

# COMANDOS DE VALIDACAO PERMITIDOS
- `rg -n "webhook|signature|x-hub-signature|verify|secret|RateLimit|Throttle|RouteClass|Sentry|Metrics|correlation|requestId|ops" backend/src worker frontend/src`
- `sed -n` on relevant files

# CRITERIO DE SUCESSO
Report exact paths, known covered surfaces, gaps that can be locally fixed, and external-only blockers.

# CRITERIO DE FALHA
Any file modification, secret printing, destructive command, or unsupported claim.

# FORMATO DE RELATORIO
- files inspected
- protected surfaces
- gaps
- recommended next slice

# REGRAS DE SEGURANCA
Never print secrets. Never write files. Never run destructive git commands.

# REGRA DE CONFLITO
If a webhook cannot be verified without provider secret/account access, classify as external smoke blocker and identify code-side checks separately.
