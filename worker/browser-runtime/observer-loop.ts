import { createHash } from "crypto";
import { browserSessionManager } from "./session-manager";
import {
  buildSyntheticProviderMessageId,
  ingestBrowserInbound,
} from "./backend-inbound-bridge";
import { WorkerLogger } from "../logger";
import { publishAgentEvent } from "../providers/agent-events";

const log = new WorkerLogger("browser-observer-loop");
const ENABLE_BROWSER_OBSERVER =
  String(process.env.WHATSAPP_BROWSER_OBSERVER_ENABLED || "true").trim() !==
  "false";
const IDLE_INTERVAL_MS = Math.max(
  15_000,
  parseInt(process.env.WHATSAPP_IDLE_INTERVAL_MS || "45000", 10) || 45_000,
);
const ACTIVE_INTERVAL_MS = Math.max(
  3_000,
  parseInt(process.env.WHATSAPP_ACTIVE_INTERVAL_MS || "4000", 10) || 4_000,
);
const ACTIVE_TO_IDLE_MS = Math.max(
  15_000,
  parseInt(process.env.WHATSAPP_ACTIVE_TO_IDLE_MS || "60000", 10) || 60_000,
);
const OBSERVER_TTL_MS = Math.max(
  60_000,
  parseInt(process.env.WHATSAPP_BROWSER_OBSERVER_DEDUP_TTL_MS || "21600000", 10) ||
    21_600_000,
);

type RecentKeyStore = Map<string, number>;
type ObserverMode = "idle" | "active";

interface WorkspaceLoopState {
  mode: ObserverMode;
  lastActivityAt: number;
  lastFingerprint: string | null;
  lastTitle: string | null;
  lastUnreadCount: number;
  lastSessionState: string | null;
}

function buildFingerprint(input: {
  title?: string | null;
  sessionState?: string | null;
  currentChatId?: string | null;
  unreadCount: number;
  screenshotDataUrl?: string | null;
  visibleChats: Array<{ id?: string | null; unreadCount?: number | null }>;
  visibleMessages: Array<{ id?: string | null; body?: string | null; fromMe?: boolean | null }>;
}): string {
  const messageWindow = (input.visibleMessages || [])
    .slice(-8)
    .map((message) =>
      `${message?.id || "no-id"}:${message?.fromMe === true ? "out" : "in"}:${String(
        message?.body || "",
      )
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 180)}`,
    )
    .join("|");
  const chatWindow = (input.visibleChats || [])
    .slice(0, 12)
    .map((chat) => `${chat?.id || "no-chat"}:${chat?.unreadCount || 0}`)
    .join("|");
  const screenshotHash = createHash("sha1")
    .update(String(input.screenshotDataUrl || "").slice(-8192))
    .digest("hex")
    .slice(0, 12);

  return createHash("sha1")
    .update(
      [
        input.title || "",
        input.sessionState || "",
        input.currentChatId || "",
        String(input.unreadCount || 0),
        screenshotHash,
        chatWindow,
        messageWindow,
      ].join("||"),
    )
    .digest("hex");
}

class BrowserObserverLoop {
  private timer: NodeJS.Timeout | null = null;
  private readonly recentKeysByWorkspace = new Map<string, RecentKeyStore>();
  private readonly stateByWorkspace = new Map<string, WorkspaceLoopState>();
  private running = false;

  start() {
    if (!ENABLE_BROWSER_OBSERVER || this.timer) {
      return;
    }

    this.scheduleNext(1_000);
    log.info("browser_observer_started", {
      idleEveryMs: IDLE_INTERVAL_MS,
      activeEveryMs: ACTIVE_INTERVAL_MS,
    });
  }

  private scheduleNext(delayMs?: number) {
    if (this.timer) {
      clearTimeout(this.timer);
    }

    const nextDelay = Math.max(
      500,
      delayMs ||
        (Array.from(this.stateByWorkspace.values()).some(
          (state) => state.mode === "active",
        )
          ? ACTIVE_INTERVAL_MS
          : IDLE_INTERVAL_MS),
    );

    this.timer = setTimeout(() => {
      void this.tick();
    }, nextDelay);
    this.timer.unref?.();
  }

