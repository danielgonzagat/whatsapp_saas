# AB-ATOMIC-014

- Status: rejected_as_delivery_accepted_as_algorithm_input
- Objetivo recebido: implementar `atomic_replace_text_in_anchor_region` usando somente MCP/atomic tools.
- Workspace: `/tmp/kloel-opencode-ab14-20260516-2250-atomic`
- Arquivos lidos: `AGENTS.md`, regras OpenCode, `scripts/mcp/atomic-edit/server.ts`, `scripts/mcp/atomic-edit/smoke.ts`.
- Arquivos alterados: `scripts/mcp/atomic-edit/server.ts`.
- Hipotese inicial: o modo ATOMIC deveria entregar a mesma ferramenta com menor superficie e rastreabilidade completa.
- Decisao tomada: rejeitado como entrega final porque nao entregou smoke nem handoff validavel; aceito apenas como insumo de algoritmo.
- Validacao independente: diff parcial inspecionado; sem smoke novo; sem handoff final; sessao encerrada pelo orquestrador apos ficar presa em planejamento/geracao.
- Venceu: match nao sobreposto dentro da regiao (`tOffset += oldText.length`), incorporado na versao hibrida final.
- Perdeu: tempo, cobertura, validacao, handoff e self-termination.
- Proxima recomendacao: primeira mutacao atomica em ate 3 minutos, smoke minimo imediato, handoff compacto e bloqueio explicito se o MCP nao estiver disponivel.
