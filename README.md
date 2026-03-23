# KLOEL WhatsApp SaaS

Browser-first WhatsApp operation for Kloel. The repository now centers the product around a real WhatsApp Web browser runtime owned by the worker, with the frontend acting as an operator console and the backend orchestrating business flows.

## Estado atual

The codebase already ships these browser-first capabilities:

- `whatsapp-web-agent` provider integrated across backend and worker
- persistent Chromium session per workspace
- QR code from the real WhatsApp Web page
- live browser viewer with human takeover actions
- continuous observer loop for browser-driven inbound detection
- text and media outbound through the browser runtime
- proofs and Redis checkpoints for runtime state
- OpenAI-first computer-use orchestration with Anthropic fallback
- idle/active observer modes to reduce multimodal cost
- stream-ready desktop UX in the main chat surface

The most important architectural change is this:

- WhatsApp Web Browser is the operational source of truth
- WAHA is legacy and should not be the main production path anymore
- the worker owns the browser session
- the frontend is expected to show the actual browser, not a mocked WhatsApp UI

## Estado final alvo

The target system is a complete browser-first commercial agent:

- official WhatsApp Web QR inside Kloel
- live desktop stream of the agent browser
- full operator visibility into what the agent sees and does
- human takeover at any moment
- activity timeline and proofs tied to browser reality
- visual catchup, replay, and recovery without WAHA dependency
- durable proofs and checkpoints

## Arquitetura

```text
Frontend (Next.js / Vercel)
  -> main chat UI
  -> Agent Desktop Viewer
  -> WebSocket screencast consumer
  -> takeover / pause / reconcile controls

Backend (NestJS / Railway)
  -> business orchestration
  -> provider registry
  -> browser-runtime bridge to worker
  -> webhook / inbound / CRM / billing / auth

Worker (BullMQ + Puppeteer)
  -> owns Chromium and WhatsApp Web sessions
  -> observer loop
  -> computer-use orchestrator
  -> proofs + checkpoints
  -> CDP screencast WebSocket server
  -> disk audit artifacts per workspace

Infra
  -> PostgreSQL
  -> Redis
  -> optional nginx reverse proxy
```

## Browser runtime

Main worker files:

- `worker/browser-runtime/session-manager.ts`
- `worker/browser-runtime/observer-loop.ts`
- `worker/browser-runtime/computer-use-orchestrator.ts`
- `worker/browser-runtime/screencast-server.ts`

What the runtime is responsible for:

- launching Chromium with a persistent profile per workspace
- opening `https://web.whatsapp.com`
- capturing the real session state
- executing UI actions in the browser
- exposing live screencast frames over WebSocket
- persisting proofs and workspace artifacts

## Fonte de verdade em disco

Each workspace session now materializes an inspectable trail under the browser profile directory:

```text
<WHATSAPP_BROWSER_PROFILE_DIR>/<workspaceId>/
  live-screen.jpg
  live-screen.json
  frames/
    <timestamp>.jpg
    <timestamp>.json
  actions/
    <sequence>-<slug>-before.jpg
    <sequence>-<slug>-after.jpg
    <sequence>-<slug>.json
  tmp/
```

This is meant for debugging, auditing, and postmortem analysis.

`live-screen.json` reflects the latest known runtime state:

- `sessionState`
- `whatAgentSees`
- `whatAgentDecided`
- `whatAgentDid`
- `result`
- `nextStep`
- `activeProvider`
- `takeoverActive`
- `agentPaused`

## Screencast stream

The desktop viewer must use WebSocket screencast, not polling.

Worker stream endpoint:

```text
ws://<worker-host>:3004/stream/<workspaceId>?token=<auth-token>
```

Environment knobs:

- `SCREENCAST_WS_PORT`
- `SCREENCAST_QUALITY`
- `SCREENCAST_MAX_WIDTH`
- `SCREENCAST_MAX_HEIGHT`
- `SCREENCAST_EVERY_NTH_FRAME`
- `NEXT_PUBLIC_SCREENCAST_WS_URL`