  private getWorkspaceStore(workspaceId: string): RecentKeyStore {
    const existing = this.recentKeysByWorkspace.get(workspaceId);
    if (existing) {
      return existing;
    }
    const store = new Map<string, number>();
    this.recentKeysByWorkspace.set(workspaceId, store);
    return store;
  }

  private getWorkspaceState(workspaceId: string): WorkspaceLoopState {
    const existing = this.stateByWorkspace.get(workspaceId);
    if (existing) {
      return existing;
    }

    const initial: WorkspaceLoopState = {
      mode: "idle",
      lastActivityAt: 0,
      lastFingerprint: null,
      lastTitle: null,
      lastUnreadCount: 0,
      lastSessionState: null,
    };
    this.stateByWorkspace.set(workspaceId, initial);
    return initial;
  }

  private remember(workspaceId: string, key: string) {
    this.getWorkspaceStore(workspaceId).set(key, Date.now());
  }

  private hasRecent(workspaceId: string, key: string): boolean {
    const store = this.getWorkspaceStore(workspaceId);
    const previous = store.get(key);
    if (!previous) {
      return false;
    }
    return Date.now() - previous < OBSERVER_TTL_MS;
  }

  private cleanupWorkspaceStore(workspaceId: string) {
    const store = this.getWorkspaceStore(workspaceId);
    const cutoff = Date.now() - OBSERVER_TTL_MS;
    for (const [key, ts] of store.entries()) {
      if (ts < cutoff) {
        store.delete(key);
      }
    }
  }

  /**
   * Click a chat in the sidebar using Puppeteer directly ($0 — no Computer Use).
   */
  private async clickChat(
    workspaceId: string,
    chat: { name?: string | null; phone?: string | null; id?: string | null },
  ): Promise<boolean> {
    const page = browserSessionManager.getPageSync(workspaceId);
    if (!page) return false;

    const chatLabel = chat.name || chat.phone || chat.id || "";
    if (!chatLabel) return false;

    try {
      const clicked = await page.evaluate((label: string) => {
        const items = document.querySelectorAll('[role="listitem"]');
        for (const item of items) {
          const text = (item.textContent || "").trim();
          if (text.includes(label)) {
            (item as HTMLElement).click();
            return true;
          }
        }
        return false;
      }, chatLabel);
      return clicked;
    } catch {
      return false;
    }
  }

  /**
   * Read the pushName from the chat header via DOM ($0).
   * WhatsApp Web shows the contact's account name in the header even if not saved.
   */
  private async readChatHeaderName(workspaceId: string): Promise<string | null> {
    const page = browserSessionManager.getPageSync(workspaceId);
    if (!page) return null;

    try {
      return await page.evaluate(() => {
        // WhatsApp Web chat header: the contact name/number is in a span
        // inside the header section above the messages
        const header = document.querySelector(
          'header span[dir="auto"][title], [data-testid="conversation-info-header"] span[title]',
        );
        if (header) {
          return (header as HTMLElement).getAttribute("title") || (header as HTMLElement).textContent || null;
        }
        // Fallback: look for any span with a title in the top area
        const topSpans = document.querySelectorAll(
          'header span[title], #main header span[dir="auto"]',
        );
        for (const span of topSpans) {
          const title = (span as HTMLElement).getAttribute("title") || (span as HTMLElement).textContent || "";
          if (title && title.length > 1 && title.length < 80) return title;
        }
        return null;
      });
    } catch {
      return null;
    }
  }

