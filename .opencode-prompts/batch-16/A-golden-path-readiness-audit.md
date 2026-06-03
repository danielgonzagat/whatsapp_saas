# MISSÃO
Mapear, sem editar arquivos, o estado real do Golden Path SOTA Slice 10/10 apos o merge atual e apontar a menor proxima acao executavel por marco.

# ARQUIVOS PERMITIDOS
- Leitura: `docs/implementation/kloel-cia-*.md`
- Leitura: `frontend/src/**`
- Leitura: `backend/src/**`
- Leitura: `worker/**`
- Escrita: nenhuma

# ARQUIVOS PROIBIDOS
- Qualquer arquivo em modo escrita
- `AGENTS.md`, `CLAUDE.md`, `CODEX.md`
- `ops/**`, `scripts/ops/**`, `.github/**`, `package.json`, lockfiles, eslint configs
- `scripts/pulse/no-hardcoded-reality-audit.ts`

# PRÉ-LEITURA OBRIGATÓRIA
- `docs/implementation/kloel-cia-session-handoff.md`
- `docs/implementation/kloel-cia-evidence-ledger.md`
- `docs/implementation/kloel-cia-vision-traceability.md`
- `docs/implementation/kloel-cia-external-dependencies.md`
- `AGENTS.md` como GLOBAL_AGENT_RULE, apenas para obedecer limites de leitura/escrita

# COMPORTAMENTO ESPERADO
Nenhum diff. Produzir relatório textual com uma tabela dos 10 marcos do Golden Path: evidencia local atual, bloqueio externo, menor proxima acao sem credencial, menor proxima acao quando credencial existir.

# COMANDOS DE VALIDAÇÃO PERMITIDOS
- `git status --short`
- `rg`
- `sed`
- `ls`
- `find` limitado ao repo

# CRITÉRIO DE SUCESSO
Relatorio cita paths concretos e nao declara nenhum marco provado sem evidência.

# CRITÉRIO DE FALHA
Editar arquivo, inventar estado de provider, imprimir segredo, ou sugerir mock como producao.

# FORMATO DE RELATÓRIO
- diff resumido: deve ser nenhum
- tabela Golden Path 1-10
- comandos rodados e resultado
- riscos remanescentes
- entrada sugerida para Evidence Ledger, se aplicavel

# REGRAS DE SEGURANÇA
- nunca colar segredo em arquivo, log ou commit
- nunca tocar arquivo fora de ARQUIVOS PERMITIDOS
- nunca usar `git reset --hard`, `git clean -fd`, `git push --force`
- redigir tokens/keys em qualquer output

# REGRA DE CONFLITO
Se encontrar agente externo editando a mesma superficie, parar e relatar. Nao editar nada.