Optional nginx proxy path:

```text
/ws/screencast/
```

If you use the proxy, point `NEXT_PUBLIC_SCREENCAST_WS_URL` to that public path base.

## Frontend experience

The main chat surface is expected to show:

- fixed `Anexar Arquivos` button
- fixed `Conectar meu WhatsApp` button
- central desktop viewer instead of the old live reasoning strip
- `...` menu with activity, takeover and interrupt controls
- activity timeline built from agent stream events and browser proofs

Relevant files:

- `frontend/src/components/kloel/chat-container.tsx`
- `frontend/src/components/kloel/input-composer.tsx`
- `frontend/src/components/kloel/AgentDesktopViewer.tsx`
- `frontend/src/lib/api.ts`

## Provider order

Computer use priority is now:

1. `openai`
2. `anthropic`
3. `heuristic`

Current defaults:

- `WHATSAPP_PROVIDER_DEFAULT=whatsapp-web-agent`
- `WHATSAPP_CUA_PROVIDER=openai`
- `WHATSAPP_CUA_MODE=native`

## Cost controls

The observer loop should avoid blind multimodal calls.

Current runtime policy:

- idle mode uses cheap local signals
- active mode uses faster cadence and multimodal interpretation
- Redis checkpoints expire with TTL
- browser proofs are persisted independently from live stream frames

Main envs:

- `WHATSAPP_IDLE_INTERVAL_MS`
- `WHATSAPP_ACTIVE_INTERVAL_MS`
- `WHATSAPP_ACTIVE_TO_IDLE_MS`
- `WHATSAPP_CHECKPOINT_TTL_SECONDS`
- `WHATSAPP_LIVE_SCREEN_WRITE_INTERVAL_MS`
- `WHATSAPP_FRAME_ARCHIVE_INTERVAL_MS`

## Deploy notes

Typical production split:

- frontend on Vercel
- backend on Railway
- worker on Railway

To make live browser viewing work in production you must expose a public screencast URL for the worker or proxy it through a public ingress and set:

```env
NEXT_PUBLIC_SCREENCAST_WS_URL=wss://your-public-screencast-endpoint
```

Without this variable the frontend falls back to `ws(s)://<current-host>:3004`, which only works in local or same-host deployments.

## Quick start

### 1. Configure envs

Root:

```bash
cp .env.example .env
```

Frontend:

```bash
cp frontend/.env.example frontend/.env.local
```

Backend:

```bash
cp backend/.env.example backend/.env
```

### 2. Install

```bash
cd backend && npm install
cd ../frontend && npm install
cd ../worker && npm install
```

### 3. Start

```bash
cd backend && npm run start:dev
cd frontend && npm run dev
cd worker && npm run start:watch
```

### 4. Open

- frontend: `http://localhost:3000`
- backend: `http://localhost:3001`
- worker health: `http://localhost:3003/health`
- worker screencast WS: `ws://localhost:3004/stream/<workspaceId>?token=<token>`

## Validation checklist

- open the main chat UI
- click `Conectar meu WhatsApp`
- confirm the desktop viewer appears
- confirm the WhatsApp Web QR is visible inside the streamed browser
- scan the QR with a real account
- verify the viewer remains live after connection
- take over the browser from the UI
- send a test message from the connected account
- verify proofs and `live-screen.json` update accordingly

## Important limitations

- the repository is not yet fully purged of all WAHA legacy code paths
- full visual catchup and replay still need hardening
- durable proof persistence beyond runtime + Redis is still incomplete
- some administrative flows remain hybrid while the migration is being finished

## Priority from here

The next acceptance gate is practical E2E validation with a real WhatsApp account:

- real QR scan
- real inbound detection
- real outbound text
- real outbound media
- real takeover
- real restart/recovery

Build-green alone is not enough. The browser runtime must prove itself with a live account.
