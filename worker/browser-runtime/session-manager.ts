import fs from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import puppeteer, { Browser, ElementHandle, Page } from "puppeteer";
import {
  BrowserActionInput,
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
} from "./types";
import { isRedisConfigured, redis } from "../redis-client";

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
const HEADLESS_BROWSER =
  String(process.env.WHATSAPP_BROWSER_HEADLESS || "true").trim() !== "false";
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

    const browser = await puppeteer.launch({
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
      ],
    });

    const pages = await browser.pages();
    const page = pages[0] || (await browser.newPage());

    page.on("error", (error) => {
      const session = this.sessions.get(workspaceId);
      if (session) {
        session.state = "CRASHED";
        session.lastError = error?.message || "page_error";
      }
    });

    page.on("close", () => {
      const session = this.sessions.get(workspaceId);
      if (session) {
        session.state = "DISCONNECTED";
      }
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
    };

    this.sessions.set(workspaceId, session);
    await this.restoreSessionCheckpoint(session);
    await this.bootstrapPage(session);
    await this.recordProof(workspaceId, {
      kind: "session",
      provider: "system",
      summary: "Sessao do browser iniciada.",
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
      const signals = await readWhatsAppSignals(session.page);
      if (signals.connected) {
        session.state = session.takeoverActive ? "TAKEOVER" : "CONNECTED";
      } else if (signals.qrPending) {
        session.state = "QR_PENDING";
      } else {
        session.state = "BOOTING";
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
      await this.persistSessionCheckpoint(session);
      return this.toSnapshot(session, signals);
    } catch (error: any) {
      session.state = "CRASHED";
      session.lastError = error?.message || "snapshot_failed";
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
      const targetUrl = `${WHATSAPP_WEB_URL}/send?phone=${encodeURIComponent(
        phone,
      )}&text=${encodeURIComponent(input.message)}`;
      await session.page.goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await sleep(1_500);

      const composer = await this.findComposer(session.page);
      if (composer) {
        await composer.focus().catch(() => undefined);
      }
      await session.page.keyboard.press("Enter");
      await sleep(750);

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
      const messageId = `local-${now}`;
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
          chatId,
          messageLength: input.message.length,
          quotedMessageId: input.quotedMessageId || null,
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
}

export const browserSessionManager = new BrowserSessionManager();
