import { createHash } from "crypto";
import { computerUseOrchestrator } from "./computer-use-orchestrator";
import { browserSessionManager } from "./session-manager";
import {
  buildSyntheticProviderMessageId,
  ingestBrowserInbound,
} from "./backend-inbound-bridge";
import { WorkerLogger } from "../logger";

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

  private async processWorkspace(workspaceId: string): Promise<ObserverMode> {
    const state = this.getWorkspaceState(workspaceId);
    const context = await browserSessionManager.getObservationContext(workspaceId);
    const snapshot = context.snapshot;

    if (!snapshot.connected) {
      state.mode = "idle";
      state.lastSessionState = snapshot.state;
      return state.mode;
    }

    const unreadCount = (context.visibleChats || []).reduce(
      (sum, chat) => sum + Math.max(0, Number(chat?.unreadCount || 0) || 0),
      0,
    );
    const fingerprint = buildFingerprint({
      title: snapshot.title,
      sessionState: snapshot.state,
      currentChatId: context.currentChatId,
      unreadCount,
      screenshotDataUrl: snapshot.screenshotDataUrl,
      visibleChats: context.visibleChats || [],
      visibleMessages: context.visibleMessages || [],
    });

    const now = Date.now();
    const sessionStateChanged =
      Boolean(state.lastSessionState) && state.lastSessionState !== snapshot.state;
    const titleChanged =
      Boolean(state.lastTitle) && state.lastTitle !== String(snapshot.title || "");
    const unreadChanged = unreadCount !== state.lastUnreadCount;
    const fingerprintChanged =
      Boolean(state.lastFingerprint) && state.lastFingerprint !== fingerprint;

    const cheapSignalTriggered =
      sessionStateChanged ||
      titleChanged ||
      unreadChanged ||
      fingerprintChanged;
    const stillActive =
      state.mode === "active" && now - state.lastActivityAt < ACTIVE_TO_IDLE_MS;
    const shouldObserve = cheapSignalTriggered || stillActive;

    if (cheapSignalTriggered) {
      state.lastActivityAt = now;
      state.mode = "active";
    } else if (!stillActive) {
      state.mode = "idle";
    }

    state.lastFingerprint = fingerprint;
    state.lastTitle = String(snapshot.title || "");
    state.lastUnreadCount = unreadCount;
    state.lastSessionState = snapshot.state;

    if (!shouldObserve) {
      return state.mode;
    }

    const observation = await computerUseOrchestrator.observe(
      workspaceId,
      "detect_live_inbound_messages",
    );
    const activeChat =
      observation.visibleChats.find(
        (chat) => chat.id === observation.currentChatId,
      ) ||
      observation.visibleChats[0] ||
      null;
    const fromPhone =
      String(activeChat?.phone || activeChat?.id || "")
        .replace(/@.+$/, "")
        .replace(/\D/g, "") || "";

    if (!fromPhone) {
      return state.mode;
    }

    this.cleanupWorkspaceStore(workspaceId);

    for (const message of observation.visibleMessages || []) {
      const text = String(message?.body || "").trim();
      if (!text || message?.fromMe === true) {
        continue;
      }

      const providerMessageId = buildSyntheticProviderMessageId({
        workspaceId,
        chatId: observation.currentChatId || activeChat?.id || null,
        from: fromPhone,
        text,
        sourceId: message?.id || null,
      });

      if (this.hasRecent(workspaceId, providerMessageId)) {
        continue;
      }

      const delivered = await ingestBrowserInbound({
        workspaceId,
        provider: "whatsapp-web-agent",
        ingestMode: "live",
        providerMessageId,
        from: fromPhone,
        to: snapshot.phoneNumber || undefined,
        senderName: activeChat?.name || undefined,
        type: "text",
        text,
        raw: {
          source: "browser_observer_loop",
          activeChatId: observation.currentChatId || null,
          chat: activeChat || null,
          message,
          observationSummary: observation.summary,
          observedAt: observation.generatedAt,
          observerMode: state.mode,
          cheapSignalTriggered,
        },
      });

      if (delivered) {
        this.remember(workspaceId, providerMessageId);
        state.lastActivityAt = now;
        state.mode = "active";
        await browserSessionManager.recordProof(workspaceId, {
          kind: "observe",
          provider: observation.provider,
          summary: `Inbound detectado visualmente para ${fromPhone}.`,
          observation,
          metadata: {
            providerMessageId,
            senderName: activeChat?.name || null,
            observerMode: state.mode,
            cheapSignalTriggered,
          },
        });
      }
    }

    if (now - state.lastActivityAt >= ACTIVE_TO_IDLE_MS) {
      state.mode = "idle";
    }

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
browserObserverLoop.start();
