import {
  BrowserActionInput,
  BrowserActionTurnResult,
  BrowserObservationResult,
  BrowserSessionState,
  BrowserTurnMode,
  ComposeReplyResult,
  ComputerUseProvider,
} from "./types";
import { browserSessionManager } from "./session-manager";
import { processWithUnifiedAgent } from "../providers/unified-agent-integrator";

const DEFAULT_ANTHROPIC_MODEL =
  process.env.ANTHROPIC_COMPUTER_USE_MODEL ||
  process.env.ANTHROPIC_MODEL ||
  "claude-sonnet-4-5";
const DEFAULT_OPENAI_MODEL =
  process.env.OPENAI_COMPUTER_USE_MODEL ||
  process.env.OPENAI_MODEL ||
  "gpt-5.4";
const MAX_MODEL_OUTPUT_CHARS = Math.max(
  1000,
  parseInt(process.env.WHATSAPP_CUA_MAX_OUTPUT_CHARS || "12000", 10) || 12000,
);

function extractDataUrlPayload(dataUrl?: string | null): {
  mimeType: string;
  base64: string;
} | null {
  const raw = String(dataUrl || "").trim();
  if (!raw.startsWith("data:")) {
    return null;
  }

  const separator = raw.indexOf(",");
  if (separator === -1) {
    return null;
  }

  const header = raw.slice(5, separator);
  const base64 = raw.slice(separator + 1);
  const mimeType = header.split(";")[0] || "image/jpeg";
  return { mimeType, base64 };
}

function stripFence(value: string): string {
  return String(value || "")
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

function extractJson(value: string): any | null {
  const cleaned = stripFence(value);
  const candidates = [cleaned];
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(cleaned.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // ignore parse attempt
    }
  }

  return null;
}

function normalizeAction(input: any): BrowserActionInput | null {
  const type = String(input?.type || "")
    .trim()
    .toLowerCase();
  if (!type) {
    return null;
  }

  const normalized: BrowserActionInput = {
    type: type as BrowserActionInput["type"],
  };
  if (typeof input?.x === "number") {
    normalized.x = input.x;
  }
  if (typeof input?.y === "number") {
    normalized.y = input.y;
  }
  if (typeof input?.toX === "number") {
    normalized.toX = input.toX;
  }
  if (typeof input?.toY === "number") {
    normalized.toY = input.toY;
  }
  if (typeof input?.text === "string") {
    normalized.text = input.text;
  }
  if (typeof input?.key === "string") {
    normalized.key = input.key;
  }
  if (typeof input?.deltaY === "number") {
    normalized.deltaY = input.deltaY;
  }
  if (typeof input?.delayMs === "number") {
    normalized.delayMs = input.delayMs;
  }
  return normalized;
}

function normalizeSessionState(value: any): BrowserSessionState {
  const raw = String(value || "")
    .trim()
    .toUpperCase();
  switch (raw) {
    case "QR_PENDING":
    case "CONNECTED":
    case "DISCONNECTED":
    case "RECOVERING":
    case "CRASHED":
    case "TAKEOVER":
      return raw as BrowserSessionState;
    case "SCAN_QR_CODE":
      return "QR_PENDING";
    case "STARTING":
      return "BOOTING";
    default:
      return "BOOTING";
  }
}

class ComputerUseOrchestrator {
  private getConfiguredProviders(): ComputerUseProvider[] {
    const explicit = String(process.env.WHATSAPP_CUA_PROVIDER || "")
      .trim()
      .toLowerCase();
    if (explicit === "anthropic") {
      return ["anthropic", "openai", "heuristic"];
    }
    if (explicit === "openai") {
      return ["openai", "anthropic", "heuristic"];
    }
    if (process.env.OPENAI_API_KEY) {
      return ["openai", "anthropic", "heuristic"];
    }
    if (process.env.ANTHROPIC_API_KEY) {
      return ["anthropic", "openai", "heuristic"];
    }
    return ["heuristic"];
  }

