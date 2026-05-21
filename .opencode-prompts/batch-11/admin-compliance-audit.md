# MISSAO
Audit W8 admin/compliance readiness surfaces and identify the smallest local code gaps that can be closed without provider credentials.

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
Produce a concise audit report in stdout. Focus on `adm`/admin IAM, audit log, LGPD/export/delete, and admin session risk. Identify exact files/routes/services and whether behavior is already covered by tests.

# COMANDOS DE VALIDACAO PERMITIDOS
- `rg -n "AdminAuthGuard|AdminPermission|AdminAudit|audit|Gdpr|gdpr|data deletion|delete account|export" backend/src frontend/src`
- `sed -n` on relevant files

# CRITERIO DE SUCESSO
Report exact paths, current evidence, missing proof, and 1-3 smallest code/test slices to close next.

# CRITERIO DE FALHA
Any file modification, secret printing, destructive command, or unsupported claim.

# FORMATO DE RELATORIO
- files inspected
- surfaces found
- current proof
- missing proof/gaps
- recommended next slice

# REGRAS DE SEGURANCA
Never print secrets. Never write files. Never run destructive git commands.

# REGRA DE CONFLITO
If unsure whether a path is functional, mark it uncertain with evidence instead of guessing.
