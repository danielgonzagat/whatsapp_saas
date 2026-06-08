import type { ModuleRef } from '@nestjs/core';
import type { StructuredLogger } from '../logging/structured-logger';
import type { UnknownRecord } from '../common/types';
import { getServiceTokenMap } from './domain-service-resolver.token-map';

export type ToolResult = {
  success: boolean;
  message?: string;
  error?: string;
  [key: string]: unknown;
};

/** Runtime dependencies the dispatch helpers borrow from the resolver instance. */
export type ResolverContext = {
  readonly moduleRef: Pick<ModuleRef, 'get'>;
  readonly logger: Pick<StructuredLogger, 'warn' | 'error'>;
};

/**
 * Resolve a single `ServiceName.methodName` reference through ModuleRef DI and
 * invoke it with the resolver call convention `(workspaceId, args)`. Returns a
 * normalized {@link ToolResult}: an `unknown_service` / `method_not_found` /
 * `service_call_failed` envelope on any resolution or call failure, the raw
 * result when it already carries `success`, otherwise a `{ success, data }`
 * wrap. This is the byte-identical extraction of the original simple-path body
 * so the compound pipeline can reuse the exact same resolution semantics.
 */
export async function invokeService(
  ctx: ResolverContext,
  serviceName: string,
  methodName: string,
  workspaceId: string,
  args: UnknownRecord,
  toolName: string,
): Promise<ToolResult> {
  const token = getServiceTokenMap().get(serviceName);
  if (!token) {
    return {
      success: false,
      error: 'unknown_service',
      detail: `Serviço "${serviceName}" não encontrado no registro de tokens DI`,
    };
  }

  let instance: object;
  try {
    instance = ctx.moduleRef.get(token, { strict: false });
  } catch {
    return {
      success: false,
      error: 'unknown_service',
      detail: `Serviço "${serviceName}" não disponível no contêiner DI`,
    };
  }

  if (!instance) {
    return {
      success: false,
      error: 'unknown_service',
      detail: `Serviço "${serviceName}" retornou undefined`,
    };
  }

  const method = (instance as Record<string, unknown>)[methodName];
  if (typeof method !== 'function') {
    return {
      success: false,
      error: 'method_not_found',
      detail: `Método "${methodName}" não encontrado em "${serviceName}"`,
    };
  }

  try {
    const rawResult = await (method as (...a: unknown[]) => unknown).call(
      instance,
      workspaceId,
      args,
    );
    // Normalize result: if it already has success, return as-is
    if (rawResult && typeof rawResult === 'object' && 'success' in rawResult) {
      return rawResult as ToolResult;
    }
    // Wrap non-standard result
    return { success: true, data: rawResult };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.logger.error(`Erro ao chamar ${serviceName}.${methodName}`, {
      error: msg,
      toolName,
    });
    return {
      success: false,
      error: 'service_call_failed',
      detail: msg,
    };
  }
}

/**
 * Extract the canonical stored URL from a `MediaService.attach` receipt. The
 * attach envelope nests the URL at `data.url`; tolerate a top-level `url` as a
 * defensive fallback. Returns an empty string when no usable URL is present.
 */
export function extractUploadedUrl(result: ToolResult): string {
  const data = result.data;
  if (data && typeof data === 'object' && typeof (data as { url?: unknown }).url === 'string') {
    return (data as { url: string }).url.trim();
  }
  if (typeof result.url === 'string') {
    return result.url.trim();
  }
  return '';
}

/**
 * Dispatch the second step of an image-upload compound. The Product/Plan
 * `setImage` methods take positional `(workspaceId, entityId, imageUrl, actor)`
 * args, so resolve the entity id (`productId` for products, `planId` for plans)
 * and the injected `imageUrl` from the enriched args and call positionally.
 * The actor id mirrors the chat dispatch convention (`args.actorId`, default
 * `kloel-chat`). Ownership is enforced inside each service.
 */
