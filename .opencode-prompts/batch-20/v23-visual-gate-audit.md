# MISSAO
Auditar, sem editar, o bloqueio atual do pre-push `guard:visual-contract` e agrupar as 84 regressões por padrao corrigivel.

# ARQUIVOS PERMITIDOS
Somente leitura:
- `scripts/ops/check-visual-contract.mjs`
- `ops/kloel-design-tokens.json`
- arquivos frontend citados pelo ultimo output de pre-push
- `docs/implementation/kloel-cia-session-handoff.md`

# ARQUIVOS PROIBIDOS
Todos os arquivos fora da lista acima. Nao editar nada.

# PRE-LEITURA OBRIGATORIA
- `AGENTS.md` [GLOBAL_AGENT_RULE]
- `CLAUDE.md` [GLOBAL_AGENT_RULE]
- `CODEX.md` [GLOBAL_AGENT_RULE se existir]
- `docs/implementation/kloel-cia-session-handoff.md`

# COMPORTAMENTO ESPERADO
Agrupar o gate visual por tipos de cor/radius/gradient/spinner/chat font e identificar uma fatia pequena que reduza o bloqueio sem relaxar regras.

# COMANDOS DE VALIDACAO PERMITIDOS
- `node scripts/ops/check-visual-contract.mjs`
- `sed -n` nos arquivos citados
- `rg -n "borderRadius: (2|3|10|20|50|99|999)|gradient|animate-spin|Loader2|#[0-9A-Fa-f]" frontend/src`

# CRITERIO DE SUCESSO
Relatorio com agrupamento, primeira fatia recomendada, arquivos exatos, e validacao para depois do patch.

# CRITERIO DE FALHA
Editar arquivos, sugerir allowlist, sugerir relaxar gate ou usar skip.

# FORMATO DE RELATORIO
- resumo
- agrupamento das regressões
- primeira fatia recomendada
- comandos rodados e resultado
- riscos remanescentes

# REGRAS DE SEGURANCA
- nunca colar segredo em arquivo, log ou commit
- nunca tocar arquivo fora de ARQUIVOS PERMITIDOS
- nunca usar git reset, git clean, git restore ou push
- redigir tokens/keys em qualquer output
