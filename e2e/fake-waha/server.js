const http = require("http");
const { randomUUID } = require("crypto");
const { URL } = require("url");

const port = Number.parseInt(process.env.PORT || "3000", 10);
const fallbackWebhookUrl =
  process.env.FAKE_WAHA_WEBHOOK_URL ||
  process.env.WHATSAPP_HOOK_URL ||
  "";
const fallbackWebhookSecret =
  process.env.FAKE_WAHA_WEBHOOK_SECRET ||
  process.env.WHATSAPP_API_WEBHOOK_SECRET ||
  "";
const defaultPhone = process.env.FAKE_WAHA_PHONE || "5511999999999@c.us";
const defaultPushName = process.env.FAKE_WAHA_PUSH_NAME || "Fake WAHA";
const defaultSessionStatus =
  process.env.FAKE_WAHA_SESSION_STATUS || "WORKING";

const state = {
  sentMessages: [],
  sessions: new Map(),
};

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeChatId(input) {
  const value = String(input || "").trim();
  if (!value) {
    return defaultPhone;
  }
  if (value.includes("@")) {
    return value;
  }
  return `${value.replace(/\D/g, "")}@c.us`;
}

function normalizeMessage(chatId, message) {
  const resolvedChatId = normalizeChatId(chatId || message?.chatId || message?.from);
  return {
    id: String(message?.id || randomUUID()),
    from: message?.from || resolvedChatId,
    to: message?.to || null,
    chatId: resolvedChatId,
    body: String(message?.body || message?.text || ""),
    type: String(message?.type || "chat"),
    timestamp: Number(message?.timestamp || nowUnix()),
    fromMe: message?.fromMe === true,
    raw: message?.raw || undefined,
  };
}

function buildChatSummary(chatId, messages) {
  const lastMessage = messages[messages.length - 1];
  const unreadCount = messages.filter((message) => message.fromMe !== true).length;
  const timestamp = Number(lastMessage?.timestamp || nowUnix());

  return {
    id: normalizeChatId(chatId),
    unreadCount,
    timestamp,
    lastMessageTimestamp: timestamp,
  };
}

function defaultMessages(chatId) {
  return [
    normalizeMessage(chatId, {
      id: `seed-${randomUUID()}`,
      from: chatId,
      body: "Oi, preciso de ajuda para comprar.",
      type: "chat",
      fromMe: false,
      timestamp: nowUnix() - 60,
    }),
  ];
}

function hydrateChats(session) {
  const messageEntries = Object.entries(session.messagesByChat || {});
  if (messageEntries.length === 0) {
    return [];
  }

  return messageEntries
    .map(([chatId, messages]) => buildChatSummary(chatId, messages))
    .sort((left, right) => (right.lastMessageTimestamp || 0) - (left.lastMessageTimestamp || 0));
}

function ensureSession(sessionName) {
  const resolvedName = String(sessionName || "default").trim() || "default";
  let session = state.sessions.get(resolvedName);
  if (session) {
    return session;
  }

  const seedChatId = normalizeChatId(defaultPhone);
  const messagesByChat = {
    [seedChatId]: defaultMessages(seedChatId),
  };

  session = {
    name: resolvedName,
    status: defaultSessionStatus,
    me: {
      id: defaultPhone,
      pushName: defaultPushName,
    },
    config: {
      webhooks: [],
      store: {
        enabled: true,
        fullSync: true,
      },
    },
    messagesByChat,
  };

  state.sessions.set(resolvedName, session);
  return session;
}

function sessionPayload(session) {
  return {
    name: session.name,
    status: session.status,
    me: session.me,
    engine: {
      state: session.status,
    },
    config: session.config,
  };
}

function writeJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function notFound(res) {
  writeJson(res, 404, { error: "not_found" });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk.toString("utf8");
    });
    req.on("end", () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

async function emitWebhook(sessionName, event, payload) {
  const session = ensureSession(sessionName);
  const configuredHooks = Array.isArray(session.config?.webhooks)
    ? session.config.webhooks.filter((hook) => {
        if (!hook?.url) return false;
        const events = Array.isArray(hook.events) ? hook.events : [];
        return events.length === 0 || events.includes(event);
      })
    : [];

  const hooks =
    configuredHooks.length > 0
      ? configuredHooks
      : fallbackWebhookUrl
        ? [
            {
              url: fallbackWebhookUrl,
              events: [event],
              customHeaders: fallbackWebhookSecret
                ? [{ name: "X-Api-Key", value: fallbackWebhookSecret }]
                : [],
            },
          ]
        : [];

  const results = [];
  for (const hook of hooks) {
    const headers = { "Content-Type": "application/json" };
    for (const header of hook.customHeaders || []) {
      if (header?.name) {
        headers[header.name] = header.value || "";
      }
    }
    if (fallbackWebhookSecret && !headers["X-Api-Key"]) {
      headers["X-Api-Key"] = fallbackWebhookSecret;
    }

    try {
      const response = await fetch(hook.url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          event,
          session: session.name,
          payload,
        }),
      });

      results.push({
        url: hook.url,
        ok: response.ok,
        status: response.status,
      });
    } catch (err) {
      results.push({
        url: hook.url,
        ok: false,
        error: err.message,
      });
    }
  }

  return results;
}

