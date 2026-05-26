# ADR 0012: Kloel OmniCore — channel unification under marketing umbrella

Data: 2026-05-26

## Status

Aceita.

## Contexto

O Kloel é uma plataforma omnichannel de marketing e vendas. O codebase
cresceu organicamente acumulando duas pastas de domínio com responsabilidades
sobrepostas:

- `backend/src/whatsapp/` — 91 arquivos, 23 services, 5 controllers, 2 eventos.
  Acolhe duas implementações de provider WhatsApp (`WahaProvider`,
  `WhatsAppApiProvider` que é Meta Cloud), session lifecycle, dispatcher,
  reconciler, catchup, watchdog.
- `backend/src/marketing/` — 45 arquivos, 17 services, 10 controllers,
  3 eventos. Acolhe Instagram (Meta), Facebook Messenger (Meta), Email
  (Gmail/IMAP/Microsoft), TikTok, mailbox OAuth flows, e o
  `marketing-connect/` que já tem `MetaConnectService` e `ChannelSetupService`.
- `backend/src/meta/` — Instagram, Messenger, Meta Ads, `MetaWhatsAppService`
  (Cloud API canonical entry), `MetaConnectionStateService`.

Existem também 5 ChannelTransport providers em
`backend/src/kloel/channel-transport.providers.ts` (`WhatsAppChannelTransport`,
`InstagramChannelTransport`, `MessengerChannelTransport`, `EmailChannelTransport`,
`TikTokChannelTransport`) que já implementam a abstração transport — mas vivem
sob `kloel/` em vez de `marketing/` ou `common/`.

A diretiva do dono do repo é explícita: **WhatsApp não é um domínio top-level;
é um canal de marketing**. Como Instagram, Facebook, Email e TikTok já estão
sob `marketing/`, WhatsApp deve seguir a mesma topologia para que
"OmniCore" — o motor de marketing omnichannel — fale uma única língua.

O resultado atual contraria essa diretiva:

1. `backend/src/whatsapp/` está como domínio de primeira classe, paralelo a
   `marketing/`, em vez de submódulo.
2. `MetaWhatsAppService` mora em `meta/` enquanto `WhatsAppApiProvider`
   (mesmo provedor, Meta Cloud API) mora em `whatsapp/providers/`.
3. `WhatsAppChannelTransport` mora em `kloel/` enquanto os outros transports
   moram lá também — mas a abstração `ChannelDispatchPort` em
   `backend/src/common/channel-dispatch/` é a fronteira canônica.
4. Há 44 call sites de `sendMessage`-equivalente catalogados em
   `docs/architecture/CHANNEL_DISPATCH_CANONICAL.md`, e o registry
   `ChannelDispatchRegistry` está pronto para virar o ponto único de
   despacho — só falta amarrar.

## Decisão

### 1. Reordenação de domínio (movimentação por etapas)

A topologia canônica futura:

```
backend/src/marketing/                  ← OmniCore umbrella
├── channels/                           ← (NOVO) sub-domínio por canal
│   ├── whatsapp/                       ← (de backend/src/whatsapp/)
│   │   ├── providers/
│   │   │   ├── meta-cloud/             ← ex-WhatsAppApiProvider
│   │   │   └── waha/                   ← ex-WahaProvider (legacy)
│   │   ├── whatsapp.service.ts
│   │   ├── whatsapp-message-dispatcher.service.ts
│   │   ├── whatsapp-session.service.ts
│   │   ├── inbound-processor.service.ts
│   │   └── …
│   ├── instagram/                      ← (de backend/src/meta/instagram/)
│   ├── messenger/                      ← (de backend/src/meta/messenger/)
│   ├── facebook/                       ← (de backend/src/marketing/facebook-*)
│   ├── email/                          ← (de backend/src/marketing/mailbox-*)
│   │   ├── gmail-oauth/
│   │   ├── imap-smtp/
│   │   └── microsoft-oauth/
│   ├── tiktok/                         ← (de backend/src/marketing/tiktok-*)
│   └── shared/                         ← ChannelDispatchPort, registry, transport types
├── marketing-connect/                  ← onboarding canônico (já existe)
├── campaigns/                          ← (preserva atual)
├── instagram-marketing.service.ts      ← stays até cutover de channels/
└── …
```

`backend/src/whatsapp/` torna-se **deprecated alias folder**: cada arquivo
exporta um re-export `@deprecated` que aponta para o novo path em
`marketing/channels/whatsapp/`. Após uma janela de 2 semanas com dual-path
estável, a pasta é deletada num único commit.

### 2. Ponto canônico único de despacho

