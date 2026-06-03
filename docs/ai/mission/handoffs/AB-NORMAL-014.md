# AB-NORMAL-014

- Status: accepted_as_round_winner_with_main_lapida
- Objetivo recebido: implementar `atomic_replace_text_in_anchor_region` no worktree NORMAL, sem usar atomic-edit.
- Workspace: `/tmp/kloel-opencode-ab14-20260516-2250-normal`
- Arquivos lidos: `AGENTS.md`, regras OpenCode, `scripts/mcp/atomic-edit/server.ts`, `scripts/mcp/atomic-edit/smoke.ts`.
- Arquivos alterados: `scripts/mcp/atomic-edit/server.ts`, `scripts/mcp/atomic-edit/smoke.ts`.
- Hipotese inicial: a nova ferramenta deveria preservar anchors e trocar somente `oldText` dentro da regiao delimitada.
- Decisao tomada: melhor entrega funcional do round; usada como base de cobertura, mas nao copiada diretamente.
- Validacao independente: `node --check` server/smoke passou; `node scripts/mcp/atomic-edit/build.mjs` passou; `worker-scope-check` do worktree retornou `ok=true`; `git diff --check` passou; `npx tsx scripts/mcp/atomic-edit/smoke.ts` retornou `219 passed, 7 failed` por falha ambiental de ESLint no worktree, com testes novos passando.
- Venceu: tempo, cobertura funcional, validacao e handoff.
- Perdeu: rastreabilidade atomica e pureza de mutacao; implementacao inicial contava matches sobrepostos.
- Proxima recomendacao: usar o checklist funcional como piso minimo obrigatorio do modo ATOMIC.