export async function invokeImageSetter(
  ctx: ResolverContext,
  serviceName: string,
  methodName: string,
  workspaceId: string,
  args: UnknownRecord,
  toolName: string,
): Promise<ToolResult> {
  const entityId =
    serviceName === 'PlanService'
      ? typeof args.planId === 'string'
        ? args.planId.trim()
        : ''
      : typeof args.productId === 'string'
        ? args.productId.trim()
        : '';
  if (!entityId) {
    const idKey = serviceName === 'PlanService' ? 'planId' : 'productId';
    return {
      success: false,
      error: 'entity_id_required',
      detail: `"${serviceName}.${methodName}" requer args.${idKey}`,
    };
  }

  const imageUrl = typeof args.imageUrl === 'string' ? args.imageUrl.trim() : '';
  if (!imageUrl) {
    return {
      success: false,
      error: 'image_url_required',
      detail: `"${serviceName}.${methodName}" requer uma imageUrl`,
    };
  }

  const actorId =
    typeof args.actorId === 'string' && args.actorId.trim() ? args.actorId.trim() : 'kloel-chat';

  const token = getServiceTokenMap().get(serviceName);
  if (!token) {
    return {
      success: false,
      error: 'unknown_service',
      detail: `Serviço "${serviceName}" não encontrado no registro de tokens DI`,
    };
  }

  let instance: object;
  try {
    instance = ctx.moduleRef.get(token, { strict: false });
  } catch {
    return {
      success: false,
      error: 'unknown_service',
      detail: `Serviço "${serviceName}" não disponível no contêiner DI`,
    };
  }

  if (!instance) {
    return {
      success: false,
      error: 'unknown_service',
      detail: `Serviço "${serviceName}" retornou undefined`,
    };
  }

  const method = (instance as Record<string, unknown>)[methodName];
  if (typeof method !== 'function') {
    return {
      success: false,
      error: 'method_not_found',
      detail: `Método "${methodName}" não encontrado em "${serviceName}"`,
    };
  }

  try {
    const rawResult = await (method as (...a: unknown[]) => unknown).call(
      instance,
      workspaceId,
      entityId,
      imageUrl,
      { id: actorId },
    );
    if (rawResult && typeof rawResult === 'object' && 'success' in rawResult) {
      return rawResult as ToolResult;
    }
    return { success: true, data: rawResult };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.logger.error(`Erro ao chamar ${serviceName}.${methodName}`, {
      error: msg,
      toolName,
    });
    return {
      success: false,
      error: 'service_call_failed',
      detail: msg,
    };
  }
}

/**
 * Execute a compound `A.m + B.n` capability — the image-upload pipeline.
 *
 * Step 1 stores the chat image via the first ref (`MediaService.attach`),
 * which returns `{ success, data: { url, path, size } | null }`. On failure
 * the upload envelope is propagated unchanged and the second step never runs.
 * The stored `data.url` is injected into the args as `imageUrl` (without
 * clobbering a URL the caller already supplied), then the second ref
 * (`{Product,Plan}Service.setImage`) is invoked with the enriched args to
 * persist the image on the entity. Each underlying service enforces its own
 * workspace ownership, so isolation is preserved end-to-end. A malformed
 * compound (not exactly two `Service.method` parts) yields a clear
 * `invalid_compound_capability` error instead of crashing.
 */
export async function executeCompound(
  ctx: ResolverContext,
  domainService: string,
  workspaceId: string,
  args: UnknownRecord,
  toolName: string,
): Promise<ToolResult> {
  const parts = domainService.split(' + ').map((p) => p.trim());
  if (parts.length !== 2 || parts.some((p) => !p.includes('.'))) {
    return {
      success: false,
      error: 'invalid_compound_capability',
      detail: `Referência composta malformada: "${domainService}" (esperado "A.m + B.n")`,
    };
  }

  const [first, second] = parts;
  if (first === undefined || second === undefined) {
    return {
      success: false,
      error: 'invalid_compound_capability',
      detail: `Referência composta malformada: "${domainService}" (esperado "A.m + B.n")`,
    };
  }
  const firstDot = first.indexOf('.');
  const secondDot = second.indexOf('.');
  const firstService = first.slice(0, firstDot);
  const firstMethod = first.slice(firstDot + 1);
  const secondService = second.slice(0, secondDot);
  const secondMethod = second.slice(secondDot + 1);

  // Step 1 — upload/attach the chat image. The attach receipt is the source
  // of the canonical stored URL handed to the entity setter.
  const attachResult = await invokeService(
    ctx,
    firstService,
    firstMethod,
    workspaceId,
    args,
    toolName,
  );
  if (!attachResult.success) {
    return attachResult;
  }

  const uploadedUrl = extractUploadedUrl(attachResult);
  if (!uploadedUrl) {
    return {
      success: false,
      error: 'image_upload_no_url',
      detail: `Etapa de upload "${first}" não retornou uma URL utilizável`,
    };
  }

  // Inject the stored URL — but never clobber a URL the caller already passed.
  const existingUrl = typeof args.imageUrl === 'string' ? args.imageUrl.trim() : '';
  const enrichedArgs: UnknownRecord = existingUrl ? args : { ...args, imageUrl: uploadedUrl };

  // Step 2 — persist the image on the entity. `{Product,Plan}Service.setImage`
  // use a positional `(workspaceId, entityId, imageUrl, actor)` signature, so
  // dispatch them through the dedicated setter adapter rather than the generic
  // `(workspaceId, args)` invoker.
  return invokeImageSetter(ctx, secondService, secondMethod, workspaceId, enrichedArgs, toolName);
}
