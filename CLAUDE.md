# KLOEL — CLAUDE.md

> Este arquivo é lido automaticamente pelo Claude Code no início de toda sessão.
> Ele contém: identidade do projeto, filosofia de construção, ordem de
> dependências, padrões de qualidade, e definição de "pronto" para cada módulo.
> NÃO precisa ser colado como prompt. Ele é contexto permanente.

---

## Acronym Glossary

- ADR: Architecture Decision Record.
- BIG: Big-picture planning marker.
- COM: Communication marker.
- DADOS: Data module marker.
- DEMO: Demonstration or non-production mode.
- DI: Dependency injection.
- DTO: Data transfer object.
- ES: Elasticsearch.
- INVEN: Inventory module marker.
- KYC: Know Your Customer.
- MCP: Model Context Protocol.
- PULSE: Production-readiness and autonomy certification system.
- RIA: Rich internet application.
- START: Session-start marker.
- SWR: Stale-while-revalidate data-fetching strategy.
- TASK: Task marker.
- VIVA: Viva module marker.

## REGRA DE AUTONOMIA (2026-04-18)

Quando Daniel pedir para trabalhar autonomamente (ex.: "trabalhe autonomamente",
"continue autonomo", "até completar 100%"):

1. **NÃO pare para relatar** progresso intermediário.
2. **NÃO pare para pedir confirmação** ou tirar dúvidas — o escopo já está
   completo.
3. **Trabalhe continuamente** até esgotar o que é tecnicamente seguro fazer ou
   até completar 100% do escopo.
4. **Commits e pushes frequentes**, sem interrupções narrativas. Use apenas
   mensagens curtas entre commits quando houver um sinal importante (falha real
   de build, bloqueio intransponível).
5. **Relatório final só no fim do escopo** ou quando um bloqueio objetivo
   impedir continuação.

Parar sem necessidade quando Daniel pediu autonomia é violação desta regra.

## REGRA DE CODACY (2026-04-19)

1. O Codacy deste repo opera em **MAX-RIGOR LOCK**. O objetivo padrao e manter
   **todas** as ferramentas/patterns aplicaveis ativas, com
   gates/coverage/duplication/complexity no nivel mais estrito viavel.
2. **Permitido**:
   - `npm run codacy:sync` para snapshot read-only.
   - `npm run codacy:check-max-rigor` para verificar drift.
   - `npm run codacy:enforce-max-rigor` para reaplicar o estado canonico maximo
     quando houver drift autorizado.
3. **Proibido** reduzir escopo, desativar regra, desativar pattern, criar draft
   para relaxamento, adicionar exclude path, trocar threshold por valor mais
   fraco, ou alterar qualquer configuracao live do Codacy fora do script
   canonico.
4. **Proibido** usar comentarios para satisfazer Codacy. `biome-ignore`,
   `nosemgrep`, `eslint-disable`, `@ts-ignore`, `@ts-expect-error`,
   `@ts-nocheck`, `codacy:disable`, `codacy:ignore`, `NOSONAR` e `noqa` sao
   bypasses proibidos.
5. **Proibido** usar skip tags de commit para tentar desligar analise
   (`[codacy skip]`, `[skip codacy]`, `[ci skip]`, `[skip ci]`).
6. Para reduzir issues, **corrija codigo real**. Se uma regra parecer ruido,
   documente a evidencia, mas nao enfraqueca o Codacy sem aprovacao humana
   explicita.

---

## IDENTIDADE

KLOEL é uma plataforma AI-native de marketing digital e vendas. Monorepo com:

- **Frontend**: Next.js (Vercel) — `frontend/`
- **Backend**: NestJS + Prisma (Railway) — `backend/`
- **Worker**: BullMQ — `worker/` (WhatsApp via WAHA + Meta Cloud API providers,
  see `docs/adr/0001-whatsapp-source-of-truth.md`)