  private buildObservationPrompt(input: {
    workspaceId: string;
    objective?: string | null;
    sessionState: BrowserSessionState;
    visibleText: string;
    currentUrl?: string | null;
    viewport?: { width: number; height: number };
  }): string {
    return [
      "Voce esta observando o WhatsApp Web dentro do Kloel.",
      "Analise a screenshot e o contexto textual visivel.",
      "Responda SOMENTE com JSON valido.",
      "Campos obrigatorios: summary, confidence, sessionState, currentChatId, visibleChats, visibleMessages, recommendedActions.",
      "visibleChats deve ser uma lista curta de objetos { id, name, phone, unreadCount }.",
      "visibleMessages deve ser uma lista curta de objetos { id, body, fromMe }.",
      "recommendedActions deve ser uma lista de acoes de UI usando apenas: click, double_click, move, drag, type, keypress, scroll, wait.",
      "Se o usuario so precisa observar, recommendedActions deve ser [].",
      `workspaceId: ${input.workspaceId}`,
      `objective: ${input.objective || "observe_current_state"}`,
      `sessionState: ${input.sessionState}`,
      `currentUrl: ${input.currentUrl || "unknown"}`,
      `viewport: ${JSON.stringify(input.viewport || {})}`,
      `visibleText: ${input.visibleText || "(empty)"}`,
    ].join("\n");
  }

