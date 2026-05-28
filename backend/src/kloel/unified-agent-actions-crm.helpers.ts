import { forEachSequential } from '../common/async-sequence';
import { PrismaService } from '../prisma/prisma.service';
import { NON_DIGIT_RE } from '../common/phone';
import type { UnknownRecord } from '../common/types';

// ─── pure helpers extracted from unified-agent-actions-crm.service.ts ───

/**
 * True when the surrounding pipeline context flags itself as deterministic.
 * When deterministic, the legacy Mind decision path is skipped in favor of
 * orchestrator-predecided values.
 */
export function isDeterministicPipeline(context?: UnknownRecord): boolean {
  return context?.deterministicPipeline === true;
}

/** Narrow `unknown` to a Record (object, non-null). */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Type guard for a Prisma client variant that carries the `autonomyExecution` model. */
export function hasAutonomyExecutionClient(
  value: unknown,
): value is { autonomyExecution: PrismaService['autonomyExecution'] } {
  return (
    isRecord(value) &&
    'autonomyExecution' in value &&
    value.autonomyExecution !== null &&
    value.autonomyExecution !== undefined
  );
}

/**
 * Convert an unknown thrown value into a readable message string.
 * Centralizes the `error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown'`
 * pattern that was repeated across the CRM action service.
 */
export function describeThrown(error: unknown, fallback = 'unknown'): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return fallback;
}

/**
 * Pure channel decision: given the workspace provider settings, the count of
 * configured WhatsApp channel identifiers, and the contact phone, returns
 * `'whatsapp'` or `'email'`.
 *
 * Extracted from `UnifiedAgentActionsCrmService.resolveChannel` so the
 * IO-bound lookup can stay in the service while the rule lives in a unit-
 * testable pure function.
 */
export function decideChannelFromSettings(input: {
  providerSettings: UnknownRecord | null | undefined;
  whatsappChannelIdentifierCount: number;
  phone: string | null | undefined;
}): 'whatsapp' | 'email' {
  const settings: UnknownRecord = input.providerSettings ?? {};
  const whatsappProvider = settings.whatsappProvider;
  const connectionStatus = settings.connectionStatus;

  if (typeof whatsappProvider === 'string' && connectionStatus === 'connected') {
    return 'whatsapp';
  }

  const hasWhatsappChannel = input.whatsappChannelIdentifierCount > 0;
  const phone = input.phone ?? '';

  if (phone && phone.startsWith('+') && hasWhatsappChannel) {
    return 'whatsapp';
  }

  return 'email';
}

/**
 * Fallback used when the workspace lookup throws — decides channel using only
 * the contact phone shape. Mirrors the catch-arm fallback in the original
 * `resolveChannel` implementation.
 */
export function fallbackChannelFromPhone(phone: string | null | undefined): 'whatsapp' | 'email' {
  const value = phone ?? '';
  return value && value.startsWith('+') ? 'whatsapp' : 'email';
}

/**
 * Coerce an unknown `ToolArg` value to a string, falling back when the value
 * cannot be reasonably represented. Accepts `string`, `number`, and `boolean`
 * inputs (the CRM action surface receives JSON-decoded arg blobs where
 * primitive numerics/booleans are common). Anything else returns the fallback.
 *
 * Differs from `asString` in `kloel-tool-dispatcher.helpers`: that one keeps
 * the fallback strict and never coerces non-strings. CRM action callers
 * depended on the legacy `String(v)` behavior for ints/bools.
 */
export function coerceArgString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return fallback;
}

/**
 * Coerce an unknown `ToolArg` value to a finite number. Mirrors the legacy
 * `num()` helper inside `UnifiedAgentActionsCrmService`: forwards to `Number()`
 * (so numeric strings like `"24"` parse) and rejects `NaN`/`Infinity` via
 * `Number.isFinite`.
 */
