import crypto from "crypto";
import http from "http";
import { browserSessionManager } from "./session-manager";

const SCREENCAST_PORT = Math.max(
  1,
  parseInt(process.env.SCREENCAST_WS_PORT || "3004", 10) || 3004,
);
const SCREENCAST_QUALITY = Math.max(
  30,
  Math.min(100, parseInt(process.env.SCREENCAST_QUALITY || "70", 10) || 70),
);
const SCREENCAST_MAX_WIDTH = Math.max(
  640,
  parseInt(process.env.SCREENCAST_MAX_WIDTH || "1440", 10) || 1440,
);
const SCREENCAST_MAX_HEIGHT = Math.max(
  480,
  parseInt(process.env.SCREENCAST_MAX_HEIGHT || "900", 10) || 900,
);
const SCREENCAST_EVERY_NTH_FRAME = Math.max(
  1,
  parseInt(process.env.SCREENCAST_EVERY_NTH_FRAME || "1", 10) || 1,
);
const SCREENCAST_REQUIRE_TOKEN =
  String(process.env.SCREENCAST_REQUIRE_TOKEN || "false").trim() === "true";
const SCREENCAST_SHARED_SECRET = String(
  process.env.SCREENCAST_SHARED_SECRET || process.env.INTERNAL_API_KEY || "",
).trim();
const SCREENCAST_MAX_VIEWERS_PER_WORKSPACE = Math.max(
  1,
  parseInt(process.env.SCREENCAST_MAX_VIEWERS_PER_WORKSPACE || "4", 10) || 4,
);
const PUBLIC_PORT = Math.max(
  0,
  parseInt(process.env.PORT || "0", 10) || 0,
);
const SCREENCAST_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

interface WorkspaceStream {
  workspaceId: string;
  cdpSession: any | null;
  clients: Set<any>;
  active: boolean;
}

const streams = new Map<string, WorkspaceStream>();
let serverStarted = false;

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4;
  const padded =
    padding === 0 ? normalized : normalized.padEnd(normalized.length + (4 - padding), "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

function validateSignedToken(
  workspaceId: string,
  token: string,
): { ok: boolean; reason: string } {
  if (!SCREENCAST_SHARED_SECRET) {
    return {
      ok: !SCREENCAST_REQUIRE_TOKEN || Boolean(token),
      reason: SCREENCAST_REQUIRE_TOKEN && !token ? "missing_token" : "ok",
    };
  }

  const [payloadPart, signaturePart] = String(token || "").split(".");
  if (!payloadPart || !signaturePart) {
    return { ok: false, reason: "malformed_token" };
  }

  const expectedSignature = crypto
    .createHmac("sha256", SCREENCAST_SHARED_SECRET)
    .update(payloadPart)
    .digest("base64url");

  const signatureBuffer = Buffer.from(signaturePart);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return { ok: false, reason: "invalid_signature" };
  }

  try {
    const payload = JSON.parse(decodeBase64Url(payloadPart)) as {
      workspaceId?: string;
      exp?: number;
    };

    if (String(payload?.workspaceId || "").trim() !== workspaceId) {
      return { ok: false, reason: "workspace_mismatch" };
    }

    const expiresAt = Number(payload?.exp || 0);
    if (!Number.isFinite(expiresAt)) {
      return { ok: false, reason: "missing_exp" };
    }

    return expiresAt > Math.floor(Date.now() / 1000)
      ? { ok: true, reason: "ok" }
      : { ok: false, reason: "expired_token" };
  } catch {
    return { ok: false, reason: "invalid_payload" };
  }
}

function createAcceptValue(key: string): string {
  return crypto
    .createHash("sha1")
    .update(`${key}${SCREENCAST_GUID}`)
    .digest("base64");
}

function createTextFrame(payload: string): Buffer {
  const data = Buffer.from(payload);

  if (data.length < 126) {
    return Buffer.concat([Buffer.from([0x81, data.length]), data]);
  }

  if (data.length < 65536) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(data.length, 2);
    return Buffer.concat([header, data]);
  }

  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(data.length), 2);
  return Buffer.concat([header, data]);
}

function createCloseFrame(code: number, reason = ""): Buffer {
  const reasonBytes = Buffer.from(reason);
  const payload = Buffer.alloc(2 + reasonBytes.length);
  payload.writeUInt16BE(code, 0);
  reasonBytes.copy(payload, 2);

  if (payload.length < 126) {
    return Buffer.concat([Buffer.from([0x88, payload.length]), payload]);
  }

  const header = Buffer.alloc(4);
  header[0] = 0x88;
  header[1] = 126;
  header.writeUInt16BE(payload.length, 2);
  return Buffer.concat([header, payload]);
}