function seedSession(body) {
  const session = ensureSession(body.session || "default");
  session.status = String(body.status || session.status || defaultSessionStatus);
  session.me = {
    id: body.me?.id || session.me?.id || defaultPhone,
    pushName: body.me?.pushName || session.me?.pushName || defaultPushName,
  };
  if (body.config && typeof body.config === "object") {
    session.config = clone(body.config);
  }

  if (body.messages && typeof body.messages === "object") {
    session.messagesByChat = Object.fromEntries(
      Object.entries(body.messages).map(([chatId, messages]) => [
        normalizeChatId(chatId),
        Array.isArray(messages)
          ? messages.map((message) => normalizeMessage(chatId, message))
          : [],
      ]),
    );
  } else if (Array.isArray(body.chats)) {
    session.messagesByChat = Object.fromEntries(
      body.chats.map((chat) => {
        const chatId = normalizeChatId(chat.id);
        return [chatId, defaultMessages(chatId)];
      }),
    );
  }

  if (body.clearOutbound === true) {
    state.sentMessages.length = 0;
  }

  return session;
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = requestUrl.pathname;
  const method = req.method || "GET";

  try {
    if (method === "GET" && pathname === "/health") {
      writeJson(res, 200, { ok: true });
      return;
    }

    if (method === "GET" && pathname === "/api/sessions") {
      writeJson(
        res,
        200,
        Array.from(state.sessions.values()).map((session) => sessionPayload(session)),
      );
      return;
    }

    if (method === "POST" && pathname === "/api/sessions") {
      const body = await parseBody(req);
      const session = ensureSession(body.name || "default");
      if (body.config && typeof body.config === "object") {
        session.config = clone(body.config);
      }
      writeJson(res, 200, sessionPayload(session));
      return;
    }

    if (method === "POST" && pathname === "/api/sessions/start") {
      const body = await parseBody(req);
      const session = ensureSession(body.name || "default");
      session.status = "WORKING";
      writeJson(res, 200, sessionPayload(session));
      return;
    }

    if (method === "POST" && pathname === "/api/sessions/stop") {
      const body = await parseBody(req);
      const session = ensureSession(body.name || "default");
      session.status = "STOPPED";
      writeJson(res, 200, sessionPayload(session));
      return;
    }

    const sessionMatch = pathname.match(/^\/api\/sessions\/([^/]+)$/);
    if (sessionMatch) {
      const sessionName = decodeURIComponent(sessionMatch[1]);
      const session = ensureSession(sessionName);
      if (method === "GET") {
        writeJson(res, 200, sessionPayload(session));
        return;
      }
      if (method === "PUT") {
        const body = await parseBody(req);
        session.config = clone(body?.config || body || session.config);
        writeJson(res, 200, sessionPayload(session));
        return;
      }
    }

    const sessionActionMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/(start|stop|restart)$/);
    if (sessionActionMatch && method === "POST") {
      const sessionName = decodeURIComponent(sessionActionMatch[1]);
      const action = sessionActionMatch[2];
      const session = ensureSession(sessionName);
      session.status = action === "stop" ? "STOPPED" : "WORKING";
      writeJson(res, 200, sessionPayload(session));
      return;
    }

    const chatsMatch = pathname.match(/^\/api\/([^/]+)\/chats(?:\/overview)?$/);
    if (chatsMatch && method === "GET") {
      const sessionName = decodeURIComponent(chatsMatch[1]);
      const session = ensureSession(sessionName);
      writeJson(res, 200, hydrateChats(session));
      return;
    }

    const chatMessagesMatch = pathname.match(
      /^\/api\/([^/]+)\/chats\/([^/]+)\/messages$/,
    );
    if (chatMessagesMatch && method === "GET") {
      const sessionName = decodeURIComponent(chatMessagesMatch[1]);
      const chatId = normalizeChatId(decodeURIComponent(chatMessagesMatch[2]));
      const session = ensureSession(sessionName);
      const limit = Math.max(
        1,
        Math.min(
          100,
          Number.parseInt(requestUrl.searchParams.get("limit") || "20", 10) || 20,
        ),
      );
      const offset = Math.max(
        0,
        Number.parseInt(requestUrl.searchParams.get("offset") || "0", 10) || 0,
      );
      const messages = session.messagesByChat[chatId] || [];
      writeJson(res, 200, messages.slice(offset, offset + limit));
      return;
    }

    if (method === "GET" && pathname === "/api/messages") {
      const sessionName = requestUrl.searchParams.get("session") || "default";
      const chatId = normalizeChatId(requestUrl.searchParams.get("chatId"));
      const session = ensureSession(sessionName);
      const limit = Math.max(
        1,
        Math.min(
          100,
          Number.parseInt(requestUrl.searchParams.get("limit") || "20", 10) || 20,
        ),
      );
      const offset = Math.max(
        0,
        Number.parseInt(requestUrl.searchParams.get("offset") || "0", 10) || 0,
      );
      const messages = session.messagesByChat[chatId] || [];
      writeJson(res, 200, messages.slice(offset, offset + limit));
      return;
    }

    if (method === "GET" && pathname === "/api/contacts") {
      const sessionName = requestUrl.searchParams.get("session") || "default";
      const session = ensureSession(sessionName);
      const contacts = hydrateChats(session).map((chat) => ({
        id: chat.id,
        pushName: session.me.pushName,
      }));
      writeJson(res, 200, contacts);
      return;
    }

    if (method === "GET" && pathname === "/api/contacts/check-exists") {
      writeJson(res, 200, { numberExists: true });
      return;
    }

    if (method === "POST" && pathname === "/api/sendText") {
      const body = await parseBody(req);
      const session = ensureSession(body.session || "default");
      const chatId = normalizeChatId(body.chatId);
      const message = normalizeMessage(chatId, {
        id: randomUUID(),
        from: session.me.id,
        to: chatId,
        body: body.text,
        type: "chat",
        fromMe: true,
        timestamp: nowUnix(),
      });
      session.messagesByChat[chatId] = session.messagesByChat[chatId] || [];
      session.messagesByChat[chatId].push(message);
      state.sentMessages.push({
        session: session.name,
        chatId,
        text: String(body.text || ""),
        replyTo: body.reply_to || null,
        id: message.id,
        at: new Date().toISOString(),
      });
      writeJson(res, 200, { id: message.id, success: true });
      return;
    }

    if (
      method === "POST" &&
      ["/api/sendSeen", "/api/startTyping", "/api/stopTyping", "/api/sendImage", "/api/sendFile", "/api/sendLocation"].includes(pathname)
    ) {
      writeJson(res, 200, { success: true });
      return;
    }

    const presenceMatch = pathname.match(/^\/api\/([^/]+)\/presence$/);
    if (presenceMatch && method === "POST") {
      writeJson(res, 200, { success: true });
      return;
    }

    if (method === "GET" && pathname === "/__fake__/state") {
      writeJson(res, 200, {
        sentMessages: state.sentMessages,
        sessions: Array.from(state.sessions.values()).map((session) => ({
          ...sessionPayload(session),
          chats: hydrateChats(session),
        })),
      });
      return;
    }

    if (method === "GET" && pathname === "/__fake__/outbound") {
      writeJson(res, 200, { items: state.sentMessages });
      return;
    }

    if (method === "DELETE" && pathname === "/__fake__/outbound") {
      state.sentMessages.length = 0;
      writeJson(res, 200, { cleared: true });
      return;
    }

    if (method === "POST" && pathname === "/__fake__/seed") {
      const body = await parseBody(req);
      const session = seedSession(body || {});
      writeJson(res, 200, {
        session: sessionPayload(session),
        chats: hydrateChats(session),
      });
      return;
    }

    if (method === "POST" && pathname === "/__fake__/emit/session-status") {
      const body = await parseBody(req);
      const session = ensureSession(body.session || "default");
      session.status = String(body.status || "WORKING");
      session.me = {
        id: body.me?.id || session.me.id || defaultPhone,
        pushName: body.me?.pushName || session.me.pushName || defaultPushName,
      };
      const payload = {
        status: session.status,
        me: session.me,
        phone: session.me.id,
        pushName: session.me.pushName,
      };
      const results = await emitWebhook(session.name, "session.status", payload);
      writeJson(res, 200, { ok: true, webhookResults: results, payload });
      return;
    }

    if (method === "POST" && pathname === "/__fake__/emit/message-any") {
      const body = await parseBody(req);
      const session = ensureSession(body.session || "default");
      const chatId = normalizeChatId(body.chatId || body.from);
      const message = normalizeMessage(chatId, {
        id: body.id || randomUUID(),
        from: body.from || chatId,
        to: body.to || session.me.id,
        body: body.body || body.text || "Mensagem de teste do Fake WAHA",
        type: body.type || "chat",
        fromMe: false,
        timestamp: body.timestamp || nowUnix(),
      });
      session.messagesByChat[chatId] = session.messagesByChat[chatId] || [];
      session.messagesByChat[chatId].push(message);
      const results = await emitWebhook(session.name, "message.any", message);
      writeJson(res, 200, { ok: true, webhookResults: results, message });
      return;
    }

    notFound(res);
  } catch (err) {
    writeJson(res, 500, {
      error: err.message,
      path: pathname,
      method,
    });
  }
});

server.listen(port, () => {
  console.log(
    JSON.stringify({
      level: "info",
      service: "fake-waha",
      message: "fake_waha_listening",
      port,
    }),
  );
});
