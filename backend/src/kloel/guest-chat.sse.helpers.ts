import type { Request, Response } from 'express';
import type { SpineEmitterService } from './spine/spine-emitter.service';

type GuestContextMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

/**
 * Fire-and-forget `cognition.decision_made` engage emit for the guest surface.
 * Extracted verbatim from chat()/chatSync() — identical provenance + payload,
 * only workspaceId/messageLength vary. `.catch(() => {})` preserves the
 * fire-and-forget contract; the @Optional emitter no-ops when absent.
 */
export function emitGuestEngageDecision(
  spineEmitter: SpineEmitterService | undefined,
  workspaceId: string,
  messageLength: number,
): void {
  void spineEmitter
    ?.emit({
      eventName: 'cognition.decision_made',
      workspaceId,
      truthMode: 'observed',
      provenance: {
        source: 'production',
        processor: 'guest-chat',
        processorVersion: '1.0.0',
        schemaVersion: '1.0.0',
      },
      payload: { decision: 'engage', messageLength, surface: 'guest' },
    })
    .catch(() => {});
}

/**
 * Configure the SSE response headers for the guest streaming chat path.
 *
 * CORS is set manually here because the streaming path uses @Res() and NestJS
 * disables automatic CORS when @Res() is in play. Extracted verbatim from
 * GuestChatService.chat() so the header contract stays identical.
 */
export function configureGuestSseResponse(req: Request, res: Response, sessionId: string): void {
  // CORS manual — obrigatório porque estamos usando @Res() e streaming
  // NestJS desativa CORS automático quando usamos @Res()
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Session-Id, Accept',
  );
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Configurar SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Session-Id', sessionId);

  // Enviar cabeçalhos antes de escrever dados
  res.flushHeaders();
}

/**
 * Inject the built mindSignals into the last user message of the cognitive
 * context, mirroring the in-place mutation previously inlined in both chat()
 * and chatSync(). Mutates `contextMessages` in place to preserve behavior.
 */
export function injectGuestMindSignals(
  contextMessages: GuestContextMessage[],
  mindSignals: Record<string, unknown> | null,
): void {
  if (!mindSignals) {
    return;
  }
  const lastMsg = contextMessages[contextMessages.length - 1];
  if (lastMsg && lastMsg.role === 'user') {
    const parsed = JSON.parse(lastMsg.content) as {
      cognitiveState?: Record<string, unknown>;
      [key: string]: unknown;
    };
    parsed.cognitiveState = { ...(parsed.cognitiveState ?? {}), mindSignals };
    contextMessages[contextMessages.length - 1] = {
      ...lastMsg,
      content: JSON.stringify(parsed),
    };
  }
}
