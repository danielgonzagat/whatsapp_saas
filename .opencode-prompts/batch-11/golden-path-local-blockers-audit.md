# MISSAO
Audit the Golden Path SOTA Slice and identify which remaining blockers can be locally closed without external provider credentials.

# ARQUIVOS PERMITIDOS
Read-only audit. Do not edit any file.

# ARQUIVOS PROIBIDOS
All files are prohibited for writing. Do not edit governance/protected files, package files, CI, ops, or source files.

# PRE-LEITURA OBRIGATORIA
- `AGENTS.md`
- `CODEX.md`
- `docs/implementation/kloel-cia-vision-traceability.md`
- `docs/implementation/kloel-cia-gap-inventory.md`
- `docs/implementation/kloel-cia-external-dependencies.md`
- `scripts/decomp/opencode-subagent-delegation-rules.md` only to classify it as PULSE-only and not apply PULSE debt rules to this task.

# COMPORTAMENTO ESPERADO
Produce a concise audit report in stdout. Map the 10 Golden Path milestones to repo evidence, tests already present, external blockers, and local-only gaps.

# COMANDOS DE VALIDACAO PERMITIDOS
- `rg -n "checkout|paid|wallet|report|dashboard summary|Gmail|Meta|Omnichannel|UnifiedAgent|ApprovalRequest|onboarding" backend/src frontend/src worker e2e`
- `sed -n` on relevant files

# CRITERIO DE SUCESSO
Return a prioritized list of 1-5 local code/test slices that most increase Golden Path proof without live provider credentials.

# CRITERIO DE FALHA
Any file modification, secret printing, destructive command, or unsupported claim.

# FORMATO DE RELATORIO
- milestone map
- externally blocked milestones
- local gaps
- recommended next slice

# REGRAS DE SEGURANCA
Never print secrets. Never write files. Never run destructive git commands.

# REGRA DE CONFLITO
If a milestone requires real provider credentials, mark it external-blocked rather than proposing a mock as proof.
