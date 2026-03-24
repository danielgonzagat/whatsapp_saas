import fs from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser, ElementHandle, Page } from "puppeteer";
import {
  BrowserActionInput,
  ActionMetadata,
  BrowserObservedChat,
  BrowserObservedMessage,
  BrowserObservationResult,
  BrowserObservationState,
  BrowserProofEntry,
  BrowserSendMediaInput,
  BrowserSendTextInput,
  BrowserSessionSnapshot,
  BrowserSessionState,
  ComputerUseProvider,
  FrameMetadata,
} from "./types";
import { isRedisConfigured, redis } from "../redis-client";
import { publishAgentEvent } from "../providers/agent-events";

const WHATSAPP_WEB_URL = "https://web.whatsapp.com";
const SESSION_ROOT =
  process.env.WHATSAPP_BROWSER_PROFILE_DIR ||
  process.env.BROWSER_SESSION_DIR ||
  "/tmp/kloel-browser-sessions";
const VIEWPORT_WIDTH = Math.max(
  900,
  parseInt(process.env.WHATSAPP_BROWSER_VIEWPORT_WIDTH || "1440", 10) || 1440,
);
const VIEWPORT_HEIGHT = Math.max(
  700,
  parseInt(process.env.WHATSAPP_BROWSER_VIEWPORT_HEIGHT || "900", 10) || 900,
);
const DEFAULT_WAIT_MS = Math.max(
  100,
  parseInt(process.env.WHATSAPP_BROWSER_DEFAULT_WAIT_MS || "500", 10) || 500,
);
const HEADLESS_BROWSER: boolean | "shell" = (() => {
  const raw = String(process.env.WHATSAPP_BROWSER_HEADLESS || "false")
    .trim()
    .toLowerCase();

  if (raw === "new" || raw === "shell") {
    return "shell";
  }
  if (raw === "true") {
    return "shell";
  }
  return false;
})();
const CHROME_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const MAX_PROOFS = Math.max(
  10,
  parseInt(process.env.WHATSAPP_BROWSER_MAX_PROOFS || "120", 10) || 120,
);
const VISIBLE_TEXT_LIMIT = Math.max(
  1500,
  parseInt(process.env.WHATSAPP_BROWSER_VISIBLE_TEXT_LIMIT || "6000", 10) ||
    6000,
);
const CHECKPOINT_PREFIX =
  process.env.WHATSAPP_BROWSER_CHECKPOINT_PREFIX ||
  "whatsapp:web-agent:checkpoint";
const MAX_CHECKPOINT_CHATS = Math.max(
  10,
  parseInt(process.env.WHATSAPP_BROWSER_MAX_CHECKPOINT_CHATS || "80", 10) || 80,
);
const MAX_CHECKPOINT_MESSAGES_PER_CHAT = Math.max(
  10,
  parseInt(
    process.env.WHATSAPP_BROWSER_MAX_CHECKPOINT_MESSAGES_PER_CHAT || "40",
    10,
  ) || 40,
);
const CHECKPOINT_TTL_SECONDS = Math.max(
  3600,
  parseInt(
    process.env.WHATSAPP_CHECKPOINT_TTL_SECONDS || "604800",
    10,
  ) || 604800,
);
const LIVE_SCREEN_WRITE_INTERVAL_MS = Math.max(
  100,
  parseInt(process.env.WHATSAPP_LIVE_SCREEN_WRITE_INTERVAL_MS || "250", 10) ||
    250,
);
const FRAME_ARCHIVE_INTERVAL_MS = Math.max(
  500,
  parseInt(process.env.WHATSAPP_FRAME_ARCHIVE_INTERVAL_MS || "1000", 10) ||
    1000,
);
const TYPING_DELAY_MIN_MS = Math.max(
  15,
  parseInt(process.env.WHATSAPP_TYPING_DELAY_MIN_MS || "30", 10) || 30,
);
const TYPING_DELAY_MAX_MS = Math.max(
  TYPING_DELAY_MIN_MS,
  parseInt(process.env.WHATSAPP_TYPING_DELAY_MAX_MS || "80", 10) || 80,
);
const COMPOSER_STABILIZE_WAIT_MS = Math.max(
  50,
  parseInt(process.env.WHATSAPP_COMPOSER_STABILIZE_WAIT_MS || "180", 10) ||
    180,
);

puppeteer.use(StealthPlugin());

interface PageSignals {
  bodyText: string;
  title: string;
  currentUrl: string;
  connected: boolean;
  qrPending: boolean;
  visibleChats: BrowserObservedChat[];
  visibleMessages: BrowserObservedMessage[];
  activeChatId?: string | null;
}

interface RuntimeSession {
  workspaceId: string;
  browser: Browser;
  page: Page;
  state: BrowserSessionState;
  takeoverActive: boolean;
  agentPaused: boolean;
  lastError?: string | null;
  phoneNumber?: string | null;
  pushName?: string | null;
  screenshotDataUrl?: string | null;
  screenshotUpdatedAt?: string | null;
  lastActionAt?: string | null;
  lastObservationAt?: string | null;
  activeProvider?: ComputerUseProvider | null;
  knownChats: Map<string, any>;
  knownMessages: Map<string, any[]>;
  proofs: BrowserProofEntry[];
  observation: BrowserObservationState;
  lastLiveScreenWriteAt?: number | null;
  lastArchivedFrameAt?: number | null;
  actionSequence: number;
}

