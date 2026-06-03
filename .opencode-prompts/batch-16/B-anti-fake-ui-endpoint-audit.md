# MISSÃO
Auditar, sem editar arquivos, rotas frontend de Marketing/Chat/Produtos/Checkout/Carteira/Relatorios para identificar botoes/telas que ainda parecem fachada sem endpoint ou persistencia real.

# ARQUIVOS PERMITIDOS
- Leitura: `frontend/src/**`
- Leitura: `backend/src/**`
- Leitura: `docs/implementation/kloel-cia-*.md`
- Escrita: nenhuma

# ARQUIVOS PROIBIDOS
- Qualquer arquivo em modo escrita
- `AGENTS.md`, `CLAUDE.md`, `CODEX.md`
- `ops/**`, `scripts/ops/**`, `.github/**`, `package.json`, lockfiles, eslint configs
- `scripts/pulse/no-hardcoded-reality-audit.ts`

# PRÉ-LEITURA OBRIGATÓRIA
- `docs/implementation/kloel-cia-gap-inventory.md`
- `docs/implementation/kloel-cia-vision-traceability.md`
- `AGENTS.md` como GLOBAL_AGENT_RULE, apenas para obedecer limites de leitura/escrita

# COMPORTAMENTO ESPERADO
Nenhum diff. Produzir uma lista priorizada V23 de possiveis fake-completion gaps com path, componente, acao do usuario, endpoint esperado, endpoint encontrado ou ausente.

# COMANDOS DE VALIDAÇÃO PERMITIDOS
- `git status --short`
- `rg`
- `sed`
- `ls`
- `find` limitado ao repo

# CRITÉRIO DE SUCESSO
Relatorio diferencia explicitamente: confirmado fake, suspeita que precisa teste, e conectado a endpoint real.

# CRITÉRIO DE FALHA
Editar arquivo, classificar UI como fake sem ler o cliente API/backend, ou usar mock como aceite.

# FORMATO DE RELATÓRIO
- diff resumido: deve ser nenhum
- top 10 gaps V23 com evidência de path/linha
- comandos rodados
- riscos remanescentes
- sugestao de proxima fatia implementavel

# REGRAS DE SEGURANÇA
- nunca colar segredo em arquivo, log ou commit
- nunca tocar arquivo fora de ARQUIVOS PERMITIDOS
- nunca usar `git reset --hard`, `git clean -fd`, `git push --force`
- redigir tokens/keys em qualquer output

# REGRA DE CONFLITO
Se encontrar agente externo editando a mesma superficie, parar e relatar. Nao editar nada.