`ChannelDispatchRegistry.send(ChannelSendInput)` em
`backend/src/common/channel-dispatch/channel-dispatch.registry.ts` é o
**único entry point público** para envio de mensagem em todos os canais.

Adapters por canal (já mapeados em `CHANNEL_DISPATCH_CANONICAL.md` §
"Migration Order"):

- `WhatsAppDispatchAdapter` — wraps `WhatsAppMessageDispatcher.sendMessage`,
  internamente seleciona Meta Cloud ou WAHA por config de workspace.
- `InstagramDispatchAdapter` — wraps `InstagramService.sendMessage`.
- `MessengerDispatchAdapter` — wraps `MessengerService.sendTextMessage`.
- `FacebookDispatchAdapter` — wraps `FacebookMessengerService.sendMessage`.
- `EmailDispatchAdapter` — dispatch Gmail/IMAP/Microsoft por connection type.
- `InternalPartnershipDispatchAdapter` — wraps `partnerships.chat.helpers`.
- `InternalAdminDispatchAdapter` — wraps `AdminChatService.sendMessage`.

Todos via NestJS multi-provider injection.

### 3. Ponto canônico único de onboarding de canal

`backend/src/marketing/marketing-connect/channel-setup.service.ts`
+ `meta-connect.service.ts` se unificam sob um único serviço
`ChannelOnboardingService` exposto pelo módulo `MarketingConnectModule`.

`backend/src/whatsapp/whatsapp-session.service.ts` torna-se um adapter
chamado pelo `ChannelOnboardingService` no caso WhatsApp/WAHA.
`backend/src/meta/meta-connection-state.service.ts` segue o mesmo padrão
para canais Meta.

(Detalhes per-channel em `docs/architecture/CONNECT_CHANNEL_CANONICAL.md` —
gerado por PI-B nesta wave.)

### 4. Capacidades **mantidas** durante a migração

Nenhuma capacidade do código atual é deletada por motivo cosmético.
Mantém-se obrigatoriamente:

- WAHA provider (multi-tenant WhatsApp sem Meta Cloud).
- Meta Cloud provider (oficial).
- Catchup, reconciler, watchdog, watchdog-recovery, send-rate-guard —
  toda a infra de proteção de sessão.
- Lifecycle eventos `whatsapp.session.*`, `whatsapp.message.*` —
  passam a se chamar `channel.whatsapp.session.*` e `channel.whatsapp.message.*`
  com aliases retroativos publicados em paralelo por 4 semanas.
- Idempotência, throttling, rate guard — TODOS preservados.

### 5. Capacidades **diluídas**

Funções/services WhatsApp que existem apenas porque o canal estava como
domínio top-level e duplicam infra genérica:

| Em `whatsapp/` | Diluído em |
|---|---|
| `whatsapp-normalization.util.ts` (`normalizePhone`, etc.) | `common/phone/phone-normalization.util.ts` (canônico cross-channel) |
| `WhatsappService` (fachada generalista) | `MarketingChannelService` (fachada cross-channel) |
| `provider-registry-*.ts` | `channel-dispatch.registry.ts` (canonical já existe) |
| `WorkerRuntimeService` (em whatsapp/) | `marketing/channels/whatsapp/worker-runtime.service.ts` (sem mudança lógica, só movimentação) |

### 6. Capacidades **deletadas** (apenas após prova de não-uso)

Removidas só com `0 callers` verificados via grep + codegraph cross-check:

- Re-exports redundantes em `whatsapp/providers/provider-send-message.helpers.ts`
  e `provider-registry-messaging.ts` (cobertos pelo dispatcher canônico).
- DTOs duplicados que repetem shapes de `ChannelSendInput`.
- Tipos `SessionStatus` triplicados em
  `whatsapp/providers/{provider-registry.types,waha-types,whatsapp-api.provider.types}.ts`
  → consolidar em um único type em `marketing/channels/whatsapp/types.ts`.

## Não-decisões (escopo fora deste ADR)

- Schema Prisma: `RAC_FbMessage`, `RAC_PartnerMessage`, `RAC_Message`,
  `RAC_KloelMessage`, `RAC_ChatMessage` — a unificação em um modelo
  canônico `ChannelMessage` é trabalho de ADR separado (a ser escrito
  como ADR-0014) com plano de dual-write + migração de dados. **Este ADR
  não autoriza drop de tabelas.**
- Worker runtime: `worker/whatsapp-engine.ts`, `worker/unified-whatsapp-provider.ts`,
  `worker/whatsapp-api-provider.ts`, `worker/auto-provider.ts` — alinhados
  com o backend em ondas posteriores (Phase 3 do
  `CHANNEL_DISPATCH_CANONICAL.md`).
