import crypto from "crypto";
import { WorkerLogger } from "../logger";

const log = new WorkerLogger("browser-inbound-bridge");
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || "";

function resolveBackendUrl(): string | null {
  const configured =
    process.env.BACKEND_URL ||
    process.env.API_URL ||
    process.env.SERVICE_BASE_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "";
  const normalized = configured.trim().replace(/\/+$/, "");
  return normalized || null;
}

export interface BrowserInboundPayload {
  workspaceId: string;
  provider: "whatsapp-web-agent";
  ingestMode: "live";
  providerMessageId: string;
  from: string;
  to?: string;
  senderName?: string;
  type: "text";
  text: string;
  raw?: Record<string, any>;
}

export function buildSyntheticProviderMessageId(input: {
  workspaceId: string;
  chatId?: string | null;
  from: string;
  text: string;
  sourceId?: string | null;
}): string {
  const stableSourceId =
    String(input.sourceId || "").startsWith("visible-message-")
      ? ""
      : String(input.sourceId || "").trim();
  const payload = [
    input.workspaceId,
    input.chatId || "",
    input.from,
    stableSourceId,
    input.text.trim(),
  ].join("|");

  return `webagent-${crypto.createHash("sha1").update(payload).digest("hex")}`;
}

export async function ingestBrowserInbound(
  payload: BrowserInboundPayload,
): Promise<boolean> {
  const backendUrl = resolveBackendUrl();

  if (!backendUrl) {
    log.warn("browser_inbound_backend_url_missing", {
      workspaceId: payload.workspaceId,
    });
    return false;
  }

  try {
    const response = await fetch(`${backendUrl}/internal/whatsapp-runtime/inbound`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(INTERNAL_API_KEY ? { "X-Internal-Key": INTERNAL_API_KEY } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      log.warn("browser_inbound_request_failed", {
        workspaceId: payload.workspaceId,
        status: response.status,
        body: body.slice(0, 300),
      });
      return false;
    }

    return true;
  } catch (error: any) {
    log.warn("browser_inbound_request_error", {
      workspaceId: payload.workspaceId,
      error: error?.message || "unknown_error",
    });
    return false;
  }
}