interface PersistedBrowserCheckpoint {
  workspaceId: string;
  state: BrowserSessionState;
  takeoverActive: boolean;
  agentPaused: boolean;
  lastError?: string | null;
  phoneNumber?: string | null;
  pushName?: string | null;
  screenshotUpdatedAt?: string | null;
  lastActionAt?: string | null;
  lastObservationAt?: string | null;
  activeProvider?: ComputerUseProvider | null;
  observation: BrowserObservationState;
  proofs: Array<
    Omit<BrowserProofEntry, "beforeImage" | "afterImage"> & {
      beforeImage?: null;
      afterImage?: null;
    }
  >;
  knownChats: Array<[string, any]>;
  knownMessages: Array<[string, BrowserObservedMessage[]]>;
  updatedAt: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toDataUrl(base64: string, mimeType = "image/jpeg"): string {
  return `data:${mimeType};base64,${base64}`;
}

function normalizePhone(value: string): string {
  return String(value || "").replace(/\D/g, "");
}

function toChatId(value: string): string {
  const raw = String(value || "").trim();
  const phone = normalizePhone(raw);
  if (raw.includes("@")) {
    return raw;
  }
  return phone ? `${phone}@c.us` : raw;
}

function resolveChromiumPath(): string | undefined {
  const explicit = String(
    process.env.PUPPETEER_EXECUTABLE_PATH ||
      process.env.CHROMIUM_PATH ||
      "",
  ).trim();
  return explicit || undefined;
}

function summarizeText(value: string, limit = 280): string {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  return normalized.length > limit
    ? `${normalized.slice(0, Math.max(0, limit - 1))}...`
    : normalized;
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function slugify(value: string): string {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return normalized || "entry";
}

function decodeDataUrl(dataUrl: string): {
  mimeType: string;
  buffer: Buffer;
} {
  const match = String(dataUrl || "").match(
    /^data:([^;,]+)?(?:;base64)?,(.*)$/s,
  );
  if (!match) {
    throw new Error("invalid_data_url");
  }

  const mimeType = match[1] || "application/octet-stream";
  const payload = match[2] || "";
  const isBase64 = String(dataUrl || "").includes(";base64,");
  return {
    mimeType,
    buffer: isBase64
      ? Buffer.from(payload, "base64")
      : Buffer.from(decodeURIComponent(payload), "utf8"),
  };
}

function buildCheckpointKey(workspaceId: string): string {
  return `${CHECKPOINT_PREFIX}:${workspaceId}`;
}

function inferExtension(contentType?: string | null, mediaType?: string): string {
  const normalizedContentType = String(contentType || "")
    .toLowerCase()
    .split(";")[0]
    .trim();
  const normalizedMediaType = String(mediaType || "").toLowerCase().trim();

  const mapping: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/ogg": ".ogg",
    "audio/wav": ".wav",
    "application/pdf": ".pdf",
    "application/zip": ".zip",
  };

  if (normalizedContentType && mapping[normalizedContentType]) {
    return mapping[normalizedContentType];
  }

  switch (normalizedMediaType) {
    case "image":
      return ".jpg";
    case "video":
      return ".mp4";
    case "audio":
      return ".mp3";
    case "document":
    default:
      return ".bin";
  }
}

async function readWhatsAppSignals(page: Page): Promise<PageSignals> {
  return page.evaluate(() => {
    const bodyText = String(document.body?.innerText || "")
      .replace(/\s+/g, " ")
      .trim();
    const title = String(document.title || "").trim();
    const currentUrl = String(window.location.href || "").trim();
    const lowered = bodyText.toLowerCase();
    const connected =
      Boolean(
        document.querySelector(
          '[contenteditable="true"][role="textbox"], div[contenteditable="true"], textarea, [role="textbox"]',
        ),
      ) ||
      lowered.includes("search or start new chat") ||
      lowered.includes("pesquise ou inicie uma nova conversa") ||
      lowered.includes("communities") ||
      lowered.includes("conversas") ||
      lowered.includes("chats");
    const qrPending =
      lowered.includes("scan the qr code") ||
      lowered.includes("escaneie o código qr") ||
      lowered.includes("use whatsapp on your computer") ||
      lowered.includes("use o whatsapp no computador") ||
      lowered.includes("keep your phone connected") ||
      lowered.includes("mantenha seu celular conectado");

    const visibleChats = Array.from(
      document.querySelectorAll('[role="listitem"]'),
    )
      .slice(0, 40)
      .map((item, index) => {
        const text = String((item.textContent || "").trim());
        const phone =
          text.match(
            /(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[-\s]?\d{4}/,
          )?.[0] || "";
        const normalizedPhone = phone ? phone.replace(/\D/g, "") : "";
        const unreadBadge = Array.from(item.querySelectorAll("span"))
          .map((node) => String((node.textContent || "").trim()))
          .find((value) => /^\d+$/.test(value));
        const name = text.split("\n")[0] || null;
        return {
          id: normalizedPhone ? `${normalizedPhone}@c.us` : `visible-chat-${index}`,
          name,
          phone: normalizedPhone || null,
          unreadCount: unreadBadge ? Number(unreadBadge) : null,
          timestamp: Date.now(),
          rawText: text,
        };
      });

    const visibleMessages = Array.from(
      document.querySelectorAll("[data-pre-plain-text], [aria-label]"),
    )
      .slice(-80)
      .map((node, index) => {
        const body = String((node.textContent || "").trim());
        const attrs = (node as Element).getAttributeNames?.() || [];
        const parent = (node as Element).closest("[data-testid], [class], [role]");
        const className = String((parent as HTMLElement | null)?.className || "");
        const testId = String(
          (parent as Element | null)?.getAttribute?.("data-testid") || "",
        );
        const explicitId =
          (node as Element).getAttribute("data-id") ||
          attrs
            .map((attr) => (node as Element).getAttribute(attr))
            .find((value) => String(value || "").includes("msg")) ||
          null;
        return {
          id: explicitId || `visible-message-${index}`,
          body,
          fromMe:
            className.includes("message-out") ||
            testId.includes("msg-out") ||
            testId.includes("outgoing")
              ? true
              : className.includes("message-in") ||
                  testId.includes("msg-in") ||
                  testId.includes("incoming")
                ? false
                : null,
          timestamp: null,
          chatId: null,
        };
      });

    const selectedChat =
      visibleChats.find((chat, index) => {
        const item = document.querySelectorAll('[role="listitem"]')[index] as
          | HTMLElement
          | undefined;
        return (
          item?.getAttribute("aria-selected") === "true" ||
          item?.getAttribute("data-selected") === "true" ||
          item?.className?.toLowerCase?.().includes("selected")
        );
      }) || null;

    return {
      bodyText,
      title,
      currentUrl,
      connected,
      qrPending,
      visibleChats,
      visibleMessages,
      activeChatId: selectedChat?.id || visibleChats[0]?.id || null,
    };
  });
}

class BrowserSessionManager {
  private readonly sessions = new Map<string, RuntimeSession>();

  private getProfileDir(workspaceId: string): string {
    return path.join(SESSION_ROOT, workspaceId);
  }

  private async ensureProfileDir(workspaceId: string) {
    await fs.mkdir(this.getProfileDir(workspaceId), { recursive: true });
  }

  private getTempDir(workspaceId: string): string {
    return path.join(this.getProfileDir(workspaceId), "tmp");
  }

  private async ensureTempDir(workspaceId: string) {
    await fs.mkdir(this.getTempDir(workspaceId), { recursive: true });
  }

  private getFramesDir(workspaceId: string): string {
    return path.join(this.getProfileDir(workspaceId), "frames");
  }

  private getActionsDir(workspaceId: string): string {
    return path.join(this.getProfileDir(workspaceId), "actions");
  }

  private getLiveScreenImagePath(workspaceId: string): string {
    return path.join(this.getProfileDir(workspaceId), "live-screen.jpg");
  }

  private getLiveScreenJsonPath(workspaceId: string): string {
    return path.join(this.getProfileDir(workspaceId), "live-screen.json");
  }

  private async ensureAuditDirs(workspaceId: string) {
    await fs.mkdir(this.getProfileDir(workspaceId), { recursive: true });
    await fs.mkdir(this.getFramesDir(workspaceId), { recursive: true });
    await fs.mkdir(this.getActionsDir(workspaceId), { recursive: true });
  }

  private normalizeActionList(
    action?: BrowserActionInput | BrowserActionInput[] | null,
  ): BrowserActionInput[] {
    if (!action) {
      return [];
    }
    return Array.isArray(action) ? action : [action];
  }

  private buildFrameMetadata(
    session: RuntimeSession,
    input: {
      screenshotFile: string;
      live: boolean;
      source?: string | null;
      timestamp?: string;
    },
  ): FrameMetadata {
    const latestProof = session.proofs[0] || null;
    const normalizedActions = this.normalizeActionList(latestProof?.action);
    return {
      timestamp: input.timestamp || new Date().toISOString(),
      sessionState: session.state,
      whatAgentSees:
        session.observation.summary ||
        summarizeText(session.observation.lastVisibleText || "", 480) ||
        null,
      whatAgentDecided: latestProof?.objective || latestProof?.summary || null,
      whatAgentDid: normalizedActions,
      result: latestProof?.kind || null,
      nextStep:
        String(latestProof?.metadata?.nextStep || "").trim() || null,
      screenshotFile: input.screenshotFile,
      live: input.live,
      agentPaused: session.agentPaused,
      takeoverActive: session.takeoverActive,
      activeProvider: session.activeProvider || null,
      observationSummary: session.observation.summary || null,
      proofId: latestProof?.id || null,
      source: input.source || null,
    };
  }

  private buildActionMetadata(
    session: RuntimeSession,
    entry: BrowserProofEntry,
    input: {
      beforeFile?: string | null;
      afterFile?: string | null;
    },
  ): ActionMetadata {
    return {
      id: entry.id,
      timestamp: entry.createdAt,
      workspaceId: entry.workspaceId,
      kind: entry.kind,
      provider: entry.provider,
      summary: entry.summary,
      objective: entry.objective || null,
      result:
        String(entry.metadata?.result || "").trim() ||
        entry.kind ||
        null,
      beforeFile: input.beforeFile || null,
      afterFile: input.afterFile || null,
      action: entry.action || null,
      metadata: entry.metadata || null,
    };
  }

  private async writeDataUrlToFile(
    dataUrl: string,
    filePath: string,
  ): Promise<void> {
    const { buffer } = decodeDataUrl(dataUrl);
    await fs.writeFile(filePath, buffer);
  }

  private async persistLiveScreenArtifacts(
    session: RuntimeSession,
    dataUrl: string,
    options?: {
      source?: string | null;
      captureHistory?: boolean;
      forceLiveWrite?: boolean;
      timestamp?: string;
    },
  ): Promise<void> {
    if (!dataUrl) {
      return;
    }

    await this.ensureAuditDirs(session.workspaceId);
    const nowMs = Date.now();
    const shouldWriteLive =
      options?.forceLiveWrite === true ||
      !session.lastLiveScreenWriteAt ||
      nowMs - session.lastLiveScreenWriteAt >= LIVE_SCREEN_WRITE_INTERVAL_MS;

    const timestamp = options?.timestamp || new Date(nowMs).toISOString();

    if (shouldWriteLive) {
      await this.writeDataUrlToFile(
        dataUrl,
        this.getLiveScreenImagePath(session.workspaceId),
      );
      await fs.writeFile(
        this.getLiveScreenJsonPath(session.workspaceId),
        JSON.stringify(
          this.buildFrameMetadata(session, {
            screenshotFile: "live-screen.jpg",
            live: true,
            source: options?.source || null,
            timestamp,
          }),
          null,
          2,
        ),
        "utf8",
      );
      session.lastLiveScreenWriteAt = nowMs;
    }

    const shouldArchiveFrame =
      options?.captureHistory === true &&
      (!session.lastArchivedFrameAt ||
        nowMs - session.lastArchivedFrameAt >= FRAME_ARCHIVE_INTERVAL_MS);

    if (!shouldArchiveFrame) {
      return;
    }

    const baseName = `${nowMs}`;
    const imageFile = `${baseName}.jpg`;
    const jsonFile = `${baseName}.json`;
    await this.writeDataUrlToFile(
      dataUrl,
      path.join(this.getFramesDir(session.workspaceId), imageFile),
    );
    await fs.writeFile(
      path.join(this.getFramesDir(session.workspaceId), jsonFile),
      JSON.stringify(
        this.buildFrameMetadata(session, {
          screenshotFile: `frames/${imageFile}`,
          live: false,
          source: options?.source || null,
          timestamp,
        }),
        null,
        2,
      ),
      "utf8",
    );
    session.lastArchivedFrameAt = nowMs;
  }

  private async persistProofArtifacts(
    session: RuntimeSession,
    entry: BrowserProofEntry,
  ): Promise<void> {
    await this.ensureAuditDirs(session.workspaceId);
    const nowMs = Date.now();
    session.actionSequence += 1;
    const sequence = String(session.actionSequence).padStart(4, "0");
    const slug = slugify(`${entry.kind}-${entry.summary}`);
    const baseName = `${sequence}-${slug}`;

    let beforeFile: string | null = null;
    let afterFile: string | null = null;

    if (entry.beforeImage) {
      beforeFile = `actions/${baseName}-before.jpg`;
      await this.writeDataUrlToFile(
        entry.beforeImage,
        path.join(this.getProfileDir(session.workspaceId), beforeFile),
      );
    }

    if (entry.afterImage) {
      afterFile = `actions/${baseName}-after.jpg`;
      await this.writeDataUrlToFile(
        entry.afterImage,
        path.join(this.getProfileDir(session.workspaceId), afterFile),
      );
    }

    await fs.writeFile(
      path.join(this.getActionsDir(session.workspaceId), `${baseName}.json`),
      JSON.stringify(
        this.buildActionMetadata(session, entry, {
          beforeFile,
          afterFile,
        }),
        null,
        2,
      ),
      "utf8",
    );

    if (entry.afterImage) {
      await this.persistLiveScreenArtifacts(session, entry.afterImage, {
        source: `proof:${entry.kind}`,
        captureHistory: nowMs - (session.lastArchivedFrameAt || 0) >=
          FRAME_ARCHIVE_INTERVAL_MS,
        forceLiveWrite: true,
        timestamp: entry.createdAt,
      });
    }
  }

  private buildPersistedCheckpoint(
    session: RuntimeSession,
  ): PersistedBrowserCheckpoint {
    const knownChats = Array.from(session.knownChats.entries()).slice(
      -MAX_CHECKPOINT_CHATS,
    );
    const knownMessages = Array.from(session.knownMessages.entries())
      .slice(-MAX_CHECKPOINT_CHATS)
      .map(([chatId, messages]) => [
        chatId,
        (messages || []).slice(-MAX_CHECKPOINT_MESSAGES_PER_CHAT),
      ]) as Array<[string, BrowserObservedMessage[]]>;

    return {
      workspaceId: session.workspaceId,
      state: session.state,
      takeoverActive: session.takeoverActive,
      agentPaused: session.agentPaused,
      lastError: session.lastError || null,
      phoneNumber: session.phoneNumber || null,
      pushName: session.pushName || null,
      screenshotUpdatedAt: session.screenshotUpdatedAt || null,
      lastActionAt: session.lastActionAt || null,
      lastObservationAt: session.lastObservationAt || null,
      activeProvider: session.activeProvider || null,
      observation: session.observation,
      proofs: session.proofs.map((proof) => ({
        ...proof,
        beforeImage: null,
        afterImage: null,
      })),
      knownChats,
      knownMessages,
      updatedAt: new Date().toISOString(),
    };
  }

  private async persistSessionCheckpoint(session: RuntimeSession): Promise<void> {
    if (!isRedisConfigured) {
      return;
    }

    try {
      await redis.set(
        buildCheckpointKey(session.workspaceId),
        JSON.stringify(this.buildPersistedCheckpoint(session)),
        "EX",
        CHECKPOINT_TTL_SECONDS,
      );
    } catch {
      // noop
    }
  }

  private async restoreSessionCheckpoint(
    session: RuntimeSession,
  ): Promise<void> {
    if (!isRedisConfigured) {
      return;
    }

    try {
      const raw = await redis.get(buildCheckpointKey(session.workspaceId));
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as PersistedBrowserCheckpoint;
      session.state = parsed.state || session.state;
      session.takeoverActive = parsed.takeoverActive === true;
      session.agentPaused = parsed.agentPaused === true;
      session.lastError = parsed.lastError || null;
      session.phoneNumber = parsed.phoneNumber || null;
      session.pushName = parsed.pushName || null;
      session.screenshotUpdatedAt = parsed.screenshotUpdatedAt || null;
      session.lastActionAt = parsed.lastActionAt || null;
      session.lastObservationAt = parsed.lastObservationAt || null;
      session.activeProvider = parsed.activeProvider || null;
      session.observation = parsed.observation || session.observation;
      session.proofs = Array.isArray(parsed.proofs)
        ? parsed.proofs.slice(0, MAX_PROOFS)
        : session.proofs;
      session.knownChats = new Map(parsed.knownChats || []);
      session.knownMessages = new Map(parsed.knownMessages || []);
    } catch {
      // noop
    }
  }

  private async clearSessionCheckpoint(workspaceId: string): Promise<void> {
    if (!isRedisConfigured) {
      return;
    }

    try {
      await redis.del(buildCheckpointKey(workspaceId));
    } catch {
      // noop
    }
  }

  private mergeKnownChats(
    session: RuntimeSession,
    visibleChats: BrowserObservedChat[],
  ) {
    for (const chat of visibleChats) {
      const key =
        String(chat?.id || "").trim() ||
        String(chat?.phone || "").trim() ||
        String(chat?.name || "").trim();
      if (!key) {
        continue;
      }
      session.knownChats.set(key, {
        ...(session.knownChats.get(key) || {}),
        ...chat,
      });
    }
  }

  private mergeKnownMessages(
    session: RuntimeSession,
    chatId: string | undefined,
    messages: BrowserObservedMessage[],
  ) {
    const normalizedChatId = toChatId(chatId || "");
    if (!normalizedChatId || !messages.length) {
      return;
    }

    const existing = session.knownMessages.get(normalizedChatId) || [];
    const merged = [...existing, ...messages]
      .filter((message) => String(message?.body || "").trim())
      .slice(-200);
    session.knownMessages.set(normalizedChatId, merged);
  }

  private async createBrowser(workspaceId: string): Promise<RuntimeSession> {
    await this.ensureProfileDir(workspaceId);
    await this.ensureAuditDirs(workspaceId);

    let browser: Browser;
    try {
      browser = await puppeteer.launch({
        headless: HEADLESS_BROWSER,
        userDataDir: this.getProfileDir(workspaceId),
        executablePath: resolveChromiumPath(),
        defaultViewport: {
          width: VIEWPORT_WIDTH,
          height: VIEWPORT_HEIGHT,
        },
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--window-size=1440,900",
          `--user-agent=${CHROME_USER_AGENT}`,
        ],
      });
    } catch (launchError: any) {
      console.error(
        `[session-manager] puppeteer.launch failed for workspace=${workspaceId}: ${launchError?.message}`,
      );
      const failedSession: RuntimeSession = {
        workspaceId,
        browser: null as any,
        page: null as any,
        state: "CRASHED",
        takeoverActive: false,
        agentPaused: false,
        screenshotDataUrl: null,
        screenshotUpdatedAt: null,
        phoneNumber: null,
        pushName: null,
        lastError: launchError?.message || "browser_launch_failed",
        lastActionAt: null,
        lastObservationAt: null,
        activeProvider: null,
        knownChats: new Map<string, any>(),
        knownMessages: new Map<string, any[]>(),
        proofs: [],
        observation: {
          summary: null,
          sessionState: "CRASHED",
          currentChatId: null,
          visibleChats: [],
          visibleMessages: [],
          lastVisibleText: null,
        },
        lastLiveScreenWriteAt: null,
        lastArchivedFrameAt: null,
        actionSequence: 0,
      };
      this.sessions.set(workspaceId, failedSession);
      return failedSession;
    }

    const pages = await browser.pages();
    const page = pages[0] || (await browser.newPage());
    await page.setUserAgent(CHROME_USER_AGENT);

    page.on("error", (error) => {
      const session = this.sessions.get(workspaceId);
      if (session) {
        session.state = "CRASHED";
        session.lastError = error?.message || "page_error";
      }
      void import("./screencast-server")
        .then((module) => module.cleanupScreencast(workspaceId))
        .catch(() => undefined);
    });

    page.on("close", () => {
      const session = this.sessions.get(workspaceId);
      if (session) {
        session.state = "DISCONNECTED";
      }
      void import("./screencast-server")
        .then((module) => module.cleanupScreencast(workspaceId))
        .catch(() => undefined);
    });

    const session: RuntimeSession = {
      workspaceId,
      browser,
      page,
      state: "BOOTING",
      takeoverActive: false,
      agentPaused: false,
      screenshotDataUrl: null,
      screenshotUpdatedAt: null,
      phoneNumber: null,
      pushName: null,
      lastError: null,
      lastActionAt: null,
      lastObservationAt: null,
      activeProvider: null,
      knownChats: new Map<string, any>(),
      knownMessages: new Map<string, any[]>(),
      proofs: [],
      observation: {
        summary: null,
        sessionState: "BOOTING",
        currentChatId: null,
        visibleChats: [],
        visibleMessages: [],
        lastVisibleText: null,
      },
      lastLiveScreenWriteAt: null,
      lastArchivedFrameAt: null,
      actionSequence: 0,
    };

    this.sessions.set(workspaceId, session);
    await this.restoreSessionCheckpoint(session);
    await this.bootstrapPage(session);
    await this.recordProof(workspaceId, {
      kind: "session",
      provider: "system",
      summary: "Sessao do browser iniciada com runtime do WhatsApp Web.",
      metadata: {
        headless: HEADLESS_BROWSER,
      },
    });
    await this.persistSessionCheckpoint(session);
    return session;
  }

  private async bootstrapPage(session: RuntimeSession) {
    session.state = "BOOTING";
    await session.page.goto(WHATSAPP_WEB_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await sleep(2_000);
    await this.refreshSnapshot(session.workspaceId);
  }

  private toSnapshot(
    session: RuntimeSession,
    signals?: {
      title: string;
      currentUrl: string;
    },
  ): BrowserSessionSnapshot {
    return {
      workspaceId: session.workspaceId,
      state: session.state,
      provider: "whatsapp-web-agent",
      connected:
        session.state === "CONNECTED" || session.state === "TAKEOVER",
      phoneNumber: session.phoneNumber || null,
      pushName: session.pushName || null,
      message: session.lastError || null,
      lastError: session.lastError || null,
      currentUrl: signals?.currentUrl || session.page.url() || null,
      title: signals?.title || null,
      screenshotDataUrl: session.screenshotDataUrl || null,
      screenshotUpdatedAt: session.screenshotUpdatedAt || null,
      viewerAvailable: Boolean(session.screenshotDataUrl),
      takeoverActive: session.takeoverActive,
      agentPaused: session.agentPaused,
      lastObservationAt: session.lastObservationAt || null,
      lastActionAt: session.lastActionAt || null,
      observationSummary: session.observation.summary || null,
      activeProvider: session.activeProvider || null,
      proofCount: session.proofs.length,
      viewport: {
        width: VIEWPORT_WIDTH,
        height: VIEWPORT_HEIGHT,
      },
      updatedAt: new Date().toISOString(),
    };
  }

  private async captureScreenshot(page: Page): Promise<string> {
    const base64 = await page.screenshot({
      type: "jpeg",
      quality: 70,
      encoding: "base64",
      fullPage: false,
    });
    return toDataUrl(base64, "image/jpeg");
  }

  private async findComposer(page: Page): Promise<ElementHandle<Element> | null> {
    const selectors = [
      '[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"]',
      'div[role="textbox"]',
      "textarea",
    ];

    for (const selector of selectors) {
      const handle = await page.$(selector);
      if (handle) {
        return handle as ElementHandle<Element>;
      }
    }

    return null;
  }

  private async findSendButton(page: Page): Promise<ElementHandle<Element> | null> {
    const selectors = [
      '[data-testid="send"]',
      '[aria-label*="Send"]',
      '[aria-label*="Enviar"]',
      '[title*="Send"]',
      '[title*="Enviar"]',
      'span[data-icon="send"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="Enviar"]',
    ];

    for (const selector of selectors) {
      const handle = await page.$(selector);
      if (handle) {
        return handle as ElementHandle<Element>;
      }
    }

    return null;
  }

  private randomTypingDelay(): number {
    if (TYPING_DELAY_MAX_MS <= TYPING_DELAY_MIN_MS) {
      return TYPING_DELAY_MIN_MS;
    }

    return (
      TYPING_DELAY_MIN_MS +
      Math.floor(Math.random() * (TYPING_DELAY_MAX_MS - TYPING_DELAY_MIN_MS + 1))
    );
  }

  private async focusComposer(page: Page): Promise<boolean> {
    const composer = await this.findComposer(page);
    if (!composer) {
      return false;
    }

    await composer.click().catch(() => undefined);
    await composer.focus().catch(() => undefined);
    await sleep(COMPOSER_STABILIZE_WAIT_MS);
    return true;
  }

  private async clearFocusedComposer(page: Page): Promise<void> {
    await page
      .evaluate(() => {
        const active = document.activeElement as
          | (HTMLElement & { value?: string })
          | null;
        if (!active) {
          return;
        }

        if (typeof active.value === "string") {
          active.value = "";
          active.dispatchEvent(new Event("input", { bubbles: true }));
          active.dispatchEvent(new Event("change", { bubbles: true }));
          return;
        }

        if (active.isContentEditable) {
          active.textContent = "";
          active.dispatchEvent(new Event("input", { bubbles: true }));
        }
      })
      .catch(() => undefined);
  }

  private async typeMessageWithCadence(page: Page, message: string): Promise<void> {
    for (const character of String(message || "")) {
      if (character === "\n") {
        await page.keyboard.down("Shift");
        await page.keyboard.press("Enter");
        await page.keyboard.up("Shift");
        await sleep(this.randomTypingDelay());
        continue;
      }

      await page.keyboard.type(character, {
        delay: this.randomTypingDelay(),
      });
    }
  }

  private async ensureAttachmentPanel(page: Page): Promise<void> {
    const attachSelectors = [
      '[title*="Attach"]',
      '[title*="Anexar"]',
      '[aria-label*="Attach"]',
      '[aria-label*="Anexar"]',
      '[data-testid="clip"]',
      '[data-icon="clip"]',
      '[data-icon="plus-rounded"]',
    ];

    for (const selector of attachSelectors) {
      const handle = await page.$(selector);
      if (handle) {
        await handle.click().catch(() => undefined);
        await sleep(350);
        break;
      }
    }
  }

  private async findFileInput(
    page: Page,
    mediaType: BrowserSendMediaInput["mediaType"],
  ): Promise<ElementHandle<Element> | null> {
    const allInputs = await page.$$("input[type=\"file\"]");
    const desiredPrefix =
      mediaType === "document"
        ? "application/"
        : mediaType === "audio"
          ? "audio/"
          : mediaType === "video"
            ? "video/"
            : "image/";

    for (const input of allInputs) {
      const accept = await page.evaluate(
        (node) => String((node as any)?.accept || ""),
        input,
      );
      if (!accept || mediaType === "document") {
        return input as ElementHandle<Element>;
      }
      if (accept.includes(desiredPrefix) || accept.includes("*")) {
        return input as ElementHandle<Element>;
      }
    }

    return (allInputs[0] as ElementHandle<Element> | undefined) || null;
  }

  private async downloadMediaToTempFile(
    input: BrowserSendMediaInput,
  ): Promise<{ filePath: string; contentType: string | null }> {
    await this.ensureTempDir(input.workspaceId);

    if (String(input.mediaUrl || "").startsWith("data:")) {
      const match = String(input.mediaUrl).match(
        /^data:([^;,]+)?(?:;base64)?,(.*)$/s,
      );
      if (!match) {
        throw new Error("invalid_data_url");
      }

      const contentType = match[1] || null;
      const payload = match[2] || "";
      const isBase64 = String(input.mediaUrl).includes(";base64,");
      const buffer = isBase64
        ? Buffer.from(payload, "base64")
        : Buffer.from(decodeURIComponent(payload), "utf8");
      const extension = inferExtension(contentType, input.mediaType);
      const filePath = path.join(
        this.getTempDir(input.workspaceId),
        `${createId("media")}${extension}`,
      );
      await fs.writeFile(filePath, buffer);
      return {
        filePath,
        contentType,
      };
    }

    const fetchFn = globalThis.fetch?.bind(globalThis);
    if (!fetchFn) {
      throw new Error("fetch_unavailable");
    }

    const response = await fetchFn(input.mediaUrl);
    if (!response.ok) {
      throw new Error(`media_download_failed_${response.status}`);
    }

    const contentType = response.headers.get("content-type");
    const extension = inferExtension(contentType, input.mediaType);
    const urlHash = createHash("sha1")
      .update(`${input.mediaUrl}:${Date.now()}`)
      .digest("hex")
      .slice(0, 12);
    const filePath = path.join(
      this.getTempDir(input.workspaceId),
      `${urlHash}${extension}`,
    );
    const arrayBuffer = await response.arrayBuffer();
    await fs.writeFile(filePath, Buffer.from(arrayBuffer));

    return {
      filePath,
      contentType,
    };
  }

  private async runActionBatch(
    workspaceId: string,
    actions: BrowserActionInput[],
    actor: "human" | "agent",
    metadata?: Record<string, any>,
  ): Promise<BrowserSessionSnapshot> {
    const session = await this.ensureSession(workspaceId);

    if (actor === "agent" && (session.takeoverActive || session.agentPaused)) {
      throw new Error(
        session.takeoverActive ? "takeover_active" : "agent_paused",
      );
    }

    if (actor === "human") {
      session.takeoverActive = true;
      session.agentPaused = true;
      session.state = "TAKEOVER";
    }

    const beforeImage =
      session.screenshotDataUrl || (await this.captureScreenshot(session.page));
    for (const action of actions) {
      if (actor === "agent") {
        let message = `Executando ${action.type}`;
        if (
          (action.type === "click" || action.type === "double_click") &&
          typeof action.x === "number" &&
          typeof action.y === "number"
        ) {
          message = `Clicando em (${action.x}, ${action.y})`;
        } else if (action.type === "move") {
          message =
            typeof action.x === "number" && typeof action.y === "number"
              ? `Movendo cursor para (${action.x}, ${action.y})`
              : "Movendo cursor";
        } else if (action.type === "type") {
          message = action.text
            ? `Digitando: ${String(action.text).slice(0, 50)}`
            : "Digitando...";
        } else if (action.type === "drag") {
          message = "Arrastando elemento";
        } else if (action.type === "keypress") {
          message = action.key
            ? `Pressionando ${action.key}`
            : "Pressionando tecla";
        } else if (action.type === "scroll") {
          message = "Rolando a tela";
        } else if (action.type === "wait") {
          message = "Aguardando interface estabilizar";
        }

        await publishAgentEvent({
          type: "action",
          workspaceId,
          phase:
            action.type === "type"
              ? "cursor_type"
              : action.type === "click" || action.type === "double_click"
                ? "cursor_move"
                : "cursor_action",
          message,
          meta: {
            cursorX: typeof action.x === "number" ? action.x : undefined,
            cursorY: typeof action.y === "number" ? action.y : undefined,
            toX: typeof action.toX === "number" ? action.toX : undefined,
            toY: typeof action.toY === "number" ? action.toY : undefined,
            actionType: action.type,
            text: typeof action.text === "string" ? action.text : undefined,
          },
        }).catch(() => undefined);
      }

      switch (action.type) {
        case "click":
          if (typeof action.x === "number" && typeof action.y === "number") {
            await session.page.mouse.click(action.x, action.y);
          }
          break;
        case "double_click":
          if (typeof action.x === "number" && typeof action.y === "number") {
            await session.page.mouse.click(action.x, action.y, {
              clickCount: 2,
            });
          }
          break;
        case "move":
          if (typeof action.x === "number" && typeof action.y === "number") {
            await session.page.mouse.move(action.x, action.y);
          }
          break;
        case "drag":
          if (
            typeof action.x === "number" &&
            typeof action.y === "number" &&
            typeof action.toX === "number" &&
            typeof action.toY === "number"
          ) {
            await session.page.mouse.move(action.x, action.y);
            await session.page.mouse.down();
            await session.page.mouse.move(action.toX, action.toY, {
              steps: 12,
            });
            await session.page.mouse.up();
          }
          break;
        case "type":
          await session.page.keyboard.type(String(action.text || ""), {
            delay: 35,
          });
          break;
        case "keypress":
          await session.page.keyboard.press(
            String(action.key || "Enter") as Parameters<
              Page["keyboard"]["press"]
            >[0],
          );
          break;
        case "scroll":
          await session.page.mouse.wheel({
            deltaY: Number(action.deltaY || 250),
          });
          break;
        case "wait":
          await sleep(Math.max(100, Number(action.delayMs || DEFAULT_WAIT_MS)));
          break;
        default:
          break;
      }

      await sleep(150);
    }

    const snapshot = await this.refreshSnapshot(workspaceId);
    session.lastActionAt = new Date().toISOString();
    await this.recordProof(workspaceId, {
      kind: "action",
      provider: actor,
      summary: `${actor === "human" ? "Takeover" : "Agente"} executou ${
        actions.length
      } acao(oes).`,
      beforeImage,
      afterImage: snapshot.screenshotDataUrl || null,
      action: actions,
      metadata,
    });
    return snapshot;
  }

  async ensureSession(workspaceId: string): Promise<RuntimeSession> {
    const existing = this.sessions.get(workspaceId);
    if (existing) {
      return existing;
    }

    return this.createBrowser(workspaceId);
  }

  listActiveWorkspaceIds(): string[] {
    return Array.from(this.sessions.keys());
  }

  getPageSync(workspaceId: string): Page | null {
    const session = this.sessions.get(workspaceId);
    return session?.page || null;
  }

  async storeScreencastFrame(
    workspaceId: string,
    base64Jpeg: string,
  ): Promise<void> {
    const session = this.sessions.get(workspaceId);
    if (!session || !base64Jpeg) {
      return;
    }

    const dataUrl = toDataUrl(base64Jpeg, "image/jpeg");
    session.screenshotDataUrl = dataUrl;
    session.screenshotUpdatedAt = new Date().toISOString();
    await this.persistLiveScreenArtifacts(session, dataUrl, {
      source: "screencast",
      captureHistory: true,
    });
  }

  async startSession(workspaceId: string): Promise<BrowserSessionSnapshot> {
    await this.ensureSession(workspaceId);
    return this.getSnapshot(workspaceId, true);
  }

  async getSnapshot(
    workspaceId: string,
    refresh = false,
  ): Promise<BrowserSessionSnapshot> {
    const session = await this.ensureSession(workspaceId);
    if (refresh) {
      await this.refreshSnapshot(workspaceId);
    }

    return this.toSnapshot(session);
  }

  async captureWorkspaceScreenshot(
    workspaceId: string,
    refresh = true,
  ): Promise<string | null> {
    const snapshot = await this.getSnapshot(workspaceId, refresh);
    return snapshot.screenshotDataUrl || null;
  }

  async refreshSnapshot(workspaceId: string): Promise<BrowserSessionSnapshot> {
    const session = await this.ensureSession(workspaceId);

    try {
      const previousState = session.state;
      const signals = await readWhatsAppSignals(session.page);
      if (signals.connected) {
        session.state = session.takeoverActive ? "TAKEOVER" : "CONNECTED";
      } else if (signals.qrPending) {
        session.state = "QR_PENDING";
      } else {
        session.state = "BOOTING";
      }

      if (
        session.state === "CONNECTED" &&
        previousState !== "CONNECTED" &&
        previousState !== "TAKEOVER"
      ) {
        void this.notifyBackendConnected(workspaceId, session).catch(() => {});
        void import("./observer-loop")
          .then((m) => m.browserObserverLoop.start())
          .catch(() => {});
      }

      session.screenshotDataUrl = await this.captureScreenshot(session.page);
      session.screenshotUpdatedAt = new Date().toISOString();
      session.lastError = null;
      session.observation = {
        ...session.observation,
        sessionState: session.state,
        currentChatId:
          session.observation.currentChatId || signals.activeChatId || null,
        visibleChats: signals.visibleChats,
        visibleMessages: signals.visibleMessages,
        lastVisibleText: summarizeText(signals.bodyText, VISIBLE_TEXT_LIMIT),
      };
      this.mergeKnownChats(session, signals.visibleChats);
      this.mergeKnownMessages(
        session,
        signals.activeChatId || undefined,
        signals.visibleMessages,
      );
      await this.persistLiveScreenArtifacts(
        session,
        session.screenshotDataUrl,
        {
          source: "snapshot",
          captureHistory: true,
          forceLiveWrite: true,
          timestamp: session.screenshotUpdatedAt,
        },
      );
      await this.persistSessionCheckpoint(session);
      return this.toSnapshot(session, signals);
    } catch (error: any) {
      session.state = "CRASHED";
      session.lastError = error?.message || "snapshot_failed";
      void import("./screencast-server")
        .then((module) => module.cleanupScreencast(workspaceId))
        .catch(() => undefined);
      await this.persistSessionCheckpoint(session);
      return this.toSnapshot(session);
    }
  }

  async getQrCode(workspaceId: string): Promise<BrowserSessionSnapshot> {
    return this.refreshSnapshot(workspaceId);
  }

  async getObservationContext(workspaceId: string): Promise<{
    snapshot: BrowserSessionSnapshot;
    visibleText: string;
    visibleChats: BrowserObservedChat[];
    visibleMessages: BrowserObservedMessage[];
    currentChatId?: string | null;
  }> {
    const session = await this.ensureSession(workspaceId);
    const signals = await readWhatsAppSignals(session.page);
    const snapshot = await this.refreshSnapshot(workspaceId);
    return {
      snapshot,
      visibleText: summarizeText(signals.bodyText, VISIBLE_TEXT_LIMIT),
      visibleChats: signals.visibleChats,
      visibleMessages: signals.visibleMessages,
      currentChatId: signals.activeChatId || null,
    };
  }

  async applyObservationResult(
    workspaceId: string,
    result: BrowserObservationResult,
  ): Promise<BrowserSessionSnapshot> {
    const session = await this.ensureSession(workspaceId);
    session.activeProvider = result.provider;
    session.lastObservationAt = new Date().toISOString();
    session.observation = {
      summary: result.summary,
      sessionState: result.sessionState,
      currentChatId: result.currentChatId || null,
      visibleChats: result.visibleChats || [],
      visibleMessages: result.visibleMessages || [],
      lastVisibleText:
        session.observation.lastVisibleText || session.observation.summary || null,
    };
    this.mergeKnownChats(session, result.visibleChats || []);
    this.mergeKnownMessages(
      session,
      result.currentChatId || undefined,
      result.visibleMessages || [],
    );
    await this.persistSessionCheckpoint(session);
    return this.getSnapshot(workspaceId, false);
  }

  async recordProof(
    workspaceId: string,
    input: Omit<BrowserProofEntry, "id" | "workspaceId" | "createdAt">,
  ): Promise<BrowserProofEntry> {
    const session = await this.ensureSession(workspaceId);
    const entry: BrowserProofEntry = {
      id: createId("proof"),
      workspaceId,
      createdAt: new Date().toISOString(),
      ...input,
    };
    session.proofs.unshift(entry);
    session.proofs = session.proofs.slice(0, MAX_PROOFS);
    await this.persistSessionCheckpoint(session);
    await this.persistProofArtifacts(session, entry).catch(() => undefined);
    return entry;
  }

  async getProofs(workspaceId: string, limit = 25): Promise<BrowserProofEntry[]> {
    const session = await this.ensureSession(workspaceId);
    return session.proofs.slice(0, Math.max(1, limit));
  }

  async setAgentPaused(
    workspaceId: string,
    active: boolean,
  ): Promise<BrowserSessionSnapshot> {
    const session = await this.ensureSession(workspaceId);
    session.agentPaused = active;
    if (!session.takeoverActive && session.state === "TAKEOVER" && !active) {
      session.state = "CONNECTED";
    }
    const snapshot = await this.refreshSnapshot(workspaceId);
    await this.recordProof(workspaceId, {
      kind: "pause",
      provider: "system",
      summary: active ? "Agente pausado." : "Agente retomado.",
      afterImage: snapshot.screenshotDataUrl || null,
      metadata: {
        agentPaused: active,
      },
    });
    return snapshot;
  }

  async reconcileSession(
    workspaceId: string,
    metadata?: Record<string, any>,
  ): Promise<BrowserSessionSnapshot> {
    const snapshot = await this.refreshSnapshot(workspaceId);
    await this.recordProof(workspaceId, {
      kind: "reconcile",
      provider: "system",
      summary: "Reconciliei o estado visual da sessao.",
      afterImage: snapshot.screenshotDataUrl || null,
      metadata,
    });
    return snapshot;
  }

  private rememberOutboundText(
    session: RuntimeSession,
    input: BrowserSendTextInput,
    messageId: string,
    phone: string,
  ) {
    const chatId = toChatId(input.chatId || phone);
    const now = Date.now();
    const existingChat = session.knownChats.get(chatId) || {};
    session.knownChats.set(chatId, {
      id: chatId,
      chatId,
      phone,
      name: existingChat?.name || phone,
      unreadCount: 0,
      timestamp: now,
      lastMessageFromMe: true,
      lastMessage: {
        fromMe: true,
        body: input.message,
        timestamp: Math.floor(now / 1000),
      },
    });
    const history = session.knownMessages.get(chatId) || [];
    history.push({
      id: messageId,
      chatId,
      from: session.phoneNumber ? `${session.phoneNumber}@c.us` : undefined,
      to: chatId,
      fromMe: true,
      body: input.message,
      type: "chat",
      hasMedia: false,
      timestamp: Math.floor(now / 1000),
      createdAt: new Date(now).toISOString(),
    });
    session.knownMessages.set(chatId, history.slice(-200));
  }

  async sendText(input: BrowserSendTextInput): Promise<{
    success: boolean;
    message?: string;
    messageId?: string;
  }> {
    const session = await this.ensureSession(input.workspaceId);
    await this.refreshSnapshot(input.workspaceId);

    if (session.takeoverActive || session.agentPaused) {
      return {
        success: false,
        message: session.takeoverActive ? "takeover_active" : "agent_paused",
      };
    }

    if (
      session.state !== "CONNECTED" &&
      session.state !== "TAKEOVER" &&
      session.state !== "BOOTING"
    ) {
      return {
        success: false,
        message: "session_not_connected",
      };
    }

    const phone = normalizePhone(input.to);
    if (!phone) {
      return {
        success: false,
        message: "invalid_phone",
      };
    }

    const beforeImage =
      session.screenshotDataUrl || (await this.captureScreenshot(session.page));

    try {
      let navigationProvider: ComputerUseProvider | "system" = "system";
      let sendClickProvider: ComputerUseProvider | "system" = "system";
      let sendStrategy = "local_send_button";

      try {
        const { computerUseOrchestrator } = await import(
          "./computer-use-orchestrator"
        );
        const navigationTurn = await computerUseOrchestrator.runNavigateTurn(
          input.workspaceId,
          [
            `Abra ou localize a conversa do numero ${phone} no WhatsApp Web.`,
            "Clique na caixa de texto da conversa.",
            "Deixe o compositor pronto para digitacao.",
            "Nao escreva a resposta no compositor e nao envie nenhuma mensagem ainda.",
          ].join(" "),
          false,
        );
        navigationProvider = navigationTurn.provider;
      } catch (computerUseError: any) {
        await this.recordProof(input.workspaceId, {
          kind: "send_text",
          provider: "system",
          summary: `Fallback local acionado para focar o compositor de ${phone}.`,
          beforeImage,
          metadata: {
            to: phone,
            strategy: "navigate_failed_fallback_local",
            error: String(
              computerUseError?.message || computerUseError || "unknown_error",
            ),
          },
        });
      }

      let composerReady = await this.focusComposer(session.page);
      if (!composerReady) {
        const targetUrl = `${WHATSAPP_WEB_URL}/send?phone=${encodeURIComponent(
          phone,
        )}`;
        await session.page.goto(targetUrl, {
          waitUntil: "domcontentloaded",
          timeout: 60_000,
        });
        await sleep(1_500);
        composerReady = await this.focusComposer(session.page);
      }

      if (!composerReady) {
        throw new Error("composer_not_found");
      }
      await this.clearFocusedComposer(session.page);
      await this.typeMessageWithCadence(session.page, input.message);
      await sleep(COMPOSER_STABILIZE_WAIT_MS);

      const sendButton = await this.findSendButton(session.page);
      const clickedLocally = sendButton
        ? await sendButton
            .click()
            .then(() => true)
            .catch(() => false)
        : false;
      if (!clickedLocally) {
        try {
          const { computerUseOrchestrator } = await import(
            "./computer-use-orchestrator"
          );
          const sendTurn = await computerUseOrchestrator.runNavigateTurn(
            input.workspaceId,
            [
              "Clique no botao de enviar da conversa atual.",
              "Nao altere o texto digitado no compositor.",
              "Nao mude de conversa.",
            ].join(" "),
            false,
          );
          sendClickProvider = sendTurn.provider;
          sendStrategy = "computer_use_send_click";
        } catch {
          await session.page.keyboard.press("Enter");
          sendStrategy = "enter_fallback";
        }
      }
      await sleep(750);

      const messageId = `local-${Date.now()}`;
      this.rememberOutboundText(session, input, messageId, phone);

      const snapshot = await this.refreshSnapshot(input.workspaceId);
      session.lastActionAt = new Date().toISOString();
      await this.recordProof(input.workspaceId, {
        kind: "send_text",
        provider: "system",
        summary: `Enviei mensagem para ${phone}.`,
        beforeImage,
        afterImage: snapshot.screenshotDataUrl || null,
        metadata: {
          to: phone,
          chatId: toChatId(input.chatId || phone),
          messageLength: input.message.length,
          quotedMessageId: input.quotedMessageId || null,
          actorChain: ["computer_use", "browser_typing", "computer_use"],
          navigationProvider,
          sendClickProvider,
          strategy: `hybrid_navigate_type_click:${sendStrategy}`,
        },
      });

      return {
        success: true,
        messageId,
      };
    } catch (error: any) {
      session.lastError = error?.message || "send_failed";
      const snapshot = await this.refreshSnapshot(input.workspaceId);
      await this.recordProof(input.workspaceId, {
        kind: "send_text",
        provider: "system",
        summary: `Falha ao enviar mensagem para ${phone}.`,
        beforeImage,
        afterImage: snapshot.screenshotDataUrl || null,
        metadata: {
          to: phone,
          error: session.lastError || "send_failed",
        },
      });
      return {
        success: false,
        message: session.lastError || "send_failed",
      };
    }
  }

  async sendMedia(input: BrowserSendMediaInput): Promise<{
    success: boolean;
    message?: string;
    messageId?: string;
  }> {
    const session = await this.ensureSession(input.workspaceId);
    await this.refreshSnapshot(input.workspaceId);

    if (session.takeoverActive || session.agentPaused) {
      return {
        success: false,
        message: session.takeoverActive ? "takeover_active" : "agent_paused",
      };
    }

    if (
      session.state !== "CONNECTED" &&
      session.state !== "TAKEOVER" &&
      session.state !== "BOOTING"
    ) {
      return {
        success: false,
        message: "session_not_connected",
      };
    }

    const phone = normalizePhone(input.to);
    if (!phone) {
      return {
        success: false,
        message: "invalid_phone",
      };
    }

    const beforeImage =
      session.screenshotDataUrl || (await this.captureScreenshot(session.page));
    let tempFilePath: string | null = null;

    try {
      tempFilePath = (await this.downloadMediaToTempFile(input)).filePath;

      await session.page.goto(
        `${WHATSAPP_WEB_URL}/send?phone=${encodeURIComponent(phone)}`,
        {
          waitUntil: "domcontentloaded",
          timeout: 60_000,
        },
      );
      await sleep(1_500);

      await this.ensureAttachmentPanel(session.page);
      let fileInput = await this.findFileInput(session.page, input.mediaType);
      if (!fileInput) {
        await this.ensureAttachmentPanel(session.page);
        fileInput = await this.findFileInput(session.page, input.mediaType);
      }

      if (!fileInput) {
        throw new Error("media_input_not_found");
      }

      await (fileInput as any).uploadFile(tempFilePath);
      await sleep(1_500);

      if (input.caption) {
        const composer = await this.findComposer(session.page);
        if (composer) {
          await composer.focus().catch(() => undefined);
          await session.page.keyboard.type(input.caption, {
            delay: 30,
          });
          await sleep(300);
        }
      }

      const sendButton = await this.findSendButton(session.page);
      if (sendButton) {
        await sendButton.click().catch(() => undefined);
      } else {
        await session.page.keyboard.press("Enter");
      }
      await sleep(1_000);

      const chatId = toChatId(input.chatId || phone);
      const now = Date.now();
      const existingChat = session.knownChats.get(chatId) || {};
      session.knownChats.set(chatId, {
        id: chatId,
        chatId,
        phone,
        name: existingChat?.name || phone,
        unreadCount: 0,
        timestamp: now,
        lastMessageFromMe: true,
        lastMessage: {
          fromMe: true,
          body: input.caption || `[${input.mediaType}]`,
          timestamp: Math.floor(now / 1000),
          hasMedia: true,
          mediaType: input.mediaType,
        },
      });
      const history = session.knownMessages.get(chatId) || [];
      const messageId = `local-media-${now}`;
      history.push({
        id: messageId,
        chatId,
        from: session.phoneNumber ? `${session.phoneNumber}@c.us` : undefined,
        to: chatId,
        fromMe: true,
        body: input.caption || "",
        type: input.mediaType,
        hasMedia: true,
        mediaUrl: input.mediaUrl,
        timestamp: Math.floor(now / 1000),
        createdAt: new Date(now).toISOString(),
      });
      session.knownMessages.set(chatId, history.slice(-200));

      const snapshot = await this.refreshSnapshot(input.workspaceId);
      session.lastActionAt = new Date().toISOString();
      await this.recordProof(input.workspaceId, {
        kind: "send_media",
        provider: "system",
        summary: `Enviei ${input.mediaType} para ${phone}.`,
        beforeImage,
        afterImage: snapshot.screenshotDataUrl || null,
        metadata: {
          to: phone,
          chatId,
          mediaType: input.mediaType,
          captionLength: input.caption?.length || 0,
          quotedMessageId: input.quotedMessageId || null,
        },
      });

      return {
        success: true,
        messageId,
      };
    } catch (error: any) {
      session.lastError = error?.message || "send_media_failed";
      const snapshot = await this.refreshSnapshot(input.workspaceId);
      await this.recordProof(input.workspaceId, {
        kind: "send_media",
        provider: "system",
        summary: `Falha ao enviar ${input.mediaType} para ${phone}.`,
        beforeImage,
        afterImage: snapshot.screenshotDataUrl || null,
        metadata: {
          to: phone,
          mediaType: input.mediaType,
          error: session.lastError || "send_media_failed",
        },
      });
      return {
        success: false,
        message: session.lastError || "send_media_failed",
      };
    } finally {
      if (tempFilePath) {
        await fs.rm(tempFilePath, { force: true }).catch(() => undefined);
      }
    }
  }

  async performAction(
    workspaceId: string,
    action: BrowserActionInput,
  ): Promise<BrowserSessionSnapshot> {
    return this.runActionBatch(workspaceId, [action], "human", {
      source: "viewer",
    });
  }

  async performAgentActions(
    workspaceId: string,
    actions: BrowserActionInput[],
    metadata?: Record<string, any>,
  ): Promise<BrowserSessionSnapshot> {
    return this.runActionBatch(workspaceId, actions, "agent", metadata);
  }

  async setTakeover(
    workspaceId: string,
    active: boolean,
  ): Promise<BrowserSessionSnapshot> {
    const session = await this.ensureSession(workspaceId);
    session.takeoverActive = active;
    session.agentPaused = active;
    if (!active && session.state === "TAKEOVER") {
      session.state = "CONNECTED";
    }
    const snapshot = await this.refreshSnapshot(workspaceId);
    await this.recordProof(workspaceId, {
      kind: "takeover",
      provider: "human",
      summary: active
        ? "Controle humano assumido."
        : "Controle devolvido ao agente.",
      afterImage: snapshot.screenshotDataUrl || null,
      metadata: {
        takeoverActive: active,
      },
    });
    return snapshot;
  }

  async disconnect(workspaceId: string): Promise<BrowserSessionSnapshot> {
    const session = await this.ensureSession(workspaceId);
    session.state = "DISCONNECTED";
    session.agentPaused = true;
    session.takeoverActive = false;
    void import("./screencast-server")
      .then((module) => module.cleanupScreencast(workspaceId))
      .catch(() => undefined);
    await this.persistSessionCheckpoint(session);
    await session.browser.close().catch(() => undefined);
    this.sessions.delete(workspaceId);
    return {
      workspaceId,
      state: "DISCONNECTED",
      provider: "whatsapp-web-agent",
      connected: false,
      phoneNumber: null,
      pushName: null,
      message: null,
      lastError: null,
      currentUrl: null,
      title: null,
      screenshotDataUrl: null,
      screenshotUpdatedAt: null,
      viewerAvailable: false,
      takeoverActive: false,
      agentPaused: true,
      lastObservationAt: null,
      lastActionAt: null,
      observationSummary: null,
      activeProvider: null,
      proofCount: 0,
      viewport: {
        width: VIEWPORT_WIDTH,
        height: VIEWPORT_HEIGHT,
      },
      updatedAt: new Date().toISOString(),
    };
  }

  async logout(workspaceId: string): Promise<BrowserSessionSnapshot> {
    await this.disconnect(workspaceId).catch(() => undefined);
    void import("./screencast-server")
      .then((module) => module.cleanupScreencast(workspaceId))
      .catch(() => undefined);
    await fs.rm(this.getProfileDir(workspaceId), {
      recursive: true,
      force: true,
    });
    await this.clearSessionCheckpoint(workspaceId);
    return {
      workspaceId,
      state: "DISCONNECTED",
      provider: "whatsapp-web-agent",
      connected: false,
      phoneNumber: null,
      pushName: null,
      message: "logged_out",
      lastError: null,
      currentUrl: null,
      title: null,
      screenshotDataUrl: null,
      screenshotUpdatedAt: null,
      viewerAvailable: false,
      takeoverActive: false,
      agentPaused: true,
      lastObservationAt: null,
      lastActionAt: null,
      observationSummary: null,
      activeProvider: null,
      proofCount: 0,
      viewport: {
        width: VIEWPORT_WIDTH,
        height: VIEWPORT_HEIGHT,
      },
      updatedAt: new Date().toISOString(),
    };
  }

  async getChats(workspaceId: string): Promise<any[]> {
    const session = await this.ensureSession(workspaceId);
    await this.refreshSnapshot(workspaceId);

    if (session.state !== "CONNECTED" && session.state !== "TAKEOVER") {
      return [];
    }

    const merged = new Map<string, any>();
    for (const chat of session.knownChats.values()) {
      merged.set(String(chat.id || chat.chatId || ""), chat);
    }
    for (const chat of session.observation.visibleChats) {
      const key =
        String(chat?.id || "").trim() ||
        String(chat?.phone || "").trim() ||
        String(chat?.name || "").trim();
      if (!key) {
        continue;
      }
      merged.set(key, {
        ...(merged.get(key) || {}),
        ...chat,
      });
    }

    return Array.from(merged.values());
  }

  async getChatMessages(
    workspaceId: string,
    chatId?: string,
    options?: { limit?: number; offset?: number; downloadMedia?: boolean },
  ): Promise<any[]> {
    const session = await this.ensureSession(workspaceId);
    await this.refreshSnapshot(workspaceId);

    if (session.state !== "CONNECTED" && session.state !== "TAKEOVER") {
      return [];
    }

    const normalizedChatId = toChatId(chatId || "");
    const stored = normalizedChatId
      ? session.knownMessages.get(normalizedChatId) || []
      : Array.from(session.knownMessages.values()).flat();
    const observed = session.observation.visibleMessages || [];
    const merged = [...stored, ...observed];
    const offset = Math.max(0, Number(options?.offset || 0) || 0);
    const limit = Math.max(1, Number(options?.limit || 100) || 100);
    return merged.slice(offset, offset + limit);
  }

  /**
   * Notify the backend that the WhatsApp Web browser session is now connected.
   * This updates providerSettings.whatsappApiSession.status and auto-activates
   * the autopilot (autonomy.mode = LIVE) so the agent starts acting.
   */
  private async notifyBackendConnected(
    workspaceId: string,
    session: BrowserSession,
  ): Promise<void> {
    const backendUrl = (
      process.env.BACKEND_URL ||
      process.env.API_URL ||
      process.env.SERVICE_BASE_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      ""
    )
      .trim()
      .replace(/\/+$/, "");

    if (!backendUrl) return;

    const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || "";
    const log = new (await import("../logger")).WorkerLogger(
      "session-manager-notify",
    );

    try {
      const res = await fetch(
        `${backendUrl}/internal/whatsapp-runtime/session-connected`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(INTERNAL_API_KEY
              ? { "X-Internal-Key": INTERNAL_API_KEY }
              : {}),
          },
          body: JSON.stringify({
            workspaceId,
            phoneNumber: session.phoneNumber || null,
            pushName: session.pushName || null,
          }),
        },
      );

      if (res.ok) {
        log.info("backend_notified_connected", {
          workspaceId,
          pushName: session.pushName,
        });
        void publishAgentEvent({
          type: "status",
          workspaceId,
          phase: "autopilot_activated",
          message:
            "Autopilot ativado automaticamente. O agente agora responde mensagens.",
        }).catch(() => {});
      } else {
        log.warn("backend_notify_connected_failed", {
          workspaceId,
          status: res.status,
          body: await res.text().catch(() => ""),
        });
      }
    } catch (err: any) {
      log.warn("backend_notify_connected_error", {
        workspaceId,
        error: err?.message,
      });
    }
  }
}

export const browserSessionManager = new BrowserSessionManager();
