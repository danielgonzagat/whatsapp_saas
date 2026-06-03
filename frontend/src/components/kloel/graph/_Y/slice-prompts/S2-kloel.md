# SLICE S2 — Galaxy Kloel (IA central / sun-kloel) (PARALLEL after S0)

## Escopo
Carve the Kloel domain unit; swap exactly ONE client call (`KloelChatScreen.send()`
`api.anthropic` → real SSE stream); feed two builder loops (conversations/images)
from a real adapter, honest-empty. Every Kloel screen except the brand glyph stays
verbatim.

## Arquivos (writes — DISJOINT)
- `domains/kloel/KloelKloelDomain.module.tsx` (KLOEL_ACTIONS, buildKloelNodesEdges@898,
  buildKloelSearchIndex@5904, KloelOverlay@5793, KloelChatScreen@5817, KloelSearchScreen@5928,
  KloelImagesScreen@5988, KloelRecentsScreen@6038, KloelMassPanel@6085, KloelOverlayRouter@6074,
  KloelMushroom@5585)
- `domains/kloel/kloel-domain.data-adapter.ts` (streamAuthenticatedKloelMessage +
  searchKloelThreads/loadKloelThreadMessages + uploadChatFile → {conversations[],images[]};
  loading/empty/error → zero entity nodes)
- `domains/kloel/screens.ts` (SCREEN_BY_TYPE: kloelAction/kloelConversation/kloelImageAsset)

## Reads-only
`lib/kloel-conversations.ts` (`streamAuthenticatedKloelMessage:147`), `lib/api/kloel.ts`
(`uploadChatFile:121`), `KloelBrand.tsx`, `UniversalComposer.tsx`, `CommandPalette.tsx`,
`chat-container.message-sender.ts:247`, `dashboard/KloelDashboardSendMessage.ts:229`.

## Node → data
`buildKloelNodesEdges@898`: 4 `kloelAction` ALWAYS render (nav). Only `kloelConversation`
loop@904 + `kloelImageAsset` loop@909 are data-driven → adapter; honest-empty → [].

## Overlay → component (CRITICAL swap)
`KloelChatScreen.send()@5827-5853`: DELETE `fetch('https://api.anthropic.com/...')`
block@5841-5846 → `streamAuthenticatedKloelMessage(messages,{conversationId:id},onEvent,
{signal})` (POST `/kloel/think` SSE). Accumulate `KloelStreamEvent` tokens into existing
`setKloel` append; keep greeting/composer/loading visuals byte-identical; keep
catch→honest-error@5850. NEVER a 3rd-party LLM call from the client.

## PROTOCOLO POR FATIA
1. `task_lock_acquire` on `domains/kloel/*`.
2. Carve module; swap `send()` motor; feed builder loops from adapter.
3. honest-empty: no history → 4 action nodes + empty Recents/Images.
4. Smoke: devtools shows NO call to `api.anthropic.com`; message round-trips `/kloel/think`.
5. Byte-identity gate + tsc/eslint/vitest.
6. Brand glyph swap (KloelMushroom→KloelMushroomVisual) ONLY if pixel-identical.
7. release + small commit.

## Stop conditions
SSE endpoint contract diverges · image LIST endpoint unconfirmed (render honest-empty,
do not block) · DECISÃO unresolved.

---
@import _PLAYBOOK.md