export function coerceArgNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Five-minute dedupe lookback window (ms) used by follow-up scheduling. */
export const FOLLOW_UP_DEDUPE_WINDOW_MS = 5 * 60 * 1000;

/**
 * Floor `Date` for the existing-pending-follow-up dedupe scan. Any follow-up
 * scheduled at or after this floor is treated as a duplicate of the current
 * request.
 */
export function computeFollowUpDedupeFloor(now: number = Date.now()): Date {
  return new Date(now - FOLLOW_UP_DEDUPE_WINDOW_MS);
}

/**
 * Compute the absolute Date the follow-up should fire, given the Mind-decided
 * delay (hours).
 */
export function computeFollowUpScheduledFor(now: number, delayHours: number): Date {
  return new Date(now + delayHours * 60 * 60 * 1000);
}

/**
 * Build the deterministic job id used to dedupe follow-up emission downstream.
 * Shape: `followup_${workspaceId}_${contactId}_${scheduledForMs}`.
 */
export function buildFollowUpJobId(
  workspaceId: string,
  contactId: string,
  scheduledForMs: number,
): string {
  return `followup_${workspaceId}_${contactId}_${scheduledForMs}`;
}

/**
 * Map a free-form priority label onto the ticketRisk score consumed by
 * `MindService.resolveHumanTransfer`. Mirrors the inline logic that previously
 * lived in `chooseHumanTransfer` so the threshold is unit-testable.
 *
 * `'urgent' | 'high'` → 0.8, anything else → 0.35.
 */
export function computeTicketRiskFromPriority(priority: string): number {
  return priority === 'urgent' || priority === 'high' ? 0.8 : 0.35;
}

export async function actionImportContacts(
  prisma: PrismaService,
  workspaceId: string,
  args: { source?: unknown; csvData?: unknown },
) {
  const { source, csvData } = args;
  if (source === 'csv' && csvData) {
    const csv = typeof csvData === 'string' ? csvData : '';
    const lines = csv.split('\n').filter((l: string) => l.trim());
    const headerRow = lines[0];
    if (!headerRow) {
      return { success: false, error: 'CSV vazio' };
    }
    const header = headerRow.split(',').map((h: string) => h.trim().toLowerCase());
    const contacts: Array<{ phone: string; name?: string; email?: string }> = [];
    for (let i = 1; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line) {
        continue;
      }
      const values = line.split(',').map((v: string) => v.trim());
      const contact: { phone?: string; name?: string; email?: string } = {};
      header.forEach((h, idx) => {
        const val = values[idx];
        if (val !== undefined) {
          if (h.includes('phone') || h.includes('telefone') || h.includes('whatsapp')) {
            contact.phone = val.replace(NON_DIGIT_RE, '');
          } else if (h.includes('name') || h.includes('nome')) {
            contact.name = val;
          } else if (h.includes('email')) {
            contact.email = val;
          }
        }
      });
      if (contact.phone) {
        contacts.push({
          phone: contact.phone,
          ...(contact.name !== undefined ? { name: contact.name } : {}),
          ...(contact.email !== undefined ? { email: contact.email } : {}),
        });
      }
    }
    let created = 0;
    await forEachSequential(contacts, async (c) => {
      try {
        await prisma.contact.upsert({
          where: { workspaceId_phone: { workspaceId, phone: c.phone } },
          create: {
            workspaceId,
            phone: c.phone,
            ...(c.name !== undefined ? { name: c.name } : {}),
            ...(c.email !== undefined ? { email: c.email } : {}),
          },
          update: {
            ...(c.name ? { name: c.name } : {}),
            ...(c.email ? { email: c.email } : {}),
          },
        });
        created += 1;
      } catch {
        /* expected on re-import */
      }
    });
    return {
      success: true,
      message: `${created} contatos importados com sucesso`,
      total: contacts.length,
      created,
    };
  }
  return { success: false, error: 'Fonte de importação não suportada ou dados inválidos' };
}