  private async processWorkspace(workspaceId: string): Promise<ObserverMode> {
    const state = this.getWorkspaceState(workspaceId);

    // Step 1: Read DOM state ($0 — no API calls)
    const context = await browserSessionManager.getObservationContext(workspaceId);
    const snapshot = context.snapshot;

    if (!snapshot.connected) {
      state.mode = "idle";
      state.lastSessionState = snapshot.state;
      return state.mode;
    }

    // Step 2: Check for changes
    const unreadCount = (context.visibleChats || []).reduce(
      (sum, chat) => sum + Math.max(0, Number(chat?.unreadCount || 0) || 0),
      0,
    );
    const now = Date.now();
    const isFirstObservation = !state.lastSessionState && !state.lastFingerprint;
    const unreadChanged = unreadCount !== state.lastUnreadCount;
    const sessionStateChanged =
      Boolean(state.lastSessionState) && state.lastSessionState !== snapshot.state;
    const shouldAct = isFirstObservation || unreadChanged || sessionStateChanged ||
      (state.mode === "active" && now - state.lastActivityAt < ACTIVE_TO_IDLE_MS);

    state.lastSessionState = snapshot.state;
    state.lastUnreadCount = unreadCount;
    state.lastFingerprint = "dom-only";

    if (!shouldAct) {
      if (now - state.lastActivityAt >= ACTIVE_TO_IDLE_MS) state.mode = "idle";
      return state.mode;
    }

    // Step 3: Find chats with unread messages (WhatsApp DOM order = most recent first)
    const unreadChats = (context.visibleChats || []).filter(
      (c) => (c.unreadCount ?? 0) > 0,
    );

    if (!unreadChats.length) {
      if (now - state.lastActivityAt >= ACTIVE_TO_IDLE_MS) state.mode = "idle";
      return state.mode;
    }

    const totalUnread = unreadChats.reduce(
      (sum, c) => sum + (c.unreadCount ?? 0), 0,
    );

    log.info("browser_observer_detected_unreads", {
      workspaceId,
      totalUnread,
      chatCount: unreadChats.length,
    });

    void publishAgentEvent({
      type: "thought",
      workspaceId,
      phase: "scanning",
      message: `Detectei ${totalUnread} mensagens não lidas em ${unreadChats.length} conversas. Processando por ordem de mais recentes...`,
      meta: { streaming: true },
    }).catch(() => {});

    // Step 4: Process the most recent unread chat
    const targetChat = unreadChats[0];
    const chatLabel = targetChat.name || targetChat.phone || targetChat.id || "";

    // Estimate cursor position for frontend animation
    // WhatsApp sidebar: ~200px wide center, chats start at ~72px from top, each ~72px tall
    const chatIndex = (context.visibleChats || []).indexOf(targetChat);
    const estimatedCursorX = 200;
    const estimatedCursorY = 130 + Math.max(0, chatIndex) * 72;

    void publishAgentEvent({
      type: "thought",
      workspaceId,
      phase: "navigating",
      message: `Abrindo conversa com ${chatLabel} (${targetChat.unreadCount} não lidas)...`,
      meta: {
        streaming: true,
        cursorX: estimatedCursorX,
        cursorY: estimatedCursorY,
        cursorAction: "click",
      },
    }).catch(() => {});

    // Step 4a: Click on the chat via Puppeteer ($0)
    const clicked = await this.clickChat(workspaceId, targetChat);
    if (!clicked) {
      log.warn("browser_observer_click_chat_failed", { workspaceId, chatLabel });
      // Fallback: try Computer Use for click only
      try {
        const { computerUseOrchestrator } = await import("./computer-use-orchestrator");
        await computerUseOrchestrator.runActionTurn(
          workspaceId,
          `Clique na conversa "${chatLabel}" na lista de chats à esquerda. Não digite nada.`,
        );
      } catch {
        return state.mode;
      }
    }

    await new Promise((r) => setTimeout(r, 2_500));

    // Step 4b: Re-read DOM after chat is open ($0)
    const chatContext = await browserSessionManager.getObservationContext(workspaceId);
    const activeChat = chatContext.visibleChats.find(
      (c) => c.id === chatContext.currentChatId,
    ) || chatContext.visibleChats[0] || targetChat;

    const fromPhone = String(activeChat?.phone || activeChat?.id || "")
      .replace(/@.+$/, "")
      .replace(/\D/g, "") || "";

    if (!fromPhone) return state.mode;

    // Step 4c: Read pushName from chat header via DOM ($0)
    const headerName = await this.readChatHeaderName(workspaceId);
    const contactName = headerName || activeChat?.name || fromPhone;

    // Step 4d: Save contact if not saved (name looks like phone number)
    const displayName = String(activeChat?.name || "").trim();
    const isUnsaved = /^[\d\s\+\-\(\)]+$/.test(displayName);
    if (isUnsaved && headerName && !/^[\d\s\+\-\(\)]+$/.test(headerName)) {
      const saveKey = `contact-saved:${workspaceId}:${fromPhone}`;
      if (!this.hasRecent(workspaceId, saveKey)) {
        void publishAgentEvent({
          type: "thought",
          workspaceId,
          phase: "saving_contact",
          message: `Salvando contato: ${headerName} (${fromPhone})...`,
          meta: { streaming: true },
        }).catch(() => {});

        void browserSessionManager.saveContact({
          workspaceId,
          phone: fromPhone,
          name: headerName,
        }).then((r) => {
          if (r.success) this.remember(workspaceId, saveKey);
        }).catch(() => {});
      }
    }

    // Step 4e: Ingest all new inbound messages ($0)
    this.cleanupWorkspaceStore(workspaceId);
    let ingestedCount = 0;

    for (const message of chatContext.visibleMessages || []) {
      const text = String(message?.body || "").trim();
      if (!text || message?.fromMe === true) continue;

      const providerMessageId = buildSyntheticProviderMessageId({
        workspaceId,
        chatId: chatContext.currentChatId || activeChat?.id || null,
        from: fromPhone,
        text,
        sourceId: message?.id || null,
      });

      if (this.hasRecent(workspaceId, providerMessageId)) continue;

      const delivered = await ingestBrowserInbound({
        workspaceId,
        provider: "whatsapp-web-agent",
        ingestMode: "live",
        providerMessageId,
        from: fromPhone,
        to: snapshot.phoneNumber || undefined,
        senderName: contactName || undefined,
        type: "text",
        text,
        raw: {
          source: "browser_observer_dom",
          chatId: chatContext.currentChatId || null,
          contactName,
          headerName,
        },
      });

      if (delivered) {
        this.remember(workspaceId, providerMessageId);
        ingestedCount++;
      }
    }

    if (ingestedCount > 0) {
      state.lastActivityAt = now;
      state.mode = "active";

      // Move cursor to message composer area (bottom center of chat)
      void publishAgentEvent({
        type: "thought",
        workspaceId,
        phase: "processing",
        message: `${ingestedCount} mensagens de ${contactName} enviadas para análise. CIA brain decidindo resposta...`,
        meta: {
          streaming: true,
          cursorX: 720,
          cursorY: 860,
        },
      }).catch(() => {});

      log.info("browser_observer_ingested", {
        workspaceId,
        phone: fromPhone,
        contactName,
        ingestedCount,
      });
    }

    if (now - state.lastActivityAt >= ACTIVE_TO_IDLE_MS) state.mode = "idle";
    return state.mode;
  }

  async tick() {
    if (this.running) {
      return;
    }

    this.running = true;
    let hasActiveWorkspace = false;
    try {
      const workspaces = browserSessionManager.listActiveWorkspaceIds();
      for (const workspaceId of workspaces) {
        const mode = await this.processWorkspace(workspaceId).catch((error: any) => {
          log.warn("browser_observer_workspace_failed", {
            workspaceId,
            error: error?.message || "unknown_error",
          });
          return "active" as ObserverMode;
        });
        if (mode === "active") {
          hasActiveWorkspace = true;
        }
      }
    } finally {
      this.running = false;
      this.scheduleNext(hasActiveWorkspace ? ACTIVE_INTERVAL_MS : IDLE_INTERVAL_MS);
    }
  }
}

export const browserObserverLoop = new BrowserObserverLoop();
// Auto-start with 10s delay to give browser sessions time to be created
// (by frontend's startSession call or by processor bootstrap).
setTimeout(() => {
  browserObserverLoop.start();
  console.log("[observer-loop] Auto-started after 10s delay");
}, 10_000);
