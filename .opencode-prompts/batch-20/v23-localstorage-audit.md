# MISSAO
Auditar, sem editar, os usos de localStorage que ainda podem violar V17/V23 no chat interno e nos fluxos de checkout/onboarding.

# ARQUIVOS PERMITIDOS
Somente leitura:
- `frontend/src/components/kloel/useChatController.ts`
- `frontend/src/components/kloel/chat-container.message-sender.ts`
- `frontend/src/components/kloel/landing/FloatingChat.tsx`
- `frontend/src/components/kloel/landing/FloatingChat.helpers.ts`
- `frontend/src/app/(checkout)/hooks/**`
- `frontend/src/components/products/useCheckoutFormState.ts`
- `frontend/src/components/products/ProductCheckoutsTab.tsx`
- `backend/src/kloel/guest-chat.controller.ts`
- `backend/src/kloel/guest-chat.service.ts`
- `backend/src/kloel/kloel.controller.ts`
- `backend/src/kloel/kloel-thread.service.ts`

# ARQUIVOS PROIBIDOS
Todos os arquivos fora da lista acima. Nao editar nada.

# PRE-LEITURA OBRIGATORIA
- `AGENTS.md` [GLOBAL_AGENT_RULE]
- `CLAUDE.md` [GLOBAL_AGENT_RULE]
- `CODEX.md` [GLOBAL_AGENT_RULE se existir]
- `docs/implementation/kloel-cia-vision-traceability.md`
- `docs/implementation/kloel-cia-session-handoff.md`

# COMPORTAMENTO ESPERADO
Relatar quais usos de localStorage sao dado de negocio e quais sao preferencia/draft aceitavel, com caminho de migracao minimo para backend existente.

# COMANDOS DE VALIDACAO PERMITIDOS
- `rg -n "localStorage" frontend/src -g "*.{ts,tsx}" -g "!**/*.{spec,test}.{ts,tsx}" -g "!**/__tests__/**"`
- `sed -n` nos arquivos permitidos

# CRITERIO DE SUCESSO
Relatorio aponta o proximo slice implementavel com arquivos exatos, endpoints existentes a reutilizar, testes focados recomendados e riscos.

# CRITERIO DE FALHA
Editar arquivos, sugerir mock/fallback falso, ou declarar que algo esta pronto sem evidencia.

# FORMATO DE RELATORIO
- resumo
- achados por arquivo
- classificacao negocio vs UI/draft
- proximo slice implementavel
- comandos rodados e resultado
- riscos remanescentes

# REGRAS DE SEGURANCA
- nunca colar segredo em arquivo, log ou commit
- nunca tocar arquivo fora de ARQUIVOS PERMITIDOS
- nunca usar git reset, git clean, git restore ou push
- redigir tokens/keys em qualquer output
