# Kloel · Novo Chat — camada de raciocínio real + unificação

> Missão (Daniel, 2026-06-04): destilar TODAS as superfícies de chat-com-Kloel em UMA
> só ("Kloel · Novo Chat", unificada backend+frontend), e substituir o balão de
> raciocínio falso por uma **camada de pré-resposta executável real** — alimentada por
> eventos reais do modelo/agente, premium e tematizada Kloel (Sora + void/ember,
> theme-aware), sem nenhuma string de raciocínio hardcoded, sem typewriter sobre texto
> constante, sem delay artificial. Ferramentas: Chrome DevTools MCP (validar no produto)
> + Atomic MCP (toda edição). Execução autônoma e contínua.

## Mapa autoritativo (recon de 6 agentes — fatos, não suposição)

- **Superfície canônica = `/chat` → `KloelDashboard`** ("Conversar com o Kloel").
  Shell `MainAppLayoutShell` (+ `KloelGraphShell` via flag `KLOEL_GRAPH_ENABLED`).
- **Mortos/legados nunca montados (deletar):** `components/kloel/home/HomeScreen.tsx`,
  `components/kloel/chat-container.tsx` + toda a árvore `chat-container.*`,
  `useChatController*`, `AgentCursor.tsx` (componente; só o tipo é reutilizado).
- **Entradas reais a rotear pelo contrato/componente único:** landing
  `components/kloel/landing/FloatingChat.tsx` (guest), `app/(public)/onboarding-chat/*`.
- **Provedor:** DeepSeek (OpenAI-SDK-compatível) com thinking LIGADO
  (`openai-wrapper.ts:251`); reasoning REAL é produzido porém **descartado**
  (`kloel-stream-writer.ts:280` lê só `delta.content`; `openai-wrapper.ts:243` e
  `kloel-reply-engine.helpers.ts:422` DELETAM `reasoning_content`). Anthropic = só health.
- **Tema "MONITOR":** void-black + ember, **Sora em tudo** (sem serifa), via `--app-*` /
  `KLOEL_THEME` (atalhos `EMBER/V/TEXT/MUTED/SURFACE/DIVIDER` em
  `KloelDashboard.subcomponents.tsx`). Default LIGHT (`readInitialKloelTheme()→'light'`)
  ⇒ a timeline TEM que ser theme-aware (não hardcodar void). Raio 6px, motion 150ms, flat.

### A facade a matar (provada, file:line)
- `AssistantResponseChrome.tsx:79-99,268-298` — `buildTraceConceptLabels`/`conceptLabels`
  (chips de buzzword fixos: 'Reasoning summary','Agent trace','CoT privado',
  'ReAct trajectory','Tool/function calling','Traces + spans').
- `kloel-message-ui.ts:430,445` — todo tool_call/tool_result vira label constante
  (descarta `entry.tool`, `durationMs`, `artifactId`).
- backend `kloel-stream-events.ts:154-168` — `createKloelPublicThinkingLabel/StreamingLabel`
  (rótulo sintetizado da msg do usuário, não tokens reais).
- `KloelDashboardSendMessage.ts:100,189` — `minimumThinkingMs=420` + typewriter 20ms sobre
  texto já recebido (delay artificial + token-a-token cosmético).
- landing `FloatingChat.tsx:36-45` — `THINKING_LABELS=['Pensando','Analisando','Raciocinando']`
  rotativos (2.5s) = teatro puro.
- home `useKloelChat.ts:31` / `useKloelSendMessage.ts:61-62` — `'Analisando...'` fixo +
  `thinkDuration=800-2000ms` artificial + `useTypingSimulation` (typewriter sobre constante).
- onboarding `OnboardingChatMessageList.tsx:159,171` — 'kloel está pensando...' estático.

## Contrato normalizado (SSE) — eventos
Existentes: `thread | status(phase) | content(delta) | tool_call | tool_result | error | done`.
Adicionados (P1): `reasoning_summary{text} | reasoning_delta{text} | reasoning_done{durationMs} | file{name,meta,url,downloadUrl}`.

## Fases (cada uma shippável + verificada: typecheck/tests/Chrome)

- [x] **P1 — Contrato normalizado.** backend+frontend `kloel-stream-events.ts`: tipos +
  factories + parser dos 4 eventos novos (aditivo). VERIFY: typecheck verde.
- [ ] **P2 — Backend encaminha raciocínio real.**
  - `kloel-stream-writer.ts` (~280): no for-await ler `delta.reasoning_content`;
    emitir `reasoning_delta` enquanto chega; ao 1º `delta.content` emitir
    `reasoning_done{durationMs medido}`. Substituir o `status('thinking', label sintetizado)`.
  - `openai-wrapper.ts:241-247` / `kloel-reply-engine.helpers.ts:416-424`: CAPTURAR o
    reasoning ANTES de deletar (manter a deleção só no histórico de saída).
  - brain não-streaming (`kloel-thinker-think.helpers.ts:428`) + guest
    (`guest-chat.chat.helpers.ts:171`): ler `message.reasoning_content` → `reasoning_summary`.
  - composer (`runComposerCapabilityBranch`): emitir `file` para artefatos gerados.
  - Fallback honesto: sem reasoning_content ⇒ NÃO renderiza bloco de raciocínio.
- [ ] **P3 — `ReasoningTimeline` premium theme-aware** (porta exemplo + `AgentTimeline.tsx`).
  Header colapsável (summary real), trilho vertical + relógio, pensamento token-a-token
  (reasoning_delta), chips de tool reais (`entry.tool`), `durationMs`, "Concluído", file-card.
  Plugar em `KloelDashboard.message.tsx:442-479` (preservar wrapper/markdown/caret/navigator).
  Acumular reasoning no metadata (estender `kloel-message-ui.ts`). DELETAR `conceptLabels` +
  labels genéricos. Atualizar `KloelDashboardView.test.tsx`.
- [ ] **P4 — Unificação.** Deletar `chat-container.*`+`HomeScreen`+`useChatController*`+
  `AgentCursor.tsx`+`useKloelChat/useKloelSendMessage/useTypingSimulation`. Rotear
  `FloatingChat`(guest) e `onboarding-chat` pelo contrato/componente único (modos
  `guest`/`onboarding`); matar `THINKING_LABELS`, `'Analisando...'`, typewriter, delays.
  Respeitar gates `check-canonical-events.mjs` / `check-canonical-duplicates.mjs`.
- [ ] **P5 — Gates anti-facade + Chrome E2E + relatório 17 pontos.**
  Grep gates (zero string de raciocínio no componente; zero rotação/typewriter-constante/delay).
  Chrome: msg simples (sem tool ⇒ bloco mínimo/ausente honesto), msg com tool (chips reais),
  msg que gera arquivo (file-card). Login passwordless via magic-link em dev.

## Verificação no produto (Chrome DevTools MCP)
frontend `next dev :3000`, backend NestJS :3001, subdomínios `auth./app.root.localhost`.
Login dev sem senha: `POST localhost:3001/auth/magic-link/request {email,redirectTo}` →
resposta JSON traz `magicLinkUrl` (dev) → navegar. Conta seed: `admin+e2e@example.com`.

## Status
P1 concluído via Atomic (4 eventos no contrato, backend+frontend). Próximo: P2.