- **Design System**: Terminator — void black (#0A0A0C), Ember (#E85D30), Sora
  font, JetBrains Mono para números, sem gradientes, sem emojis, sem
  border-radius > 6px, SVG icons only

**Estado atual**: 184k linhas, 812 arquivos, 107 models Prisma, 89 controllers.
~40-50% funcionalidade real, resto é shell visual com dados fake.

**NÃO há global prefix** no NestJS. Rotas são como declaradas nos controllers.

---

## REGRA MESTRA — PRESERVAR A CASCA, CONVERTER EM MÁQUINA

NÃO remover telas, tabs, fluxos, componentes, rotas, copy, navegação,
affordances. NÃO reescrever uma tela inteira sem necessidade. NÃO inventar
especificações que não estejam no código existente.

A casca visual é o **contrato de UX**. A missão é fazer a realidade obedecer ao
contrato.

**SIM converter**: dado fake → dado real, handler placebo → handler real,
integração simulada → integração real ou estado honesto.

### Estados Honestos (substituem dados fake)

| Ao invés de...                    | Exibir...                                     |
| --------------------------------- | --------------------------------------------- |
| Math.random() gerando números     | `empty` com "Nenhuma venda ainda" ou `0` real |
| Array hardcoded de dados fake     | `empty-state` com CTA de setup                |
| Integração simulada               | `setup-required` com wizard de conexão        |
| setInterval incrementando valores | Valor real do backend ou `--` com tooltip     |
| FALLBACK_RESPONSES no chat        | `degraded` com "IA indisponível"              |
| localStorage como banco de dados  | Backend real ou `offline-cache` explícito     |

---

## REGRA SUPREMA — PRODUÇÃO REAL, NÃO DEMO

KLOEL não é protótipo, demo, template, landing page ou playground.

Toda mudança deve aproximar o sistema de produção real, isto é:

1. Dados reais persistidos no banco.
2. Fluxos ponta-a-ponta funcionando.
3. Erros tratados de forma explícita e compreensível.
4. Estados vazios honestos quando ainda não houver integração.
5. Testes automatizados ou smoke checks comprovando o comportamento.
6. Logs suficientes para diagnosticar falhas em Railway/Vercel.
7. Nenhum segredo, token, fallback falso ou mock invisível em runtime real.

Uma feature só existe quando o usuário consegue usá-la no frontend, ela chama
uma API real, a API executa regra de negócio real, persiste/consulta o banco
corretamente, e o estado resultante volta para a interface.

Código que apenas "parece funcionar" é dívida, não entrega.

---

## REGRA DE REALIDADE E2E

Antes de declarar qualquer tarefa como concluída, o agente deve responder:

1. Qual caminho de usuário foi afetado?
2. Qual tela, botão, form, endpoint, service, model e tabela estão envolvidos?
3. O frontend chama o endpoint correto?
4. O endpoint existe e está autenticado/autorizado corretamente?
5. O service usa Prisma tipado, transação e workspace isolation quando aplicável?
6. O banco persiste o estado esperado?
7. A UI reflete sucesso, vazio, loading e erro?
8. Há teste unitário, integração, Playwright ou smoke manual documentado?
9. PULSE continua sem regressão relevante?
10. Build/typecheck/lint passaram ou a falha foi documentada com causa objetiva?

Se qualquer resposta for desconhecida, a tarefa não está pronta.

---

## REGRA DE NÃO-INVENÇÃO

O agente não pode inventar comportamento de negócio invisível ao código existente.

Antes de implementar:

1. Procurar o fluxo existente no frontend.
2. Procurar hooks/API client existentes.
3. Procurar controller/service/module relacionados.
4. Procurar models Prisma relacionados.
5. Procurar testes existentes.
6. Procurar ADRs/docs/plans relacionados.
7. Só então propor a menor mudança necessária.

Se o código existente contradiz a intenção aparente, preservar o contrato
visual e adaptar o motor por baixo. Não substituir o produto por uma
interpretação nova.

---

## REGRA DE AUTONOMIA COM SEGURANÇA

Quando Daniel pedir autonomia, o agente deve trabalhar sem interrupção
narrativa, mas NÃO pode atravessar fronteiras perigosas.

Autonomia permitida:

- ler código;
- criar/editar código não protegido;
- criar testes;
- rodar lint/build/typecheck/test;
- rodar PULSE;
- criar commits pequenos;
- atualizar artefatos não protegidos de validação.

Autonomia proibida sem autorização explícita:

- alterar arquivos protegidos;
- relaxar lint, Codacy, CI, hooks ou coverage;
- mexer em secrets;
- executar migração destrutiva;
- fazer deploy em produção;
- rodar scripts contra banco de produção;
- apagar dados;
- remover telas/rotas/fluxos;
- trocar provedor estratégico sem ADR;
- alterar contrato financeiro, ledger, split, payout, KYC ou antifraude sem
  teste e evidência.

Se houver risco de perda financeira, perda de dados, quebra de produção,
vazamento de segredo ou alteração de governança, parar e reportar o bloqueio
objetivo.

## REGRA ABSOLUTA — GIT RESTORE PROIBIDO

`git restore` é proibido para qualquer IA CLI neste repositório.

Proibido sem exceção:

- `git restore <path>`;
- `git restore --source ...`;
- `git restore --staged ...`;
- usar `git restore` dentro de script, codemod, prompt, runbook ou automação.

Motivo: `git restore` pode destruir silenciosamente trabalho não commitado de
humanos ou de outros agentes. Correções devem avançar por edição de código,
restauração a partir de snapshot explícito capturado antes da edição, ou pausa
para o humano decidir. Se não houver snapshot seguro, parar.

---

## REGRA DE TASK SELECTION

Quando Daniel pedir para "continuar", "corrigir tudo", "elevar o nível",
"deixar produção", "trabalhar autônomo" ou equivalente, escolher a próxima
tarefa nesta ordem:

1. Corrigir build quebrado.
2. Corrigir typecheck quebrado.
3. Corrigir testes quebrados.
4. Corrigir falha de boot/DI no backend.
5. Corrigir falhas de segurança, secrets ou auth.
6. Corrigir fluxo financeiro/Stripe/ledger/wallet/checkout.
7. Corrigir fluxo WhatsApp/inbox/autopilot.
8. Corrigir PULSE false negative/false positive que bloqueia diagnóstico.
9. Conectar shell visual existente a backend real.
10. Remover dados fake substituindo por estado honesto.
11. Aumentar cobertura de testes em módulo crítico.
12. Refatorar apenas quando necessário para destravar produção.

Não escolher tarefa cosmética enquanto houver falha funcional, financeira,
auth, build ou PULSE crítica.

---

## REGRA DE EVIDÊNCIA OBRIGATÓRIA

Todo relatório final deve conter evidência real.

Formato mínimo:

- Arquivos alterados.
- Motivo de cada alteração.
- Comandos executados.
- Resultado dos comandos.
- Testes adicionados/alterados.
- Fluxo E2E validado.
- Riscos restantes.
- Próximo passo recomendado.

Proibido declarar:

- "deve funcionar"
- "provavelmente"
- "não testei mas"
- "parece resolvido"
- "implementei completo"

Sem output de validação, usar: "implementado, mas ainda não validado".

---

## REGRA DE BANCO DE DADOS

Toda alteração que envolva persistência deve respeitar:

1. Workspace isolation obrigatório.
2. User ownership/authorization obrigatório.
3. Prisma tipado obrigatório em código novo.
4. Transação para operações multi-tabela.
5. Idempotência para webhooks, pagamentos, filas, convites e eventos externos.
6. Índices/unique constraints quando houver lookup frequente ou deduplicação.
7. Migração Prisma revisável.
8. Seed somente para desenvolvimento/teste, nunca para mascarar feature
   incompleta.
9. Nunca usar `prisma db push` em produção, CI, Docker ou automação.
10. Nunca apagar ou sobrescrever dados financeiros/históricos.

Dinheiro, ledger, payout, wallet e split são append-only por padrão.

---

## REGRA DE API

Toda API nova ou alterada deve ter:

1. Controller fino.
2. Service com regra de negócio.
3. DTO validado com class-validator.
4. Auth guard quando necessário.
5. Workspace guard ou verificação equivalente.
6. Erros de domínio explícitos.
7. Logs estruturados para falhas externas.
8. Teste do service ou controller.
9. Cliente frontend tipado em `frontend/src/lib/api/*`.
10. Hook SWR/ação usando `apiFetch`/`swrFetcher`.

Não criar endpoint que retorna `[]`, `{ ok: true }` ou mock para fingir
progresso.

---

## REGRA DE FRONTEND

Toda mudança de frontend deve respeitar:

1. Preservar shell visual.
2. Usar design tokens oficiais.
3. Usar API layer existente.
4. Usar SWR/hooks existentes quando houver.
5. Implementar loading, empty, error e success states.
6. Não usar `localStorage` como banco.
7. Não usar `Math.random()` em métrica de produto.
8. Não usar arrays hardcoded como dado real.
9. Não criar botão sem handler real.
10. Não esconder erro real do usuário.

Se o backend ainda não existir, mostrar estado honesto de setup/indisponível,
não mock.

---

## REGRA DE INTEGRAÇÕES EXTERNAS

Para Stripe, Meta, WAHA, Google, Bling, Cloudflare, domínio, e-mail, IA, voz,
storage ou qualquer API externa:

1. Confirmar documentação oficial ou código já existente.
2. Criar adapter/provider isolado.
3. Definir timeout.
4. Definir retry/backoff quando seguro.
5. Definir idempotency key quando aplicável.
6. Logar requestId/externalId sem vazar segredo.
7. Nunca logar token, key, secret, cookie ou payload sensível.
8. Tratar rate limit.
9. Tratar indisponibilidade.
10. Criar teste com mock explícito do provider.

Falha externa deve gerar estado honesto, nunca fallback falso.

---

## REGRA DE WHATSAPP / AUTOPILOT

WhatsApp é core business. Qualquer alteração deve preservar:

1. Sessão por workspace/usuário, nunca global indevida.
2. Separação clara entre WAHA e Meta Cloud API.
3. QR/status/session lifecycle real.
4. Nenhum envio duplicado.
5. Idempotência em mensagens recebidas.
6. Rate limit e backoff.
7. Logs de messageId/conversationId sem expor conteúdo sensível desnecessário.
8. Botão "parar"/handoff humano respeitado.
9. Autopilot nunca responde se workspace/produto/config estiver inconsistente.
10. Fallback honesto quando IA/provedor estiver indisponível.

A IA comercial deve usar dados reais de produto, pedido, cliente, workspace e
conversa. Não responder com produto inventado.

---

## REGRA DE PAGAMENTOS / STRIPE / MARKETPLACE

Pagamentos são superfície de risco máximo.

Qualquer alteração em checkout, wallet, ledger, payout, split, billing, KYC,
Connect, refund, chargeback ou invoice exige:

1. Ler ADR e plano Stripe antes.
2. Usar centavos em `bigint`.
3. Nunca usar float para dinheiro.
4. Nunca atualizar ledger histórico; corrigir com entry compensatória.
5. Webhook idempotente.
6. External IDs únicos.
7. Teste cobrindo duplicidade/replay.
8. Teste cobrindo falha parcial.
9. Sem fallback para link fake.
10. Sem "success" visual antes de confirmação real.

Se uma capability Stripe não estiver habilitada, lançar erro real de
configuração ou mostrar setup-required.

---

## REGRA DE SEGREDOS

Nunca imprimir, commitar, copiar para relatório ou expor:

- API keys;
- tokens;
- cookies;
- JWTs;
- refresh tokens;
- Stripe secret/live keys;
- Railway/Vercel tokens;
- database URLs;
- webhook secrets;
- session tokens;
- private keys.

Se encontrar segredo versionado:

1. Parar.
2. Reportar o arquivo e tipo de segredo sem revelar valor.
3. Recomendar rotação.
4. Remover do código apenas se a alteração não violar arquivo protegido.
5. Nunca repetir o segredo no output.

---

## REGRA DE MCP / TOOLS

MCPs e tools aumentam capacidade, mas não devem quebrar segurança.

Permitido:

- GitHub read/write no repo quando autorizado.
- Filesystem restrito ao repo.
- Playwright para E2E local/staging.
- PostgreSQL read-only por padrão.
- Context/docs search.
- Browser para documentação oficial.

Proibido por padrão:

- Banco de produção write.
- Shell destrutivo.
- Deploy automático sem autorização.
- Acesso amplo ao filesystem fora do repo.
- Expor secrets via tool output.
- Instalar pacotes globais sem necessidade.
- Rodar scripts desconhecidos de repositórios externos.

Todo MCP deve operar com menor privilégio possível.

---

## REGRA DE COMMITS

Commits devem ser pequenos, reversíveis e verificáveis.

Formato:

- `fix(scope): descrição`
- `feat(scope): descrição`
- `refactor(scope): descrição`
- `test(scope): descrição`
- `docs(scope): descrição`
- `chore(scope): descrição`

Cada commit deve representar uma unidade lógica.

Não misturar:

- refactor + feature grande;
- lint massivo + mudança funcional;
- pagamento + UI cosmética;
- schema + feature sem teste;
- governance + código normal.

Nunca usar `--no-verify`.

---

## REGRA DE ROLLBACK

Toda mudança crítica deve ser reversível.

Antes de alterar módulo crítico, identificar:

1. Arquivos tocados.
2. Comportamento anterior.
3. Como reverter.
4. Que teste detecta regressão.
5. Qual risco se deployar quebrado.

Para pagamentos, auth, KYC, WhatsApp e banco, preferir mudanças aditivas e
compatíveis.

---

## REGRA DE OBSERVABILIDADE

Código de produção precisa ser diagnosticável.

Adicionar logs estruturados em:

- falhas de provider externo;
- webhooks recebidos/processados/falhos;
- jobs BullMQ;
- autenticação suspeita;
- pagamentos;
- WhatsApp session lifecycle;
- autopilot handoff;
- erros inesperados de API.

Logs devem conter contexto útil:

- workspaceId;
- userId quando seguro;
- externalId;
- provider;
- operation;
- status;
- durationMs;
- errorCode.

Logs não devem conter segredo ou payload sensível completo.

---

## REGRA DE QUALIDADE DE IA

Qualquer uso de LLM dentro do KLOEL deve ter:

1. Prompt versionado ou builder central.
2. Entrada baseada em dados reais.
3. Limites de escopo claros.
4. Output validado/parseado quando usado como ação.
5. Guardrail contra inventar produto, preço, prazo ou política.
6. Handoff humano quando baixa confiança.
7. Log de decisão sem expor dados sensíveis.
8. Retry controlado.
9. Fallback honesto.
10. Teste de prompt/contrato quando possível.

LLM não pode ser fonte de verdade para pagamento, pedido, saldo, KYC ou
política financeira.

---

## REGRA DE DOCUMENTAÇÃO VIVA

Quando uma mudança altera comportamento real, atualizar documentação
operacional não protegida aplicável:

- plano de implementação;
- runbook;
- validation log;
- feature matrix;
- ADR novo se decisão arquitetural mudou;
- teste/smoke instructions.

Documentação não pode declarar pronto sem evidência.

---

## REGRA DE "BIG TECH LEVEL"

Para considerar uma área como production-grade, ela precisa ter:

1. Contrato claro.
2. Tipos fortes.
3. Testes relevantes.
4. Segurança básica.
5. Observabilidade.
6. Idempotência onde necessário.
7. Error handling.
8. Performance aceitável.
9. UX honesta.
10. Rollback possível.

Sem esses 10 itens, a área pode estar funcional, mas ainda não é
production-grade.

---

## SESSION START PROTOCOL

At the beginning of every session, Claude Code must silently establish:

If a required fact cannot be established from the local repository/session,
record it as unavailable instead of guessing.

1. Current branch.
2. Git status.
3. Whether protected files are modified.
4. Whether previous work is uncommitted.
5. Active task requested by Daniel.
6. Relevant module in DAG.
7. Risk class.
8. Required validation commands.
9. Files likely to be touched.
10. Stop conditions.

Do not start editing before understanding the blast radius.

If Daniel asks for autonomous work, continue through the loop until a stop
condition is reached.

Stop conditions:

- protected file requires edit;
- production secret required;
- destructive DB operation required;
- live deploy required;
- payment/governance decision lacks ADR;
- tests reveal unrelated major breakage;
- human-owned uncommitted changes would be overwritten.

For detailed operational workflow, read `docs/ai/AGENT_RUNBOOK.md`.

---

## ORDEM DE CONSTRUÇÃO (DAG)

Um módulo só avança quando TODAS as dependências estão a 100%. 100% = PULSE
mostra zero desconexões nesse módulo.

```
FASE 0 — INFRAESTRUTURA
├── Auth (JWT + refresh + Google OAuth — completar Magic Link)
├── Workspaces (validar CRUD completo)
├── Settings (conectar sections ao backend)
└── KYC (validar fluxo end-to-end)

FASE 1 — MOTOR COMERCIAL
├── Products CRUD (plans, URLs, coupons, commissions, AI config)
├── Checkout (produto → plano → pagamento → confirmação via Asaas)
├── Wallet/Carteira (saldo real, transações, saques, antecipações)
└── Billing (assinaturas da plataforma)

FASE 2 — COMUNICAÇÃO
├── WhatsApp Core (WAHA / Meta Cloud → backend → frontend)
├── Inbox (chat real, não localStorage)
├── Autopilot (IA com dados reais)
└── Flows (builder + engine)

FASE 3 — INTELIGÊNCIA
├── CIA / Unified Agent (cognitive state → LLM prompt)
├── CRM (conectar CRMPipelineView às API calls existentes)
├── Dashboard (dados reais agregados)
├── Analytics (queries reais)
└── Reports (hooks useReports conectados)

FASE 4 — CRESCIMENTO
├── Vendas (pipeline, assinaturas, físicos)
├── Affiliate/Partnerships (service layers + frontend)
├── Member Area (service layer + enrollment via checkout)
├── Campaigns (page + controller conectados)
└── FollowUps (validar conexão)

FASE 5 — PLATAFORMA AVANÇADA
├── Marketing (channels reais ou setup honesto)
├── Anúncios (Meta/Google APIs ou setup honesto)
├── Sites/Builder (CRUD + domínios + publicação)
├── Canvas (fabric.js + save/load backend)
├── Funnels (criar backend)
├── Webinários (validar profundidade)
└── Leads Scraper (validar flow)

FASE 6 — OPERACIONAL
├── Team, API Keys, Webhooks, Audit Log
├── Notifications, Marketplace
└── Video/Voice
```

---

## CLASSIFICAÇÃO ATUAL DOS MÓDULOS

### TIER 1 — Funcional

Auth (90%), WhatsApp Core (95%), Autopilot (90%), Flows (90%), Checkout (85%),
Billing (85%), KYC (85%), Inbox (85%), Wallet (80%), Unified Agent (75%), CRM
(80%), Dashboard (75%), Analytics (75%), Reports (75%)

### TIER 2 — Parcialmente Funcional

Products (70%), Partnerships, Member Area, Affiliate, Campaigns

### TIER 3 — Fachada

Anuncios, Marketing, Sites, Vendas, Canvas, Funnels, Webinarios, Leads

### TIER 4 — Shell Vazio

47 rotas com < 15 linhas (stubs de redirect)

---

## PADRÕES DE ROBUSTEZ

Todo módulo que lida com dinheiro, dados de usuário, ou integração externa:

- **DTOs com class-validator** no NestJS
- **Workspace isolation** — toda query filtra por workspaceId
- **Transações** — operações multi-tabela usam `prisma.$transaction`
- **Idempotência** — endpoints de pagamento/webhook aceitam replay sem duplicar
- **Retries com backoff** — chamadas a Asaas, Meta, Google
- **Timeouts explícitos** — toda chamada externa
- **Audit trail** — operações financeiras logadas no AuditLog
- **Rate limiting** — endpoints públicos
- **Error states honestos** — frontend mostra erro real
- **Logs estruturados** — Logger do NestJS com context

---

## SPEC — QUANDO UM MÓDULO ESTÁ "PRONTO"

1. Zero pages stub (toda rota > 50 linhas de lógica real)
2. Zero hardcoded data (nenhum Math.random/array literal exibindo dados)
3. Zero dead handlers (todo botão chama API real)
4. Zero dead API calls (toda chamada tem endpoint real)
5. Zero empty returns (backend retorna dados Prisma, não `[]`)
6. Service layer existe (controllers não fazem Prisma direto)
7. prismaAny → prisma tipado (models migrados)
8. Shell preservada (UX coerente com contrato original)
9. Estados honestos (setup/gate onde falta integração)
10. PULSE health = 100% para esse módulo

---

## REGRA DE AUTO-CORRECAO DO PULSE

Cada false positive ou ponto cego do PULSE que for encontrado → **corrigir o
PULSE imediatamente** para nunca mais errar naquele tipo. O PULSE nao e um
scanner estatico — ele evolui a cada erro descoberto. Se o PULSE disse que algo
estava quebrado e nao estava → fix no parser. Se o PULSE nao viu algo que
deveria ter visto → fix no detector. Zero tolerancia para erros repetidos.

---

## FERRAMENTAS

### PULSE (Sistema Nervoso)

- `npx ts-node --project scripts/pulse/tsconfig.json scripts/pulse/index.ts` —
  scan unico
- `npx ts-node scripts/pulse/index.ts --watch` — daemon vivo
- `npx ts-node scripts/pulse/index.ts --report` — gera PULSE_REPORT.md

### Artefatos de Controle

- `AUDIT_FEATURE_MATRIX.md` — estado de cada rota
  (READY/PARTIAL/SHELL_ONLY/MOCKED/BROKEN)
- `VALIDATION_LOG.md` — evidência de cada validação
- `SHELL_PRESERVATION_NOTES.md` — o que mudou visualmente e porquê
- `PULSE_REPORT.md` — output do scanner

### Segredos Locais de Operação

- Antes de inspecionar Railway/Vercel/runtime real, verificar `.env.pulse.local`
  na raiz do repo.
- Esse arquivo é **local e gitignored**. Pode conter tokens e endpoints de
  inspeção para PULSE e agentes.
- Nunca imprimir os valores em respostas. Usar apenas em memória para queries,
  logs e diagnósticos.

### Hooks de Disciplina

- Após editar frontend → `cd frontend && npm run lint && npm run build`
- Após editar backend → `cd backend && npm run lint && npm run build`
- Após editar schema → `npx prisma generate && npx prisma validate`
- Não declarar conclusão com erros de build não documentados
- Antes de push → `npm run guard:db-push && npm run typecheck && npm test`
- Nunca reintroduzir `prisma db push` em scripts de produção, CI, Docker ou
  automação

### Enforcement Local

- Husky + lint-staged + commitlint são parte do contrato do repo
- `.claude/settings.json` deve continuar com hooks de `PreToolUse`,
  `PostToolUse` e `Stop`
- `.editorconfig` e `.prettierrc.json` são a fonte única de formatação do
  monorepo

## ARQUIVOS PROTEGIDOS — SOMENTE O DONO DO REPOSITORIO PODE EDITAR

Os seguintes arquivos e diretorios sao infraestrutura de qualidade e governanca.
Nenhuma IA CLI tem permissao de editar, deletar, mover ou renomear estes
arquivos. Se uma regra precisa mudar, a IA deve pedir ao dono do repositorio
para fazer a mudanca.

Arquivos protegidos:

- `CLAUDE.md`
- `AGENTS.md`
- `docs/design/KLOEL_VISUAL_DESIGN_CONTRACT.md`
- `docs/design/KLOEL_ANTI_HARDCODE_CONTRACT.md`
- `ops/*.json`
- `ops/kloel-design-tokens.json`
- `scripts/ops/check-*.mjs`
- `scripts/ops/lib/*.mjs`
- `.husky/pre-push`
- `.github/workflows/ci-cd.yml`
- `backend/eslint.config.mjs`
- `frontend/eslint.config.mjs`
- `worker/eslint.config.mjs`
- `backend/src/lib/ai-models.ts`

Qualquer tentativa de editar estes arquivos para contornar uma validacao e
considerada gambiarra e sera revertida.

### GitHub Hardening

- `CI`, `CodeQL`, `Deploy Staging`, `Deploy Production` e `Nightly Ops Audit`
  são guardrails obrigatórios
- `Dependabot` deve permanecer ativo para root, backend, frontend, worker, e2e e
  GitHub Actions
- Settings manuais obrigatórias vivem em `docs/GITHUB_REPOSITORY_SETTINGS.md`

---

## CICLO DE EXECUÇÃO

```
1. Rodar PULSE (ou consultar último PULSE_REPORT.md)
2. Escolher próximo módulo respeitando o DAG acima
3. Preservar a casca visual existente
4. Conectar motor real por trás da shell
5. Rodar testes (lint + build + unit + smoke)
6. Rodar PULSE de novo
7. Atualizar artefatos de controle
8. Confirmar zero regressões visuais
9. Próximo módulo
```

---

## ANTI-PATTERNS (NÃO FAZER)

- NÃO criar dados fake para "completar" a UI — usar empty state
- NÃO usar `prismaAny` em código novo — sempre usar Prisma tipado
- NÃO usar `localStorage` para dados de negócio
- NÃO usar `Math.random()` para dados exibidos ao usuário
- NÃO usar `console.log` como corpo de event handler
- NÃO pular fases do DAG — se Products não está 100%, não iniciar Affiliate
- NÃO destruir shell existente para reconstruir — refatorar por baixo
- NÃO marcar nada como pronto sem evidência (PULSE clean + testes passando)

---

## NOTAS TÉCNICAS ESPECÍFICAS

### prismaAny

O codebase tem 133 usos de `this.prismaAny.` (bypass de tipos). Funciona mas é
frágil. Em código novo, SEMPRE usar `this.prisma.` tipado. Migrar `prismaAny`
progressivamente.

### Proxy Routes (Next.js → Backend)

Frontend calls a `/api/whatsapp-api/*`, `/api/auth/*`, `/api/kyc/*`,
`/api/workspace/*` passam por route handlers Next.js que fazem proxy pro
backend. O PULSE sabe resolver essas rotas.

### API Layer

Toda chamada API do frontend usa `apiFetch()` de `frontend/src/lib/api/core.ts`.
19 módulos de API em `frontend/src/lib/api/`. SWR hooks usam `swrFetcher` que
wrapa `apiFetch`.

### Design Tokens

Importar de `@/lib/design-tokens`: `colors`, `motion`, `radius`, `spacing`. Usar
`colors.ember.primary` (#E85D30) para accent, `colors.text.silver` para texto.
Toggle components em `frontend/src/components/kloel/Forms.tsx`.

---

## SEGURANCA (implementado)

### Webhook Verification

- Stripe: header `stripe-signature` validado contra `STRIPE_WEBHOOK_SECRET` em
  `backend/src/webhooks/payment-webhook.controller.ts`
- Webhooks sem assinatura valida: rejeitados com 400/403

### Idempotencia

- Checkout webhooks verificam `externalId` antes de processar — duplicatas
  ignoradas
- Stripe webhooks verificam evento/intent e ignoram duplicatas

### Rate Limiting

- `@nestjs/throttler` global: 100 req/min
- Auth login: 5 req/min por IP
- Webhook endpoints: 200 req/min

### Wallet Protection

- Saque usa `$transaction` com verificacao de saldo atomica
- Race condition de saque duplo: protegido

### WebhookEvent Model

- Audit trail para todos os webhooks recebidos
- `@@unique([provider, externalId])` previne duplicatas
- Status tracking: received → processed / failed

### ENV VARS necessarias para producao

- `STRIPE_WEBHOOK_SECRET` — secret de verificacao do webhook Stripe

---

## STRIPE PAYMENT BASELINE

> **Decisão arquitetural ativa**. Autorizada pelo dono do repo em 2026-04-17.
> ADR fundador:
> [docs/adr/0003-stripe-connect-platform-model.md](docs/adr/0003-stripe-connect-platform-model.md).
> **Plano executável (ler antes de tocar qualquer código de pagamento)**:
> [docs/plans/STRIPE_MIGRATION_PLAN.md](docs/plans/STRIPE_MIGRATION_PLAN.md).

KLOEL adota **Stripe Connect Platform Model** como única infraestrutura ativa de
pagamento. O cutover para Stripe-only está concluído no runtime ativo; qualquer
evolução nova deve partir dessa base única.

**Não-negociáveis** (qualquer agente que tocar este código):

- Centavos em `bigint`. Nunca `number` para dinheiro.
- Coverage ≥ 95% em SplitEngine, LedgerEngine, FraudEngine.
- Idempotência em todo webhook handler.
- Audit trail em LedgerEntry (sem UPDATE).
- Casca de UX preservada — só o motor por baixo é trocado.
- `sk_test_*` em dev, `sk_live_*` apenas em produção via Railway secret.
- ADR-driven: desvios exigem novo ADR. Sem improviso.

**Próximas camadas** (ver plano para direção atual):

```
1. SplitEngine
2. LedgerEngine
3. Connect onboarding
4. Wallet prepaid
5. FraudEngine
6. Payment Kernel multi-stakeholder
```

**Bloqueios conhecidos** (manter sincronizado com
`docs/plans/STRIPE_MIGRATION_PLAN.md`):

- PIX capability na conta Stripe live — Daniel precisa solicitar via dashboard.
- Webhook endpoint live em produção — criar via dashboard ou API após FASE 0.
