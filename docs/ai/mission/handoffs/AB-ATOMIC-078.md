# AB-ATOMIC-078

- Status: rejected_context_dependency_loss
- Prompt recebido: executar a mesma extracao dos tres metodos de runtime context usando somente Atomic OS, via preprompt shell e macro `extract_class_methods_to_file`.
- Arquivos lidos: simbolos alvo por `code_read_symbol` no worktree ATOMIC.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`, `backend/src/kloel/unified-agent-runtime-context.helpers.ts` e `.atomic/traces`.
- Hipotese inicial: o operador de extracao de metodos de classe venceria a nova complexidade se os callsites recebessem `this.agentRuntime`.
- Decisao tomada: rejeitar como entrega funcional; aceitar apenas como detector de lacuna do operador macro.
- Testes/comandos executados: `atomic-call.cjs extract_class_methods_to_file` com validacao embutida; validacao externa repetiu Jest focado, typecheck, diff-check, protected diff, suppression scan, helper no-`this.` scan e private-method scan.
- Evidencia antes/depois:
  - OpenCode/preprompt exit do macro: `1`.
  - Jest focado falhou: `8 failed, 5 passed`.
  - Helper novo manteve `this.agentRuntime` em linhas 8, 11, 24 e 32.
  - Typecheck registrou erros Kloel `TS2554` em `unified-agent.service.ts` nos callsites convertidos.
  - Eventos `3`, comandos `1`, failed commands `1`, input `53.726`, output `103`, reasoning `230`, `.atomic/traces=12`.
  - `atomicModeClean=true`; zero native file tools, zero shell source reads, zero masked pipeline e zero worktree escape.
- Risco residual: metricas brutas foram excelentes, mas nao podem ser usadas para declarar vitoria quando o comportamento quebrou.
- Recomendacao para proximo worker: atualizar `extract_class_methods_to_file` com adaptadores de metodo: header/import do helper, parametro explicito de dependencia e substituicao deterministica `this.agentRuntime -> agentRuntime`; repetir o mesmo round antes de escalar.
