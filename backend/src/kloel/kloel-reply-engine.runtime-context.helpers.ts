import type { MindService } from './mind.service';
import type { ExpertiseLevel } from './kloel-reply-engine.types';
/** Builds internal Kloel operational-context string (tone, aggressiveness, etc.). */
export async function buildInternalKloelRuntimeContext(params: {
  workspaceId?: string;
  expertiseLevel: ExpertiseLevel;
  mindService?: MindService;
  logger: { warn: (event: string, ctx?: Record<string, unknown>) => void };
}): Promise<string | null> {
  if (!params.workspaceId || !params.mindService) {
    return null;
  }

  try {
    const channel = 'kloel_chat';
    const segment = params.expertiseLevel.toLowerCase();
    const [tone, aggressiveness, format, objection] = await Promise.all([
      params.mindService.resolveTone(params.workspaceId, channel, 0.5, 0.5, segment),
      params.mindService.resolveAggressiveness(
        params.workspaceId,
        'official_kloel_chat',
        0.5,
        0.5,
        1,
      ),
      params.mindService.resolveMessageFormat(params.workspaceId, channel, segment, ['text']),
      params.mindService.resolveObjectionResponse(params.workspaceId, channel, segment, 'unknown'),
    ]);

    return [
      'Contexto operacional interno do Kloel:',
      `- Tom recomendado: ${tone.tone}.`,
      `- Intensidade comercial recomendada: ${aggressiveness.aggressiveness}.`,
      `- Formato recomendado nesta superfície: ${format.format === 'text' ? 'texto claro' : format.format}.`,
      `- Estratégia comercial recomendada: ${objection.strategy}.`,
      '- Use essas diretrizes apenas como ajuste interno da resposta oficial do Kloel.',
      '- Nunca apresente outro agente, outro chat, outro motor ou outra voz ao usuário.',
    ].join('\n');
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown error';
    params.logger.warn(`Falha ao montar contexto operacional interno do Kloel: ${msg}`);
    return null;
  }
}
