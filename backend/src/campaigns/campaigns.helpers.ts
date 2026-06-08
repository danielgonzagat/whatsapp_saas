/**
 * @cluster whatsapp_saas/backend/campaigns
 * Pure helpers extracted from CampaignsService.
 *
 * These helpers are deliberately DI-free and side-effect-free: they take plain
 * inputs (numbers, strings, persisted-row shapes) and return plain outputs, so
 * they can be unit-tested in isolation and reused across services without
 * dragging in NestJS or Prisma client.
 */

/**
 * Compute the BullMQ `delay` (in milliseconds) for a smart-time-scheduled
 * campaign, given the current wall-clock and the audience's peak engagement
 * hour.
 *
 * The peak hour is interpreted as the **next** occurrence: if it is later
 * today, we delay until then; if it has already passed today, we wrap to the
 * same hour tomorrow.
 *
 * @param now Current wall-clock instant.
 * @param peakHour Target hour of the day (0-23) from `SmartTimeService`.
 * @returns Milliseconds to wait before dispatching the campaign job.
 */
export function computeSmartTimeDelayMs(now: Date, peakHour: number): number {
  const currentHour = now.getHours();
  let hoursToAdd = peakHour - currentHour;
  if (hoursToAdd <= 0) {
    hoursToAdd += 24;
  }
  return hoursToAdd * 60 * 60 * 1000;
}

/**
 * Compute a campaign's conversion score, used by the Darwin variant evaluator
 * to pick the winning copy.
 *
 * Score is `replied / sent`. Campaigns with zero `sent` score `0` (to avoid
 * promoting variants that never reached the audience).
 *
 * @param stats `stats` JSON column from the `Campaign` row.
 * @returns Conversion ratio in `[0, 1]`.
 */
export function scoreCampaignStats(stats: unknown): number {
  const safe = (stats || {}) as Record<string, number>;
  const sent = safe.sent || 0;
  const replied = safe.replied || 0;
  if (!sent) {
    return 0;
  }
  return replied / sent;
}

/** Shape of the relevant `Workspace.providerSettings` JSON for delivery. */
export type CampaignProviderSettings = {
  email?: { enabled?: boolean };
  whatsappApiSession?: { status?: string };
} | null;

/** Shape of the relevant `MetaConnection` row fields for delivery. */
export type CampaignMetaConnectionInput = {
  whatsappPhoneNumberId?: string | null;
  status?: string | null;
  tokenExpiresAt?: Date | string | null;
} | null;

/**
 * Inputs needed to compute the campaign delivery readiness without any IO.
 */
export type CampaignDeliveryReadinessInput = {
  /** Workspace `providerSettings` JSON (or `null` if workspace not found). */
  providerSettings: CampaignProviderSettings;
  /** Most-recent Meta WhatsApp connection row for the workspace. */
  metaConnection: CampaignMetaConnectionInput;
  /** Whether the `MetaWhatsAppService` is wired into the runtime container. */
  metaWhatsAppAvailable: boolean;
  /** Whether at least one email provider env var is configured. */
  emailProviderAvailable: boolean;
  /** Current instant (injectable for testing). */
  now: Date;
};

/** Output of `computeCampaignDeliveryReadiness`. */
export type CampaignDeliveryReadiness = {
  emailReady: boolean;
  whatsappReady: boolean;
};

/**
 * Decide whether a workspace is ready to dispatch a campaign over email and/or
 * WhatsApp, based only on already-fetched persistence + env signals.
 *
 * - `emailReady` requires both opt-in (`providerSettings.email.enabled`) and at
 *   least one provider env var.
 * - `whatsappReady` accepts either the legacy in-app WhatsApp Web session
 *   (`providerSettings.whatsappApiSession.status === 'connected'`) **or** an
 *   official Meta Cloud connection with a non-expired token.
 */
export function computeCampaignDeliveryReadiness(
  input: CampaignDeliveryReadinessInput,
): CampaignDeliveryReadiness {
  const settings = input.providerSettings || {};
  const meta = input.metaConnection;

  const emailReady = Boolean(settings.email?.enabled && input.emailProviderAvailable);

  const tokenExpiresAt = meta?.tokenExpiresAt;
  const tokenExpired = Boolean(
    tokenExpiresAt && new Date(tokenExpiresAt).getTime() < input.now.getTime(),
  );

  const legacyWhatsAppReady = Boolean(
    input.metaWhatsAppAvailable && settings?.whatsappApiSession?.status === 'connected',
  );
  const officialMetaWhatsAppReady = Boolean(
    input.metaWhatsAppAvailable &&
    meta?.whatsappPhoneNumberId &&
    String(meta.status || '').toLowerCase() === 'connected' &&
    !tokenExpired,
  );
  const whatsappReady = legacyWhatsAppReady || officialMetaWhatsAppReady;

  return { emailReady, whatsappReady };
}

/**
 * Build the human-readable list of missing prerequisites for launching a
 * campaign, or `null` if delivery is ready.
 *
 * The wording is the Portuguese user-facing error surface — kept here so it can
 * be asserted in unit tests without standing up the whole NestJS module.
 */
export function buildCampaignDeliveryGap(
  readiness: CampaignDeliveryReadiness,
): { missing: string[]; message: string } | null {
  if (readiness.emailReady || readiness.whatsappReady) {
    return null;
  }
  const missing: string[] = [];
  if (!readiness.emailReady) {
    missing.push('email.enabled=true com provider configurado');
  }
  if (!readiness.whatsappReady) {
    missing.push('Meta Cloud WhatsApp conectado');
  }
  return {
    missing,
    message: `Conecte um canal de entrega antes de lançar campanha. Faltando: ${missing.join(', ')}`,
  };
}

export type CampaignDeliveryStatus = CampaignDeliveryReadiness & {
  ready: boolean;
  missing: string[];
  message: string | null;
};

export function buildCampaignDeliveryStatus(
  readiness: CampaignDeliveryReadiness,
): CampaignDeliveryStatus {
  const gap = buildCampaignDeliveryGap(readiness);
  return {
    ...readiness,
    ready: gap === null,
    missing: gap?.missing || [],
    message: gap?.message || null,
  };
}

/** Stable fallback line appended when OpenAI is unavailable for variant copy. */
export function buildVariantFallbackCopy(base: string | null | undefined, idx: number): string {
  return `${base || ''} [variante ${idx + 1} com CTA: responda SIM agora]`;
}

/**
 * Validate an LLM-generated campaign-copy variant. Outputs that grew >3x the
 * original (capped at 280 chars for short bases) or came back empty are
 * rejected and the original `base` is returned instead — guards against the
 * model hallucinating a long block when a single short message was asked for.
 */
export function validateVariantCopy(base: string, variant: string): string {
  if (variant.length === 0) {
    return base;
  }
  const cap = Math.max(base.length * 3, 280);
  return variant.length <= cap ? variant : base;
}