function createControlFrame(opcode: number, payload = Buffer.alloc(0)): Buffer {
  const safePayload = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);

  if (safePayload.length < 126) {
    return Buffer.concat([
      Buffer.from([0x80 | opcode, safePayload.length]),
      safePayload,
    ]);
  }

  const header = Buffer.alloc(4);
  header[0] = 0x80 | opcode;
  header[1] = 126;
  header.writeUInt16BE(safePayload.length, 2);
  return Buffer.concat([header, safePayload]);
}

function closeClient(socket: any, code: number, reason: string) {
  try {
    socket.write(createCloseFrame(code, reason));
  } catch {
    // noop
  }
  socket.end();
}

function rejectUpgrade(
  socket: any,
  statusCode: number,
  reason: string,
): void {
  socket.write(
    [
      `HTTP/1.1 ${statusCode} ${reason}`,
      "Connection: close",
      "Content-Type: text/plain; charset=utf-8",
      `Content-Length: ${Buffer.byteLength(reason)}`,
      "",
      reason,
    ].join("\r\n"),
  );
  socket.destroy();
}

async function stopWorkspaceStream(
  workspaceId: string,
  stream?: WorkspaceStream | null,
): Promise<void> {
  const target = stream || streams.get(workspaceId);
  if (!target) {
    return;
  }

  try {
    if (target.cdpSession) {
      await target.cdpSession
        .send("Page.stopScreencast")
        .catch(() => undefined);
      await target.cdpSession.detach().catch(() => undefined);
    }
  } catch {
    // noop
  }

  for (const client of target.clients) {
    try {
      client.end();
    } catch {
      // noop
    }
  }

  target.clients.clear();
  target.cdpSession = null;
  target.active = false;
  streams.delete(workspaceId);
}

async function startWorkspaceStream(
  workspaceId: string,
  stream: WorkspaceStream,
): Promise<void> {
  if (stream.active) {
    return;
  }

  const page = browserSessionManager.getPageSync(workspaceId);
  if (!page) {
    for (const client of stream.clients) {
      closeClient(client, 4404, "session_not_found");
    }
    streams.delete(workspaceId);
    return;
  }

  try {
    const cdpSession = await page.createCDPSession();
    stream.cdpSession = cdpSession;
    stream.active = true;

    cdpSession.on("Page.screencastFrame", (frame: any) => {
      const payload = String(frame?.data || "");
      if (!payload) {
        void cdpSession
          .send("Page.screencastFrameAck", {
            sessionId: frame?.sessionId,
          })
          .catch(() => undefined);
        return;
      }

      void browserSessionManager
        .storeScreencastFrame(workspaceId, payload)
        .catch(() => undefined);

      const wsFrame = createTextFrame(payload);
      for (const client of stream.clients) {
        if (client.destroyed || !client.writable) {
          continue;
        }
        try {
          client.write(wsFrame);
        } catch {
          client.destroy();
        }
      }

      void cdpSession
        .send("Page.screencastFrameAck", {
          sessionId: frame?.sessionId,
        })
        .catch(() => undefined);
    });

    await cdpSession.send("Page.startScreencast", {
      format: "jpeg",
      quality: SCREENCAST_QUALITY,
      maxWidth: SCREENCAST_MAX_WIDTH,
      maxHeight: SCREENCAST_MAX_HEIGHT,
      everyNthFrame: SCREENCAST_EVERY_NTH_FRAME,
    });
  } catch (error: any) {
    stream.active = false;
    stream.cdpSession = null;
    for (const client of stream.clients) {
      closeClient(
        client,
        4500,
        String(error?.message || "screencast_start_failed"),
      );
    }
    streams.delete(workspaceId);
  }
}

function removeClient(workspaceId: string, socket: any) {
  const stream = streams.get(workspaceId);
  if (!stream) {
    return;
  }

  stream.clients.delete(socket);
  if (!stream.clients.size) {
    void stopWorkspaceStream(workspaceId, stream);
  }
}

