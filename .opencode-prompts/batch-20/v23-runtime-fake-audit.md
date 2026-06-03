# MISSAO
Auditar, sem editar, residuos runtime de fake/stub/placeholder/soon no produto Kloel CIA, excluindo testes e placeholders legitimos de inputs.

# ARQUIVOS PERMITIDOS
Somente leitura em:
- `backend/src/**`
- `frontend/src/**`
- `worker/src/**`
- `worker/processors/**`
- `docs/implementation/kloel-cia-vision-traceability.md`
- `docs/implementation/kloel-cia-evidence-ledger.md`

# ARQUIVOS PROIBIDOS
Todos os arquivos fora da lista acima. Nao editar nada.

# PRE-LEITURA OBRIGATORIA
- `AGENTS.md` [GLOBAL_AGENT_RULE]
- `CLAUDE.md` [GLOBAL_AGENT_RULE]
- `CODEX.md` [GLOBAL_AGENT_RULE se existir]
- `docs/implementation/kloel-cia-vision-traceability.md`
- `docs/implementation/kloel-cia-session-handoff.md`

# COMPORTAMENTO ESPERADO
Encontrar candidatos reais de fake completion ainda vivos no runtime, priorizando strings/rotas que afirmam comportamento inexistente.

# COMANDOS DE VALIDACAO PERMITIDOS
- `rg -n "fake|stub|placeholder|em.?breve|coming.?soon|planejado|ComingSoonOverlay|href=\"#" backend/src frontend/src worker/src worker/processors -g "*.{ts,tsx}" -g "!**/*.{spec,test}.{ts,tsx}" -g "!**/__tests__/**"`
- `sed -n` em arquivos encontrados

# CRITERIO DE SUCESSO
Relatorio com top 5 residuos reais, top 5 falsos positivos, e uma recomendacao de primeiro patch pequeno com validacao.

# CRITERIO DE FALHA
Editar arquivos, contar teste/mock legitimo como produto, ou propor apagar UI viva sem substituir por estado real.

# FORMATO DE RELATORIO
- resumo
- candidatos reais
- falsos positivos
- primeiro patch recomendado
- comandos rodados e resultado
- riscos remanescentes

# REGRAS DE SEGURANCA
- nunca colar segredo em arquivo, log ou commit
- nunca tocar arquivo fora de ARQUIVOS PERMITIDOS
- nunca usar git reset, git clean, git restore ou push
- redigir tokens/keys em qualquer output
