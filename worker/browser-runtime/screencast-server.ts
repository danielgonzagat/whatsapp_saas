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
const SCREENCAST_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

interface WorkspaceStream {
  workspaceId: string;
  cdpSession: any | null;
  clients: Set<any>;
  active: boolean;
}

const streams = new Map<string, WorkspaceStream>();
let serverStarted = false;

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

  const server = http.createServer((_, res) => {
    res.writeHead(426, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "upgrade_required",
      }),
    );
  });

  server.on("upgrade", (req, socket) => {
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
      if (SCREENCAST_REQUIRE_TOKEN && !token) {
        rejectUpgrade(socket, 401, "unauthorized");
        return;
      }

      const websocketKey = req.headers["sec-websocket-key"];
      if (typeof websocketKey !== "string" || !websocketKey.trim()) {
        rejectUpgrade(socket, 400, "missing_websocket_key");
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

      stream.clients.add(socket);
      socket.on("close", () => removeClient(workspaceId, socket));
      socket.on("end", () => removeClient(workspaceId, socket));
      socket.on("error", () => removeClient(workspaceId, socket));
      socket.on("data", () => {
        // Browser close/control frames are ignored. The TCP close/end events
        // are enough for lifecycle cleanup in this one-way frame stream.
      });

      if (!stream.active) {
        void startWorkspaceStream(workspaceId, stream);
      }
    } catch {
      rejectUpgrade(socket, 500, "upgrade_failed");
    }
  });

  server.listen(SCREENCAST_PORT, () => {
    console.log(
      `[screencast] WebSocket server listening on port ${SCREENCAST_PORT}`,
    );
  });

  serverStarted = true;
}