- Frontend (`frontend/src/components/kloel/marketing/`, 205 arquivos): a
  reorganização da UI segue ondas próprias. Componentes
  `OfficialMarketingChannelPage`, `ChannelOnboarding`, `MarketingShared`
  continuam intocados.

## Plano de migração (ondas reversíveis)

| Wave | Escopo | Reversibilidade |
|------|--------|-----------------|
| W1 — adapters | Criar 7 `*DispatchAdapter` envolvendo APIs existentes; zero behavior change. Wire `ChannelDispatchRegistry` via DI. | Reverter = remover adapters; APIs antigas seguem funcionando intactas. |
| W2 — delegação interna | Cada `WhatsAppService.sendMessage` / `InstagramService.sendMessage` / etc. delega internamente ao registry. APIs públicas inalteradas. | Reverter = restaurar implementação direta. |
| W3 — movimentação física | Mover `backend/src/whatsapp/` → `backend/src/marketing/channels/whatsapp/`. Cada arquivo na pasta antiga vira `export * from '...'` deprecated com banner JSDoc. | Reverter = restaurar pasta + apagar re-exports. |
| W4 — limpeza de aliases | Deletar pasta `backend/src/whatsapp/` depois de 2 semanas de prod sem callers do path antigo (verificado por `check-canonical-imports.mjs` gate). | Não-reversível por código, reversível por revert do commit. |
| W5 — capacidades cross-channel | `MarketingChannelService` (fachada), `ChannelOnboardingService` (onboarding canônico). | Adições aditivas. |

## Consequências

**Positivas:**

- Domínio único `marketing/channels/<canal>/` deduplica WhatsApp/Email/Meta.
- `ChannelDispatchRegistry` substitui 44 call sites espalhados.
- Onboarding canônico colapsa 7 implementações de "connect channel".
- 256 cross-file duplicates do `DUPLICATION_REGISTER.md` reduzidos
  significativamente (a contagem exata será reauditada após Wave W3).
- Frontend e worker têm um único nome canônico para se conectar a cada canal.

**Negativas / riscos:**

- 91 arquivos para mover (W3) com PR único enorme. Mitigação: dividir em
  PRs por sub-grupo (providers/, services/, dispatcher, session, catchup,
  watchdog) e validar TS compile per-PR.
- 44 call sites de send espalhados: cada um precisa pass-through validado.
  Mitigação: spec por adapter + integration spec do registry.
- WAHA legacy precisa coexistir com Meta Cloud por janela longa.
  Mitigação: `ChannelDispatchRegistry` resolve provider por config de
  workspace, não por hard-coded path.

## Anti-decisões (governance — o que ESTE ADR proíbe)

- **Não** deletar `backend/src/whatsapp/` num único commit sem passar por
  Wave W3 (deprecation alias) + Wave W4 (verified empty).
- **Não** dropar tabelas Prisma `RAC_*Message` neste ADR — exige ADR-0014.
- **Não** alterar contrato externo (rotas REST, eventos, schemas públicos)
  sem update simultâneo de OpenAPI/AsyncAPI e PRs cross-cutting.
- **Não** desabilitar gates Codacy/seatbelt/ratchet para deixar a migração
  passar. Se um gate fecha, ou a migração se ajusta ou o gate é
  re-examinado em ADR próprio.

## Gates de progresso (mensuráveis)

| Gate | Métrica | Como medir |
|------|---------|------------|
| W1 done | 7 adapters injetados | `ChannelDispatchRegistry.list()` retorna 7 ChannelKinds |
| W2 done | 0 callers diretos de `WhatsAppService.sendMessage` fora do dispatcher | grep + codegraph cross |
| W3 done | `backend/src/whatsapp/**` é puramente re-export | scripts/ops/check-canonical-imports.mjs |
| W4 done | `backend/src/whatsapp/` ausente | filesystem |
| W5 done | 1 service de onboarding cross-channel | codegraph search `ChannelOnboardingService` |

## Referências

- `docs/architecture/CHANNEL_DISPATCH_CANONICAL.md` — inventário detalhado dos 44 sites.
- `docs/architecture/CANONICAL_DOMAINS.md` — contagens atuais por domínio.
- `docs/architecture/DUPLICATION_REGISTER.md` — 256 cross-file dups.
- `docs/adr/0001-whatsapp-source-of-truth.md` — WAHA vs Meta Cloud SOT (pré-existente).
- PI-A output: `docs/architecture/SEND_MESSAGE_CANONICAL.md` (gerado nesta wave).
- PI-B output: `docs/architecture/CONNECT_CHANNEL_CANONICAL.md` (gerado nesta wave).
