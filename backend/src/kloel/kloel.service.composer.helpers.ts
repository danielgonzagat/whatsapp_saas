import type { Prisma } from '@prisma/client';

/** Composer capability tags surfaced from chat metadata or inferred from intent. */
export type ComposerCapability = 'create_image' | 'create_site' | 'search_web' | 'refine_response';

/** Attachment metadata persisted alongside composer messages. */
export interface ComposerAttachmentMetadata {
  id?: string;
  name?: string;
  size?: number;
  mimeType?: string;
  kind?: 'image' | 'document' | 'audio';
  url?: string | null;
}

/** Linked product metadata persisted alongside composer messages. */
export interface ComposerLinkedProductMetadata {
  id?: string;
  source?: 'owned' | 'affiliate';
  name?: string;
  status?: 'published' | 'draft' | 'affiliate';
  productId?: string | null;
  affiliateProductId?: string | null;
}

/** Normalized composer metadata extracted from raw thread metadata blobs. */
export interface ComposerMetadata {
  capability?: ComposerCapability | null;
  attachments?: ComposerAttachmentMetadata[];
  linkedProduct?: ComposerLinkedProductMetadata | null;
}

type ThinkMode = 'chat' | 'onboarding' | 'sales';

const SITE_INTENT_TOKENS = [
  'landing',
  'landing page',
  'pagina de vendas',
  'página de vendas',
  'pagina de captura',
  'página de captura',
  'homepage',
  'home page',
  'site',
] as const;

const CREATION_INTENT_TOKENS = [
  'crie',
  'criar',
  'gere',
  'gerar',
  'monte',
  'montar',
  'faça',
  'faca',
  'fazer',
  'construa',
  'construir',
  'desenvolva',
  'desenvolver',
  'quero criar',
  'preciso criar',
] as const;

/**
 * Pure metadata coerce — same shape used by KloelThreadService.normalizeThreadMessageMetadataRecord.
 * Returns an empty object when the input is not a plain object.
 */
function normalizeMetadataRecord(
  metadata?: Prisma.InputJsonValue | Prisma.JsonValue | null,
): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }
  return { ...(metadata as Record<string, unknown>) };
}

/**
 * Coerce raw metadata into a typed ComposerMetadata. Pure.
 */
export function extractComposerMetadata(
  metadata?: Prisma.InputJsonValue | Prisma.JsonValue | null,
): ComposerMetadata {
  const normalized = normalizeMetadataRecord(metadata);
  const capability =
    normalized.capability === 'create_image' ||
    normalized.capability === 'create_site' ||
    normalized.capability === 'search_web' ||
    normalized.capability === 'refine_response'
      ? normalized.capability
      : null;
  const attachments = Array.isArray(normalized.attachments)
    ? (normalized.attachments as ComposerAttachmentMetadata[])
    : [];
  const linkedProduct =
    normalized.linkedProduct &&
    typeof normalized.linkedProduct === 'object' &&
    !Array.isArray(normalized.linkedProduct)
      ? (normalized.linkedProduct as ComposerLinkedProductMetadata)
      : null;
  return { capability, attachments, linkedProduct };
}

/**
 * Infer composer capability from the user message when no explicit capability is tagged.
 * Currently only detects implicit "create_site" intent in chat mode. Pure.
 */
export function inferImplicitComposerCapability(
  message: string,
  mode: ThinkMode | undefined,
): ComposerCapability | null {
  if (mode !== 'chat') {
    return null;
  }
  const normalized = String(message || '')
    .trim()
    .toLowerCase();
  if (!normalized) {
    return null;
  }
  const wantsSite = SITE_INTENT_TOKENS.some((t) => normalized.includes(t));
  const wantsCreation = CREATION_INTENT_TOKENS.some((t) => normalized.includes(t));
  if (wantsSite && wantsCreation) {
    return 'create_site';
  }
  return null;
}

/**
 * Resolve final composer capability — explicit tag wins, otherwise infer from intent. Pure.
 */
export function resolveComposerCapability(
  message: string,
  mode: ThinkMode | undefined,
  explicitCapability?: ComposerCapability | null,
): ComposerCapability | null {
  return explicitCapability || inferImplicitComposerCapability(message, mode);
}

/**
 * Build the "ANEXOS VINCULADOS AO PROMPT" block from composer attachments. Pure.
 * Returns null when there is nothing to render.
 */
export function buildAttachmentPromptContext(
  attachments: ComposerAttachmentMetadata[] | null | undefined,
): string | null {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return null;
  }
  const lines = attachments
    .slice(0, 10)
    .map((a, i) => {
      const parts = [
        `ANEXO ${i + 1}: ${String(a.name || 'arquivo').trim() || 'arquivo'}`,
        a.kind ? `tipo ${a.kind}` : null,
        a.mimeType ? `mime ${a.mimeType}` : null,
        Number.isFinite(Number(a.size)) ? `tamanho ${Number(a.size)} bytes` : null,
        a.url ? `url ${a.url}` : null,
      ].filter(Boolean);
      return `- ${parts.join(' | ')}`;
    })
    .filter(Boolean);
  if (lines.length === 0) {
    return null;
  }
  return ['ANEXOS VINCULADOS AO PROMPT:', ...lines].join('\n');
}
