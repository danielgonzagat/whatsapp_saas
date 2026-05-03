import {
  CheckoutSocialLeadEnrichmentStatus,
  CheckoutSocialLeadStatus,
  Prisma,
} from '@prisma/client';
import { prisma } from '../db';
import { WorkerLogger } from '../logger';
import { throwIfRetryable } from '../src/utils/error-handler';
import { validateUrl } from '../utils/ssrf-protection';

const D_RE = /\D/g;

const log = new WorkerLogger('checkout-social-enrichment');

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

type EnrichmentSettings = {
  enabled: boolean;
  apiUrl: string;
  apiKey?: string;
  provider?: string;
  headers?: Record<string, string>;
};

/** Process checkout social lead enrichment. */
export async function processCheckoutSocialLeadEnrichment(leadId: string) {
  const lead = await prisma.checkoutSocialLead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      workspaceId: true,
      provider: true,
      name: true,
      email: true,
      workspace: {
        select: {
          providerSettings: true,
        },
      },
    },
  });

  if (!lead?.email) {
    await prisma.checkoutSocialLead.updateMany({
      where: { id: leadId, workspaceId: lead?.workspaceId },
      data: {
        enrichmentStatus: CheckoutSocialLeadEnrichmentStatus.SKIPPED,
      },
    });
    return;
  }

  const settings = parseEnrichmentSettings(lead.workspace?.providerSettings);
  if (!settings) {
    await prisma.checkoutSocialLead.updateMany({
      where: { id: leadId, workspaceId: lead.workspaceId },
      data: {
        enrichmentStatus: CheckoutSocialLeadEnrichmentStatus.SKIPPED,
      },
    });
    return;
  }

  try {
    const urlValidation = await validateUrl(settings.apiUrl);
    if (!urlValidation.valid) {
      log.warn('enrichment_url_rejected', { leadId, error: urlValidation.error });
      await prisma.checkoutSocialLead.updateMany({
        where: { id: leadId, workspaceId: lead.workspaceId },
        data: {
          enrichmentStatus: CheckoutSocialLeadEnrichmentStatus.FAILED,
        },
      });
      return;
    }

    const response = await fetch(settings.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
        ...(settings.headers || {}),
      },
      body: JSON.stringify({
        leadId: lead.id,
        workspaceId: lead.workspaceId,
        provider: lead.provider,
        email: lead.email,
        name: lead.name,
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      throw new Error(`provider_status_${response.status}`);
    }

    const raw = (await response.json()) as unknown;
    const enrichmentData = toJsonValue(raw);
    const normalizedPhone = normalizePhone(readStringField(raw, ['phone', 'telefone', 'mobile']));
    const normalizedCpf = normalizeCpf(readStringField(raw, ['cpf', 'document', 'documentNumber']));

    await prisma.checkoutSocialLead.updateMany({
      where: { id: lead.id, workspaceId: lead.workspaceId },
      data: {
        phone: normalizedPhone || undefined,
        cpf: normalizedCpf || undefined,
        enrichmentData: enrichmentData as Prisma.InputJsonValue,
        enrichmentStatus: CheckoutSocialLeadEnrichmentStatus.COMPLETED,
        status: CheckoutSocialLeadStatus.ENRICHED,
        enrichedAt: new Date(),
      },
    });

    if (normalizedPhone) {
      await prisma.contact.upsert({
        where: {
          workspaceId_phone: {
            workspaceId: lead.workspaceId,
            phone: normalizedPhone,
          },
        },
        create: {
          workspaceId: lead.workspaceId,
          phone: normalizedPhone,
          name: lead.name || undefined,
          email: lead.email,
          customFields: {
            checkoutSocialLead: true,
            enrichmentProvider: settings.provider || 'custom',
          },
        },
        update: {
          name: lead.name || undefined,
          email: lead.email,
        },
      });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown_enrichment_error';
    log.warn('enrichment_failed', { leadId, message });
    await prisma.checkoutSocialLead.updateMany({
      where: { id: leadId, workspaceId: lead.workspaceId },
      data: {
        enrichmentStatus: CheckoutSocialLeadEnrichmentStatus.FAILED,
      },
    });
    throwIfRetryable(error, 'checkout-social-lead-enrichment');
  }
}

function parseEnrichmentSettings(value: unknown): EnrichmentSettings | null {
  if (!isRecord(value)) {
    return null;
  }

  const enrichment = value.enrichment;
  if (!isRecord(enrichment)) {
    return null;
  }

  const enabled = enrichment.enabled === true;
  const apiUrl = typeof enrichment.apiUrl === 'string' ? enrichment.apiUrl.trim() : '';
  if (!enabled || !apiUrl) {
    return null;
  }

  return {
    enabled,
    apiUrl,
    apiKey: typeof enrichment.apiKey === 'string' ? enrichment.apiKey.trim() : undefined,
    provider: typeof enrichment.provider === 'string' ? enrichment.provider.trim() : undefined,
    headers: parseStringRecord(enrichment.headers),
  };
}

function parseStringRecord(value: unknown) {
  if (!isRecord(value)) {
    return undefined;
  }

  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] =>
      typeof entry[0] === 'string' && typeof entry[1] === 'string',
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function readStringField(value: unknown, keys: string[]) {
  if (!isRecord(value)) {
    return null;
  }

  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      continue;
    }
    const candidate = Reflect.get(value, key);
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

function normalizePhone(value: string | null) {
  const digits = String(value || '').replace(D_RE, '');
  return digits || null;
}

function normalizeCpf(value: string | null) {
  const digits = String(value || '').replace(D_RE, '');
  return digits || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => toJsonValue(entry));
  }

  if (isRecord(value)) {
    const entries = Object.entries(value).map(([key, entry]) => [key, toJsonValue(entry)] as const);
    return Object.fromEntries(entries) as { [key: string]: JsonValue };
  }

  return String(value);
}