function handleClientFrame(workspaceId: string, socket: any, buffer: Buffer) {
  if (!buffer || buffer.length < 2) {
    return;
  }

  let offset = 0;
  while (offset + 2 <= buffer.length) {
    const opcode = buffer[offset] & 0x0f;
    const masked = (buffer[offset + 1] & 0x80) !== 0;
    let payloadLength = buffer[offset + 1] & 0x7f;
    let headerLength = 2;

    if (payloadLength === 126) {
      if (offset + 4 > buffer.length) {
        return;
      }
      payloadLength = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (payloadLength === 127) {
      return;
    }

    const maskLength = masked ? 4 : 0;
    const frameLength = headerLength + maskLength + payloadLength;
    if (offset + frameLength > buffer.length) {
      return;
    }

    let payloadOffset = offset + headerLength;
    let payload = buffer.subarray(
      payloadOffset + maskLength,
      payloadOffset + maskLength + payloadLength,
    );

    if (masked) {
      const maskKey = buffer.subarray(payloadOffset, payloadOffset + 4);
      const unmasked = Buffer.from(payload);
      for (let index = 0; index < unmasked.length; index += 1) {
        unmasked[index] ^= maskKey[index % 4];
      }
      payload = unmasked;
    }

    if (opcode === 0x9) {
      try {
        socket.write(createControlFrame(0x0a, Buffer.from(payload)));
      } catch {
        socket.destroy();
      }
    } else if (opcode === 0x8) {
      removeClient(workspaceId, socket);
      try {
        socket.end();
      } catch {
        // noop
      }
      return;
    }

    offset += frameLength;
  }
}

export function getScreencastHealth() {
  const sharedPort = Number(process.env.PORT || process.env.WORKER_METRICS_PORT || 3003);
  let viewerCount = 0;
  for (const stream of streams.values()) {
    viewerCount += stream.clients.size;
  }

  return {
    enabled: true,
    port: sharedPort,
    publicPort: PUBLIC_PORT || null,
    publicPortMatchesScreencast: true,
    requireToken: SCREENCAST_REQUIRE_TOKEN || Boolean(SCREENCAST_SHARED_SECRET),
    activeStreams: streams.size,
    viewers: viewerCount,
    maxViewersPerWorkspace: SCREENCAST_MAX_VIEWERS_PER_WORKSPACE,
  };
}

export async function cleanupScreencast(workspaceId: string): Promise<void> {
  const stream = streams.get(workspaceId);
  if (!stream) {
    return;
  }

  for (const client of stream.clients) {
    closeClient(client, 4010, "session_closed");
  }
  await stopWorkspaceStream(workspaceId, stream);
}

export function startScreencastServer(): void {
  if (serverStarted) {
    return;
  }

  // Attach WebSocket upgrade handler to the shared metrics HTTP server
  // so screencast runs on the same port Railway exposes (PORT env).
  const { metricsHttpServer } = require("../metrics-server") as {
    metricsHttpServer: import("http").Server;
  };

  metricsHttpServer.on("upgrade", (req, socket) => {
    try {
      const requestUrl = new URL(
        req.url || "/",
        `http://${req.headers.host || "127.0.0.1"}`,
      );
      const parts = requestUrl.pathname.split("/").filter(Boolean);
      if (parts[0] !== "stream" || !parts[1]) {
        rejectUpgrade(socket, 404, "not_found");
        return;
      }

      const workspaceId = decodeURIComponent(parts[1]);
      const token = String(requestUrl.searchParams.get("token") || "").trim();
      const tokenRequired =
        SCREENCAST_REQUIRE_TOKEN || Boolean(SCREENCAST_SHARED_SECRET);
      const tokenValidation = validateSignedToken(workspaceId, token);
      if (tokenRequired && !tokenValidation.ok) {
        console.warn(
          `[screencast] rejected workspace=${workspaceId} reason=${tokenValidation.reason}`,
        );
        rejectUpgrade(socket, 401, "unauthorized");
        return;
      }

      const websocketKey = req.headers["sec-websocket-key"];
      if (typeof websocketKey !== "string" || !websocketKey.trim()) {
        rejectUpgrade(socket, 400, "missing_websocket_key");
        return;
      }

      let stream = streams.get(workspaceId);
      if (!stream) {
        stream = {
          workspaceId,
          cdpSession: null,
          clients: new Set<any>(),
          active: false,
        };
        streams.set(workspaceId, stream);
      }

      if (stream.clients.size >= SCREENCAST_MAX_VIEWERS_PER_WORKSPACE) {
        rejectUpgrade(socket, 429, "too_many_viewers");
        return;
      }

      socket.write(
        [
          "HTTP/1.1 101 Switching Protocols",
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Accept: ${createAcceptValue(websocketKey)}`,
          "",
          "",
        ].join("\r\n"),
      );
      (socket as any).setNoDelay?.(true);

      stream.clients.add(socket);
      socket.on("close", () => removeClient(workspaceId, socket));
      socket.on("end", () => removeClient(workspaceId, socket));
      socket.on("error", () => removeClient(workspaceId, socket));
      socket.on("data", (buffer: Buffer) =>
        handleClientFrame(workspaceId, socket, buffer),
      );

      if (!stream.active) {
        void startWorkspaceStream(workspaceId, stream);
      }
    } catch (error: any) {
      console.error(
        `[screencast] upgrade_failed reason=${String(error?.message || "unknown_error")}`,
      );
      rejectUpgrade(socket, 500, "upgrade_failed");
    }
  });

  console.log(
    `[screencast] WebSocket upgrade handler attached to shared server`,
  );

  serverStarted = true;
}
