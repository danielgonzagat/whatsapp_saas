# MISSÃO
Auditar, sem editar arquivos, o readiness de providers Meta, TikTok, Gmail, Microsoft, IMAP/SMTP e gateway de pagamento contra o External Dependency Register e o codigo atual.

# ARQUIVOS PERMITIDOS
- Leitura: `docs/implementation/kloel-cia-external-dependencies.md`
- Leitura: `docs/implementation/kloel-cia-envs-matrix.md`
- Leitura: `backend/src/**`
- Leitura: `frontend/src/**`
- Escrita: nenhuma

# ARQUIVOS PROIBIDOS
- Qualquer arquivo em modo escrita
- `.env*`
- `AGENTS.md`, `CLAUDE.md`, `CODEX.md`
- `ops/**`, `scripts/ops/**`, `.github/**`, `package.json`, lockfiles, eslint configs
- `scripts/pulse/no-hardcoded-reality-audit.ts`

# PRÉ-LEITURA OBRIGATÓRIA
- `docs/implementation/kloel-cia-external-dependencies.md`
- `docs/implementation/kloel-cia-envs-matrix.md`
- `AGENTS.md` como GLOBAL_AGENT_RULE, apenas para obedecer limites de leitura/escrita

# COMPORTAMENTO ESPERADO
Nenhum diff. Produzir matriz provider -> env names -> codigo que usa -> callback URL esperada -> smoke command seguro sem imprimir segredo.

# COMANDOS DE VALIDAÇÃO PERMITIDOS
- `git status --short`
- `rg`
- `sed`
- `ls`
- `find` limitado ao repo

# CRITÉRIO DE SUCESSO
Relatorio cita arquivos concretos e nao tenta ler ou imprimir valores de env.

# CRITÉRIO DE FALHA
Editar arquivo, ler `.env`, imprimir segredo, ou afirmar provider live sem chamada/evidência.

# FORMATO DE RELATÓRIO
- diff resumido: deve ser nenhum
- matriz por provider
- comandos rodados
- bloqueios externos atualizaveis
- smoke commands seguros

# REGRAS DE SEGURANÇA
- nunca colar segredo em arquivo, log ou commit
- nunca tocar arquivo fora de ARQUIVOS PERMITIDOS
- nunca usar `git reset --hard`, `git clean -fd`, `git push --force`
- redigir tokens/keys em qualquer output

# REGRA DE CONFLITO
Se encontrar agente externo editando a mesma superficie, parar e relatar. Nao editar nada.
