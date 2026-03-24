import http from "http";
import { getHealth, getMetrics } from "./metrics";
import { browserSessionManager } from "./browser-runtime/session-manager";
import { computerUseOrchestrator } from "./browser-runtime/computer-use-orchestrator";
import { getScreencastHealth } from "./browser-runtime/screencast-server";

const port = Number(process.env.PORT || process.env.WORKER_METRICS_PORT || 3003);
const publicPort = Number(process.env.PORT || 0);
const metricsToken = process.env.WORKER_METRICS_TOKEN;
const internalApiKey = process.env.INTERNAL_API_KEY;

function sendJson(res: http.ServerResponse, status: number, data: any) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

async function readJsonBody(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (!chunks.length) {
    return {};
  }

  const body = Buffer.concat(chunks).toString("utf8").trim();
  return body ? JSON.parse(body) : {};
}

function isAuthorized(req: http.IncomingMessage): boolean {
  const auth = req.headers["authorization"];
  const bearer =
    typeof auth === "string" && auth.startsWith("Bearer ")
      ? auth.slice(7)
      : undefined;
  const headerToken =
    bearer ||
    (typeof req.headers["x-metrics-token"] === "string"
      ? req.headers["x-metrics-token"]
      : undefined) ||
    (typeof req.headers["x-internal-key"] === "string"
      ? req.headers["x-internal-key"]
      : undefined);

  if (internalApiKey && headerToken === internalApiKey) {
    return true;
  }

  if (metricsToken && headerToken === metricsToken) {
    return true;
  }

  return !internalApiKey && !metricsToken;
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(404);
    res.end();
    return;
  }

  const requestUrl = new URL(req.url, `http://127.0.0.1:${port}`);

  // Optional token protection
  if (
    requestUrl.pathname.startsWith("/metrics") ||
    requestUrl.pathname.startsWith("/health") ||
    requestUrl.pathname.startsWith("/internal/")
  ) {
    if (!isAuthorized(req)) {
      sendJson(res, 401, { error: "unauthorized" });
      return;
    }
  }

  if (requestUrl.pathname.startsWith("/metrics")) {
    try {
      const data = await getMetrics();
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(data);
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err?.message }));
    }
    return;
  }

  if (requestUrl.pathname.startsWith("/health")) {
    const data = await getHealth();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ...data, uptimeMs: process.uptime() * 1000 }));
    return;
  }

  if (
    requestUrl.pathname === "/internal/browser/screencast/health" &&
    req.method === "GET"
  ) {
    sendJson(res, 200, { success: true, health: getScreencastHealth() });
    return;
  }

  if (
    requestUrl.pathname === "/internal/browser/session/start" &&
    req.method === "POST"
  ) {
    const body = await readJsonBody(req);
    const workspaceId = String(body?.workspaceId || "").trim();
    if (!workspaceId) {
      sendJson(res, 400, { error: "workspaceId_required" });
      return;
    }

    const snapshot = await browserSessionManager.startSession(workspaceId);
    sendJson(res, 200, { success: true, snapshot });
    return;
  }

  if (
    requestUrl.pathname === "/internal/browser/session/status" &&
    req.method === "GET"
  ) {
    const workspaceId = String(
      requestUrl.searchParams.get("workspaceId") || "",
    ).trim();
    if (!workspaceId) {
      sendJson(res, 400, { error: "workspaceId_required" });
      return;
    }

    const snapshot = await browserSessionManager.getSnapshot(workspaceId, true);
    sendJson(res, 200, { success: true, snapshot });
    return;
  }

  if (
    requestUrl.pathname === "/internal/browser/session/qr" &&
    req.method === "GET"
  ) {
    const workspaceId = String(
      requestUrl.searchParams.get("workspaceId") || "",
    ).trim();
    if (!workspaceId) {
      sendJson(res, 400, { error: "workspaceId_required" });
      return;
    }

    const snapshot = await browserSessionManager.getQrCode(workspaceId);
    sendJson(res, 200, { success: true, snapshot });
    return;
  }

  if (
    requestUrl.pathname === "/internal/browser/session/view" &&
    req.method === "GET"
  ) {
    const workspaceId = String(
      requestUrl.searchParams.get("workspaceId") || "",
    ).trim();
    if (!workspaceId) {
      sendJson(res, 400, { error: "workspaceId_required" });
      return;
    }

    const snapshot = await browserSessionManager.getSnapshot(workspaceId, true);
    sendJson(res, 200, {
      success: true,
      snapshot,
      image: snapshot.screenshotDataUrl,
    });
    return;
  }

  if (
    requestUrl.pathname === "/internal/browser/session/send-text" &&
    req.method === "POST"
  ) {
    const body = await readJsonBody(req);
    const workspaceId = String(body?.workspaceId || "").trim();
    const to = String(body?.to || "").trim();
    const message = String(body?.message || "");

    if (!workspaceId || !to) {
      sendJson(res, 400, {
        error: "workspaceId_and_to_required",
      });
      return;
    }

    const result = await browserSessionManager.sendText({
      workspaceId,
      to,
      message,
      quotedMessageId: body?.quotedMessageId,
      chatId: body?.chatId,
    });
    sendJson(res, 200, result);
    return;
  }

  if (
    requestUrl.pathname === "/internal/browser/session/send-media" &&
    req.method === "POST"
  ) {
    const body = await readJsonBody(req);
    const workspaceId = String(body?.workspaceId || "").trim();
    const to = String(body?.to || "").trim();
    const mediaUrl = String(body?.mediaUrl || "").trim();
    const mediaType = String(body?.mediaType || "image").trim() as
      | "image"
      | "video"
      | "audio"
      | "document";

    if (!workspaceId || !to || !mediaUrl) {
      sendJson(res, 400, {
        error: "workspaceId_to_mediaUrl_required",
      });
      return;
    }

    const result = await browserSessionManager.sendMedia({
      workspaceId,
      to,
      mediaType,
      mediaUrl,
      caption: body?.caption,
      quotedMessageId: body?.quotedMessageId,
      chatId: body?.chatId,
    });
    sendJson(res, 200, result);
    return;
  }

  if (
    requestUrl.pathname === "/internal/browser/session/action" &&
    req.method === "POST"
  ) {
    const body = await readJsonBody(req);
    const workspaceId = String(body?.workspaceId || "").trim();
    if (!workspaceId || !body?.action?.type) {
      sendJson(res, 400, { error: "workspaceId_and_action_required" });
      return;
    }

    const snapshot = await browserSessionManager.performAction(
      workspaceId,
      body.action,
    );
    sendJson(res, 200, { success: true, snapshot });
    return;
  }

  if (
    requestUrl.pathname === "/internal/browser/session/takeover" &&
    req.method === "POST"
  ) {
    const body = await readJsonBody(req);
    const workspaceId = String(body?.workspaceId || "").trim();
    if (!workspaceId) {
      sendJson(res, 400, { error: "workspaceId_required" });
      return;
    }

    const snapshot = await browserSessionManager.setTakeover(workspaceId, true);
    sendJson(res, 200, { success: true, snapshot });
    return;
  }

  if (
    requestUrl.pathname === "/internal/browser/session/resume-agent" &&
    req.method === "POST"
  ) {
    const body = await readJsonBody(req);
    const workspaceId = String(body?.workspaceId || "").trim();
    if (!workspaceId) {
      sendJson(res, 400, { error: "workspaceId_required" });
      return;
    }

    const snapshot = await browserSessionManager.setTakeover(workspaceId, false);
    sendJson(res, 200, { success: true, snapshot });
    return;
  }

  if (
    requestUrl.pathname === "/internal/browser/session/pause-agent" &&
    req.method === "POST"
  ) {
    const body = await readJsonBody(req);
    const workspaceId = String(body?.workspaceId || "").trim();
    const paused = body?.paused !== false;
    if (!workspaceId) {
      sendJson(res, 400, { error: "workspaceId_required" });
      return;
    }

    const snapshot = await browserSessionManager.setAgentPaused(
      workspaceId,
      paused,
    );
    sendJson(res, 200, { success: true, snapshot });
    return;
  }

  if (
    requestUrl.pathname === "/internal/browser/session/reconcile" &&
    req.method === "POST"
  ) {
    const body = await readJsonBody(req);
    const workspaceId = String(body?.workspaceId || "").trim();
    const objective = String(body?.objective || "").trim() || undefined;
    if (!workspaceId) {
      sendJson(res, 400, { error: "workspaceId_required" });
      return;
    }

    const observation = await computerUseOrchestrator.observe(
      workspaceId,
      objective || "reconcile_session_state",
    );
    const snapshot = await browserSessionManager.reconcileSession(workspaceId, {
      objective: objective || null,
      provider: observation.provider,
    });
    sendJson(res, 200, { success: true, snapshot, observation });
    return;
  }

  if (
    requestUrl.pathname === "/internal/browser/session/action-turn" &&
    req.method === "POST"
  ) {
    const body = await readJsonBody(req);
    const workspaceId = String(body?.workspaceId || "").trim();
    const objective = String(body?.objective || "").trim();
    const dryRun = body?.dryRun === true;
    const mode = String(body?.mode || "").trim() || undefined;
    if (!workspaceId || !objective) {
      sendJson(res, 400, { error: "workspaceId_and_objective_required" });
      return;
    }

    const result = await computerUseOrchestrator.runActionTurn(
      workspaceId,
      objective,
      dryRun,
      (mode as any) || undefined,
    );
    sendJson(res, 200, { success: true, result });
    return;
  }

  if (
    requestUrl.pathname === "/internal/browser/session/proofs" &&
    req.method === "GET"
  ) {
    const workspaceId = String(
      requestUrl.searchParams.get("workspaceId") || "",
    ).trim();
    const limit = Number(requestUrl.searchParams.get("limit") || "25") || 25;
    if (!workspaceId) {
      sendJson(res, 400, { error: "workspaceId_required" });
      return;
    }

    const proofs = await browserSessionManager.getProofs(workspaceId, limit);
    sendJson(res, 200, { success: true, proofs });
    return;
  }

  if (
    requestUrl.pathname === "/internal/browser/session/disconnect" &&
    req.method === "POST"
  ) {
    const body = await readJsonBody(req);
    const workspaceId = String(body?.workspaceId || "").trim();
    if (!workspaceId) {
      sendJson(res, 400, { error: "workspaceId_required" });
      return;
    }

    const snapshot = await browserSessionManager.disconnect(workspaceId);
    sendJson(res, 200, { success: true, snapshot });
    return;
  }

  if (
    requestUrl.pathname === "/internal/browser/session/logout" &&
    req.method === "POST"
  ) {
    const body = await readJsonBody(req);
    const workspaceId = String(body?.workspaceId || "").trim();
    if (!workspaceId) {
      sendJson(res, 400, { error: "workspaceId_required" });
      return;
    }

    const snapshot = await browserSessionManager.logout(workspaceId);
    sendJson(res, 200, { success: true, snapshot });
    return;
  }

  if (
    requestUrl.pathname === "/internal/browser/chats" &&
    req.method === "GET"
  ) {
    const workspaceId = String(
      requestUrl.searchParams.get("workspaceId") || "",
    ).trim();
    if (!workspaceId) {
      sendJson(res, 400, { error: "workspaceId_required" });
      return;
    }

    const chats = await browserSessionManager.getChats(workspaceId);
    sendJson(res, 200, { success: true, chats });
    return;
  }

  if (
    requestUrl.pathname === "/internal/browser/messages" &&
    req.method === "GET"
  ) {
    const workspaceId = String(
      requestUrl.searchParams.get("workspaceId") || "",
    ).trim();
    const chatId = String(requestUrl.searchParams.get("chatId") || "").trim();
    const limit = Number(requestUrl.searchParams.get("limit") || "0") || undefined;
    const offset =
      Number(requestUrl.searchParams.get("offset") || "0") || undefined;
    const downloadMedia =
      String(requestUrl.searchParams.get("downloadMedia") || "").toLowerCase() ===
      "true";
    if (!workspaceId) {
      sendJson(res, 400, { error: "workspaceId_required" });
      return;
    }

    const messages = await browserSessionManager.getChatMessages(
      workspaceId,
      chatId || undefined,
      {
        limit,
        offset,
        downloadMedia,
      },
    );
    sendJson(res, 200, { success: true, messages });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.on('error', (err: any) => {
  if (err?.code === 'EADDRINUSE') {
    // eslint-disable-next-line no-console
    console.error(
      `❌ Worker metrics server não subiu: porta ${port} já está em uso (EADDRINUSE). ` +
        'Encerrando processo para que o orquestrador reinicie o container.',
    );
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.error('Worker metrics server error:', err);
});

server.listen(port, () => {
  console.log(`📊 Worker metrics server listening on ${port}`);
});

export { server as metricsHttpServer };
