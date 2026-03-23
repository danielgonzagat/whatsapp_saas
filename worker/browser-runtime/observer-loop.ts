import { computerUseOrchestrator } from "./computer-use-orchestrator";
import { browserSessionManager } from "./session-manager";
import { buildSyntheticProviderMessageId, ingestBrowserInbound } from "./backend-inbound-bridge";
import { WorkerLogger } from "../logger";

const log = new WorkerLogger("browser-observer-loop");
const ENABLE_BROWSER_OBSERVER =
  String(process.env.WHATSAPP_BROWSER_OBSERVER_ENABLED || "true").trim() !==
  "false";
const OBSERVER_INTERVAL_MS = Math.max(
  4000,
  parseInt(process.env.WHATSAPP_BROWSER_OBSERVER_INTERVAL_MS || "8000", 10) ||
    8000,
);
const OBSERVER_TTL_MS = Math.max(
  60_000,
  parseInt(process.env.WHATSAPP_BROWSER_OBSERVER_DEDUP_TTL_MS || "21600000", 10) ||
    21_600_000,
);

type RecentKeyStore = Map<string, number>;

class BrowserObserverLoop {
  private timer: NodeJS.Timeout | null = null;
  private readonly recentKeysByWorkspace = new Map<string, RecentKeyStore>();
  private running = false;

  start() {
    if (!ENABLE_BROWSER_OBSERVER || this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      void this.tick();
    }, OBSERVER_INTERVAL_MS);
    this.timer.unref?.();
    log.info("browser_observer_started", {
      everyMs: OBSERVER_INTERVAL_MS,
    });
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

  private async processWorkspace(workspaceId: string) {
    const snapshot = await browserSessionManager.getSnapshot(workspaceId, true);
    if (!snapshot.connected) {
      return;
    }

    const observation = await computerUseOrchestrator.observe(
      workspaceId,
      "detect_live_inbound_messages",
    );
    const activeChat =
      observation.visibleChats.find((chat) => chat.id === observation.currentChatId) ||
      observation.visibleChats[0] ||
      null;
    const fromPhone =
      String(activeChat?.phone || activeChat?.id || "")
        .replace(/@.+$/, "")
        .replace(/\D/g, "") || "";

    if (!fromPhone) {
      return;
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
        },
      });

      if (delivered) {
        this.remember(workspaceId, providerMessageId);
        await browserSessionManager.recordProof(workspaceId, {
          kind: "observe",
          provider: observation.provider,
          summary: `Inbound detectado visualmente para ${fromPhone}.`,
          observation,
          metadata: {
            providerMessageId,
            senderName: activeChat?.name || null,
          },
        });
      }
    }
  }

  async tick() {
    if (this.running) {
      return;
    }

    this.running = true;
    try {
      const workspaces = browserSessionManager.listActiveWorkspaceIds();
      for (const workspaceId of workspaces) {
        await this.processWorkspace(workspaceId).catch((error: any) => {
          log.warn("browser_observer_workspace_failed", {
            workspaceId,
            error: error?.message || "unknown_error",
          });
        });
      }
    } finally {
      this.running = false;
    }
  }
}

export const browserObserverLoop = new BrowserObserverLoop();
browserObserverLoop.start();