  private buildActionPrompt(input: {
    workspaceId: string;
    objective: string;
    mode?: BrowserTurnMode;
    sessionState: BrowserSessionState;
    visibleText: string;
    currentUrl?: string | null;
    viewport?: { width: number; height: number };
  }): string {
    return [
      "Voce esta controlando o WhatsApp Web dentro do Kloel.",
      input.mode === "navigate"
        ? "Gere um plano de acoes de interface para navegar, focar elementos e clicar sem digitar texto longo."
        : "Gere um plano de acoes de interface para cumprir o objetivo.",
      "Responda SOMENTE com JSON valido.",
      "Campos obrigatorios: summary, actions.",
      "actions deve usar apenas: click, double_click, move, drag, type, keypress, scroll, wait.",
      "Cada click/move precisa de coordenadas x e y baseadas na screenshot.",
      "Se a sessao nao permitir agir, retorne actions: [] e explique no summary.",
      input.mode === "navigate"
        ? "Nao escreva a resposta comercial. O texto da mensagem sera digitado fora do loop visual."
        : null,
      `workspaceId: ${input.workspaceId}`,
      `mode: ${input.mode || "navigate"}`,
      `objective: ${input.objective}`,
      `sessionState: ${input.sessionState}`,
      `currentUrl: ${input.currentUrl || "unknown"}`,
      `viewport: ${JSON.stringify(input.viewport || {})}`,
      `visibleText: ${input.visibleText || "(empty)"}`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  private async requestAnthropic(prompt: string, imageDataUrl: string) {
    const apiKey = String(process.env.ANTHROPIC_API_KEY || "").trim();
    if (!apiKey) {
      throw new Error("anthropic_key_missing");
    }

    const image = extractDataUrlPayload(imageDataUrl);
    if (!image) {
      throw new Error("invalid_screenshot_data_url");
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: DEFAULT_ANTHROPIC_MODEL,
        max_tokens: 1400,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: image.mimeType,
                  data: image.base64,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(text || `anthropic_http_${response.status}`);
    }

    const data = (await response.json()) as any;
    return String(
      data?.content
        ?.map((item: any) => String(item?.text || ""))
        .join("\n") || "",
    )
      .slice(0, MAX_MODEL_OUTPUT_CHARS)
      .trim();
  }

  private async requestOpenAI(prompt: string, imageDataUrl: string) {
    const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
    if (!apiKey) {
      throw new Error("openai_key_missing");
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEFAULT_OPENAI_MODEL,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              { type: "input_image", image_url: imageDataUrl },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(text || `openai_http_${response.status}`);
    }

    const data = (await response.json()) as any;
    const outputText =
      data?.output_text ||
      data?.output
        ?.flatMap((item: any) => item?.content || [])
        ?.map((item: any) => String(item?.text || item?.content || ""))
        ?.join("\n") ||
      "";

    return String(outputText).slice(0, MAX_MODEL_OUTPUT_CHARS).trim();
  }

  private async runProvider(
    provider: ComputerUseProvider,
    prompt: string,
    screenshotDataUrl: string,
  ): Promise<string> {
    switch (provider) {
      case "anthropic":
        return this.requestAnthropic(prompt, screenshotDataUrl);
      case "openai":
        return this.requestOpenAI(prompt, screenshotDataUrl);
      default:
        throw new Error("heuristic_provider_does_not_call_network");
    }
  }

  private buildHeuristicObservation(input: {
    objective?: string | null;
    sessionState: BrowserSessionState;
    visibleText: string;
    visibleChats: any[];
    visibleMessages: any[];
    currentChatId?: string | null;
  }): BrowserObservationResult {
    const recommendedActions: BrowserActionInput[] = [];
    if (input.sessionState === "QR_PENDING") {
      recommendedActions.push({ type: "wait", delayMs: 1000 });
    }

    return {
      provider: "heuristic",
      objective: input.objective || "observe_current_state",
      summary:
        summarizeForHeuristic(
          input.sessionState,
          input.visibleChats,
          input.visibleMessages,
          input.visibleText,
        ) || "Estado visual capturado heuristically.",
      confidence: 0.35,
      sessionState: input.sessionState,
      currentChatId: input.currentChatId || input.visibleChats[0]?.id || null,
      visibleChats: input.visibleChats || [],
      visibleMessages: input.visibleMessages || [],
      recommendedActions,
      rawOutput: null,
      generatedAt: new Date().toISOString(),
    };
  }

  async observe(workspaceId: string, objective?: string | null) {
    const context = await browserSessionManager.getObservationContext(workspaceId);
    const screenshotDataUrl = context.snapshot.screenshotDataUrl;
    if (!screenshotDataUrl) {
      const fallback = this.buildHeuristicObservation({
        objective,
        sessionState: context.snapshot.state,
        visibleText: context.visibleText,
        visibleChats: context.visibleChats,
        visibleMessages: context.visibleMessages,
        currentChatId: context.currentChatId,
      });
      await browserSessionManager.applyObservationResult(workspaceId, fallback);
      await browserSessionManager.recordProof(workspaceId, {
        kind: "observe",
        provider: "heuristic",
        summary: fallback.summary,
        observation: fallback,
        metadata: {
          reason: "missing_screenshot",
        },
      });
      return fallback;
    }

    const prompt = this.buildObservationPrompt({
      workspaceId,
      objective,
      sessionState: context.snapshot.state,
      visibleText: context.visibleText,
      currentUrl: context.snapshot.currentUrl,
      viewport: context.snapshot.viewport,
    });

    for (const provider of this.getConfiguredProviders()) {
      if (provider === "heuristic") {
        const fallback = this.buildHeuristicObservation({
          objective,
          sessionState: context.snapshot.state,
          visibleText: context.visibleText,
          visibleChats: context.visibleChats,
          visibleMessages: context.visibleMessages,
          currentChatId: context.currentChatId,
        });
        await browserSessionManager.applyObservationResult(workspaceId, fallback);
        await browserSessionManager.recordProof(workspaceId, {
          kind: "observe",
          provider,
          summary: fallback.summary,
          observation: fallback,
          afterImage: screenshotDataUrl,
          metadata: {
            fallback: true,
          },
        });
        return fallback;
      }

      try {
        const rawOutput = await this.runProvider(provider, prompt, screenshotDataUrl);
        const parsed = extractJson(rawOutput) || {};
        const result: BrowserObservationResult = {
          provider,
          objective: objective || "observe_current_state",
          summary:
            String(parsed?.summary || "").trim() ||
            `Observacao gerada por ${provider}.`,
          confidence:
            typeof parsed?.confidence === "number"
              ? parsed.confidence
              : 0.6,
          sessionState: normalizeSessionState(
            parsed?.sessionState || context.snapshot.state,
          ),
          currentChatId:
            String(parsed?.currentChatId || "").trim() ||
            context.currentChatId ||
            null,
          visibleChats: Array.isArray(parsed?.visibleChats)
            ? parsed.visibleChats
            : context.visibleChats,
          visibleMessages: Array.isArray(parsed?.visibleMessages)
            ? parsed.visibleMessages
            : context.visibleMessages,
          recommendedActions: Array.isArray(parsed?.recommendedActions)
            ? parsed.recommendedActions
                .map((action: any) => normalizeAction(action))
                .filter(Boolean)
            : [],
          rawOutput,
          generatedAt: new Date().toISOString(),
        };

        await browserSessionManager.applyObservationResult(workspaceId, result);
        await browserSessionManager.recordProof(workspaceId, {
          kind: "observe",
          provider,
          summary: result.summary,
          observation: result,
          afterImage: screenshotDataUrl,
          metadata: {
            confidence: result.confidence,
          },
        });
        return result;
      } catch (error: any) {
        await browserSessionManager.recordProof(workspaceId, {
          kind: "observe",
          provider,
          summary: `Falha ao observar a sessao com ${provider}.`,
          afterImage: screenshotDataUrl,
          metadata: {
            error: String(error?.message || error || "unknown_error"),
          },
        });
      }
    }

    throw new Error("observation_failed");
  }

  async composeReply(params: {
    workspaceId: string;
    phone: string;
    sourceMessage: string;
    contactId?: string | null;
    context?: Record<string, any>;
  }): Promise<ComposeReplyResult | null> {
    const result = await processWithUnifiedAgent({
      workspaceId: params.workspaceId,
      contactId: params.contactId || undefined,
      phone: params.phone,
      message: params.sourceMessage,
      context: {
        ...(params.context || {}),
        composeOnly: true,
        channel: "whatsapp-web-agent",
      },
    });

    const reply = String(result?.response || "").trim();
    if (!reply) {
      return null;
    }

    return {
      actor: "brain_text",
      provider: "unified-agent",
      workspaceId: params.workspaceId,
      phone: params.phone,
      contactId: params.contactId || null,
      sourceMessage: params.sourceMessage,
      reply,
      actions: result?.actions || [],
      strategySummary: result?.actions?.length
        ? `Resposta composta com ${result.actions.length} acoes do cerebro comercial.`
        : "Resposta composta pelo cerebro comercial.",
      generatedAt: new Date().toISOString(),
    };
  }

  async runNavigateTurn(
    workspaceId: string,
    objective: string,
    dryRun = false,
  ) {
    return this.runActionTurn(workspaceId, objective, dryRun, "navigate");
  }

  async runActionTurn(
    workspaceId: string,
    objective: string,
    dryRun = false,
    mode: BrowserTurnMode = "navigate",
  ) {
    const observation = await this.observe(workspaceId, objective);
    const snapshot = await browserSessionManager.getSnapshot(workspaceId, false);
    const screenshotDataUrl = snapshot.screenshotDataUrl;

    if (!objective.trim()) {
      const result: BrowserActionTurnResult = {
        provider: observation.provider,
        objective,
        mode,
        summary: "Objetivo vazio. Nenhuma acao gerada.",
        actions: [],
        dryRun,
        blockedReason: "missing_objective",
        rawOutput: null,
        generatedAt: new Date().toISOString(),
      };
      await browserSessionManager.recordProof(workspaceId, {
        kind: "action",
        provider: observation.provider,
        summary: result.summary,
        observation,
        afterImage: screenshotDataUrl || null,
        metadata: {
          dryRun,
          mode,
          blockedReason: result.blockedReason,
        },
      });
      return result;
    }

    if (snapshot.takeoverActive || snapshot.agentPaused) {
      const result: BrowserActionTurnResult = {
        provider: observation.provider,
        objective,
        mode,
        summary: snapshot.takeoverActive
          ? "Nao executei a acao porque o takeover humano esta ativo."
          : "Nao executei a acao porque o agente esta pausado.",
        actions: [],
        dryRun,
        blockedReason: snapshot.takeoverActive
          ? "takeover_active"
          : "agent_paused",
        rawOutput: null,
        generatedAt: new Date().toISOString(),
      };
      await browserSessionManager.recordProof(workspaceId, {
        kind: "action",
        provider: observation.provider,
        summary: result.summary,
        observation,
        afterImage: screenshotDataUrl || null,
        metadata: {
          dryRun,
          mode,
          blockedReason: result.blockedReason,
        },
      });
      return result;
    }

    const prompt = this.buildActionPrompt({
      workspaceId,
      objective,
      mode,
      sessionState: snapshot.state,
      visibleText:
        observation.summary || observation.visibleMessages.map((item) => item.body).join("\n"),
      currentUrl: snapshot.currentUrl,
      viewport: snapshot.viewport,
    });

    let providerUsed: ComputerUseProvider = "heuristic";
    let rawOutput: string | null = null;
    let actions: BrowserActionInput[] = [];
    let summary = `Nenhuma acao foi necessaria para: ${objective}`;

    if (screenshotDataUrl) {
      for (const provider of this.getConfiguredProviders()) {
        if (provider === "heuristic") {
          break;
        }
        try {
          rawOutput = await this.runProvider(provider, prompt, screenshotDataUrl);
          const parsed = extractJson(rawOutput) || {};
          providerUsed = provider;
          summary =
            String(parsed?.summary || "").trim() ||
            `Plano de acoes gerado por ${provider}.`;
          actions = Array.isArray(parsed?.actions)
            ? parsed.actions
                .map((action: any) => normalizeAction(action))
                .filter(Boolean)
            : [];
          break;
        } catch (error: any) {
          await browserSessionManager.recordProof(workspaceId, {
            kind: "action",
            provider,
            summary: `Falha ao gerar plano de acao com ${provider}.`,
            afterImage: screenshotDataUrl,
            metadata: {
              error: String(error?.message || error || "unknown_error"),
              objective,
            },
          });
        }
      }
    }

    if (!actions.length) {
      providerUsed = "heuristic";
      if (/enter|enviar/i.test(objective)) {
        actions = [{ type: "keypress", key: "Enter" }];
      } else if (/scroll.*(up|cima)/i.test(objective)) {
        actions = [{ type: "scroll", deltaY: -400 }];
      } else if (/scroll.*(down|baixo)/i.test(objective)) {
        actions = [{ type: "scroll", deltaY: 400 }];
      } else if (/espera|aguarde|wait/i.test(objective)) {
        actions = [{ type: "wait", delayMs: 800 }];
      }
      summary =
        summary ||
        `Fallback heuristico aplicado para o objetivo: ${objective}`;
    }

    let finalSnapshot = snapshot;
    if (!dryRun && actions.length) {
      finalSnapshot = await browserSessionManager.performAgentActions(
        workspaceId,
        actions,
        {
          objective,
          provider: providerUsed,
        },
      );
    }

    const result: BrowserActionTurnResult = {
      provider: providerUsed,
      objective,
      mode,
      summary,
      actions,
      dryRun,
      snapshot: finalSnapshot,
      blockedReason: null,
      rawOutput,
      generatedAt: new Date().toISOString(),
    };

    await browserSessionManager.recordProof(workspaceId, {
      kind: "action",
      provider: providerUsed,
      summary,
      action: actions,
      observation,
      afterImage: finalSnapshot.screenshotDataUrl || null,
      metadata: {
        objective,
        dryRun,
        mode,
      },
    });

    return result;
  }
}

function summarizeForHeuristic(
  sessionState: BrowserSessionState,
  visibleChats: any[],
  visibleMessages: any[],
  visibleText: string,
): string {
  const summary = [
    `session=${sessionState}`,
    visibleChats?.length ? `chats=${visibleChats.length}` : null,
    visibleMessages?.length ? `messages=${visibleMessages.length}` : null,
    visibleText ? `text="${visibleText.slice(0, 180)}"` : null,
  ]
    .filter(Boolean)
    .join(" | ");
  return summary || "Sem sinais visuais suficientes.";
}

export const computerUseOrchestrator = new ComputerUseOrchestrator();
