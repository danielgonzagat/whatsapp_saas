import type { CheckoutSocialLeadStatus, CheckoutSocialProvider, Prisma } from '@prisma/client';
import type { CaptureSocialLeadDto } from './dto/capture-social-lead.dto';
import type { UpdateSocialLeadDto } from './dto/update-social-lead.dto';
import {
  mergeLeadAddressSnapshot,
  normalizeEmail,
  normalizeOptional,
  toJsonValue,
} from './checkout-social-lead.util';
import { digitsOrNull as normalizePhone } from '../common/phone';

/** Plan context resolved from a checkout slug. */
export type CheckoutPlanContext = {
  id: string;
  slug: string;
  productId: string;
  workspaceId: string;
};

/** Verified social profile payload returned by an auth provider. */
export type VerifiedSocialProfile = {
  provider: CheckoutSocialProvider | string;
  providerId: string;
  emailVerified: boolean;
  email?: string | null;
  name?: string | null;
  image?: string | null;
};

/** Lead record shape consumed by buildCaptureLeadResponse. */
export interface CapturedLeadRecord {
  id: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  deviceFingerprint: string | null;
  workspaceId: string;
  checkoutSlug: string | null;
}

/** Lead record shape consumed by computeUpdatedLeadFields. */
export interface UpdatableLeadRecord {
  workspaceId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  cpf: string | null;
  enrichmentData: Prisma.JsonValue | null;
  stepReached: number;
}

/** Build the data payload for prisma.checkoutSocialLead.create from capture inputs. */
export function buildCaptureLeadCreateData(
  plan: CheckoutPlanContext,
  provider: CheckoutSocialProvider,
  verified: VerifiedSocialProfile,
  dto: CaptureSocialLeadDto,
): Prisma.CheckoutSocialLeadUncheckedCreateInput {
  return {
    workspaceId: plan.workspaceId,
    planId: plan.id,
    productId: plan.productId,
    checkoutSlug: plan.slug,
    checkoutCode: normalizeOptional(dto.checkoutCode),
    provider,
    providerId: verified.providerId,
    providerEmailVerified: verified.emailVerified,
    name: normalizeOptional(verified.name),
    email: normalizeEmail(verified.email),
    avatarUrl: normalizeOptional(verified.image),
    sourceUrl: normalizeOptional(dto.sourceUrl),
    refererUrl: normalizeOptional(dto.refererUrl),
    utmSource: normalizeOptional(dto.utmSource),
    utmMedium: normalizeOptional(dto.utmMedium),
    utmCampaign: normalizeOptional(dto.utmCampaign),
    utmContent: normalizeOptional(dto.utmContent),
    utmTerm: normalizeOptional(dto.utmTerm),
    fbclid: normalizeOptional(dto.fbclid),
    gclid: normalizeOptional(dto.gclid),
    deviceFingerprint: normalizeOptional(dto.deviceFingerprint),
    providerPayload: toJsonValue({
      provider: String(verified.provider),
      providerId: verified.providerId,
      emailVerified: verified.emailVerified,
    }),
  };
}

/** Map a captured lead record into the capture endpoint response shape. */
export function buildCaptureLeadResponse(
  lead: CapturedLeadRecord,
  provider: CaptureSocialLeadDto['provider'],
) {
  return {
    leadId: lead.id,
    provider,
    name: lead.name,
    email: lead.email,
    avatarUrl: lead.avatarUrl,
    deviceFingerprint: lead.deviceFingerprint,
    workspaceId: lead.workspaceId,
    checkoutSlug: lead.checkoutSlug,
  };
}

/** Build the OR filter list for prefill lookups by slug + optional checkoutCode. */
export function buildPrefillOrFilter(
  slug: string,
  checkoutCode: string | null,
): Array<{ checkoutSlug: string } | { checkoutCode: string }> {
  const base: Array<{ checkoutSlug: string } | { checkoutCode: string }> = [
    { checkoutSlug: slug },
  ];
  if (checkoutCode) {
    base.push({ checkoutCode });
  }
  return base;
}

/** Result of merging an UpdateSocialLeadDto into an existing lead. */
export type UpdatedLeadFields = {
  workspaceId: string;
  normalizedName: string | null;
  normalizedEmail: string | null;
  normalizedPhone: string | null;
  normalizedCpf: string | null;
  nextStep: number;
  mergedEnrichmentData: Prisma.InputJsonValue | undefined;
};

/** Compute normalized fields for updateLead, preserving existing values when unset. */
export function computeUpdatedLeadFields(
  existing: UpdatableLeadRecord,
  dto: UpdateSocialLeadDto,
): UpdatedLeadFields {
  const normalizedPhone = normalizePhone(dto.phone) || existing.phone || null;
  const normalizedName = normalizeOptional(dto.name) || existing.name || null;
  const normalizedEmail = normalizeEmail(dto.email) || existing.email || null;
  const normalizedCpf = normalizeOptional(dto.cpf) || existing.cpf || null;
  const nextStep = Math.max(existing.stepReached, dto.stepReached || existing.stepReached);
  const mergedEnrichmentData = mergeLeadAddressSnapshot(existing.enrichmentData, dto);

  return {
    workspaceId: existing.workspaceId,
    normalizedName,
    normalizedEmail,
    normalizedPhone,
    normalizedCpf,
    nextStep,
    mergedEnrichmentData,
  };
}

/** Build the data payload for the lead update step. */
export function buildLeadUpdateData(
  fields: UpdatedLeadFields,
): Prisma.CheckoutSocialLeadUncheckedUpdateInput {
  return {
    name: fields.normalizedName,
    email: fields.normalizedEmail,
    phone: fields.normalizedPhone,
    cpf: fields.normalizedCpf,
    stepReached: fields.nextStep,
    ...(fields.mergedEnrichmentData !== undefined
      ? { enrichmentData: fields.mergedEnrichmentData }
      : {}),
  };
}

/** Contact upsert input shape. */
export type ContactUpsertInput = {
  workspaceId: string;
  name?: string | null;
  email?: string | null;
  phone: string;
};

/** Args for prisma.contact.upsert, or null when phone is missing/blank. */
export type ContactUpsertArgs = {
  where: { workspaceId_phone: { workspaceId: string; phone: string } };
  create: Prisma.ContactUncheckedCreateInput;
  update: Prisma.ContactUncheckedUpdateInput;
};

/** Build the upsert payload for a contact derived from a captured lead. */
export function buildContactUpsertArgs(input: ContactUpsertInput): ContactUpsertArgs | null {
  const phone = normalizePhone(input.phone);
  if (!phone) {
    return null;
  }

  const name = normalizeOptional(input.name);
  const email = normalizeEmail(input.email);

  return {
    where: {
      workspaceId_phone: {
        workspaceId: input.workspaceId,
        phone,
      },
    },
    create: {
      workspaceId: input.workspaceId,
      phone,
      name,
      email,
      customFields: {
        checkoutSocialLead: true,
      },
    },
    update: {
      ...(name ? { name } : {}),
      ...(email !== undefined && email !== null ? { email } : {}),
    },
  };
}

/** Mark-converted update data. */
export function buildConvertedUpdateData(
  orderId: string,
  status: CheckoutSocialLeadStatus,
  convertedAt: Date = new Date(),
): Prisma.CheckoutSocialLeadUncheckedUpdateInput {
  return {
    status,
    convertedAt,
    convertedOrderId: orderId,
    stepReached: 3,
  };
}
