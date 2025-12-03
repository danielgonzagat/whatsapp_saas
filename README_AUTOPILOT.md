# 🤖 WhatsApp Autopilot™ & Money Machine™ - Documentation

Welcome to the future of automated sales. This system is not just a chatbot; it's a fully autonomous revenue employee.

## 🌟 Key Features

### 1. WhatsApp Autopilot™ (The Driver)
**What it does:**
- Reads every incoming message 24/7.
- Uses **GPT-4o** to analyze intent, sentiment, and urgency.
- **Decides** the best action: Send Offer, Schedule Meeting, Handle Objection, or Handover to Human.
- **SmartTime Integration:** If a buying signal comes at 3 AM, it schedules the "Closing Message" for the next morning's "Golden Hour" (e.g., 10 AM) to maximize conversion.

**How to use:**
1. Go to **Autopilot HQ** (/dashboard).
2. Toggle the switch to **ONLINE**.
3. Watch the "Métricas do Piloto" update in real-time.

### 2. Automated Money Machine™ (The Revenue Button)
**What it does:**
- Scans your entire database for **"Dead Money"**:
    - Leads who haven't replied in 30 days.
    - Conversations stuck in "Negotiation" for > 7 days.
- **Auto-Generates** a Reactivation Campaign with AI-written copy tailored to bring them back.
- Creates a Flow dynamically and queues it for sending.

**How to use:**
1. Go to **Autopilot HQ**.
2. Click the big glowing **"ATIVAR MÁQUINA AGORA"** button.
3. The system will report how many leads were found and create a campaign in the **Campanhas** tab.

### 3. NeuroCRM & Sentiment Analysis
**What it does:**
- **Lead Scoring:** Assigns a score (0-100) based on activity and sentiment.
- **Sentiment Tracking:** Detects `Positive`, `Negative`, or `Anxious` emotions.
- **GhostCloser:** Automatically nudges high-score leads (>50) who stop responding for 2 hours.

**How to use:**
- Go to **Contatos** (/dashboard/contacts) to see the Score Bar and Sentiment Badges.
- Analytics charts in the Dashboard show the breakdown of your audience's mood.

### 4. WhatsApp Copilot (Inbox AI)
**What it does:**
- Inside the Inbox, when you open a chat, the AI analyzes the history + Knowledge Base.
- It suggests the **Perfect Reply** instantly.
- Click "Usar" to load it into the input box.

## ⚙️ Configuration

- **Providers:** Supports Meta Cloud API, Evolution API, WPPConnect, and UltraWA.
- **AI Brain:** Powered by OpenAI (GPT-4o recommended for Autopilot). Configure API Key in `.env` or Settings.
- **Anti-Ban:** Smart Jitter (random delays) is active by default to simulate human typing speeds.

## 🛠️ Architecture

- **Backend:** NestJS (Modular: `Autopilot`, `Growth`, `AiBrain`).
- **Worker:** BullMQ (Processors: `autopilot-processor`, `crm-processor`, `memory-processor`).
- **Database:** PostgreSQL + Prisma (with `pgvector` for RAG).
- **Frontend:** Next.js + Tailwind (Glassmorphism UI).

## 📡 Omnichannel Fallback
- O Autopilot tenta WhatsApp primeiro. Se falhar e o canal estiver habilitado:
- **Email:** `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM` + toggle em Settings → Canais.
- **Telegram:** opcional com `TELEGRAM_BOT_TOKEN` e `customFields.telegramChatId` no contato.
- Proteções: `AUTOPILOT_CONTACT_DAILY_LIMIT` (default 5) e `AUTOPILOT_WORKSPACE_DAILY_LIMIT` (default 1000) por 24h.
- Ciclo automático: job horário roda follow-ups para conversas silenciosas (`AUTOPILOT_SILENCE_HOURS`, default 24h).
- Janela de disparo do ciclo: `AUTOPILOT_WINDOW_START`/`AUTOPILOT_WINDOW_END` (default 8→22) e limite por ciclo `AUTOPILOT_CYCLE_LIMIT` (default 200).
- Alertas operacionais: `AUTOPILOT_QUEUE_WAITING_THRESHOLD` (default 200) dispara webhook (`AUTOPILOT_ALERT_WEBHOOK` ou `OPS_WEBHOOK_URL`) se fila do Autopilot acumular jobs (verificador roda a cada 60s).
- Reengajamento inteligente: mensagens com sinal de compra disparam `GHOST_CLOSER` e agendam um follow-up 45min depois; se o lead responder nesse intervalo, o follow-up é pulado. Contador Prometheus `worker_autopilot_ghost_closer_total` mede execuções/erros. Exemplos de alertas em `worker/autopilot-alerts.yaml`.
- UI: Dashboard mostra janela/limites atuais (runtime-config), backlog de follow-ups (jobs delayed) e status do agente.
- Grafana: painel pronto em `worker/autopilot-grafana.json` (queue waiting/delayed/failed, erros/execuções de GhostCloser/LeadUnlocker e decisões por ação).

---
*Built for the Global Top 1 SaaS Vision.*
