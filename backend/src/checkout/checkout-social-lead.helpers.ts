import { CheckoutSocialProvider, Prisma } from '@prisma/client';
import type { CaptureSocialLeadDto } from './dto/capture-social-lead.dto';
import { extractAddressFromEnrichment } from './checkout-social-lead.util';

/** Prefill shape returned to callers. */
export type CheckoutSocialLeadPrefill = {
  leadId: string;
  provider: CaptureSocialLeadDto['provider'];
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  deviceFingerprint: string | null;
  phone: string | null;
  cpf: string | null;
  cep: string | null;
  street: string | null;
  number: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  complement: string | null;
};

/** Parse provider string to enum. */
export function parseProvider(provider: string): CheckoutSocialProvider {
  if (provider === 'google') {
    return CheckoutSocialProvider.GOOGLE;
  }
  if (provider === 'facebook') {
    return CheckoutSocialProvider.FACEBOOK;
  }
  return CheckoutSocialProvider.APPLE;
}

/** Serialize provider enum to string. */
export function serializeProvider(
  provider: CheckoutSocialProvider,
): CaptureSocialLeadDto['provider'] {
  if (provider === CheckoutSocialProvider.GOOGLE) {
    return 'google';
  }
  if (provider === CheckoutSocialProvider.FACEBOOK) {
    return 'facebook';
  }
  return 'apple';
}

/** Lead record shape accepted by buildLeadPrefill. */
interface LeadRecord {
  id: string;
  provider: CheckoutSocialProvider;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  deviceFingerprint: string | null;
  phone: string | null;
  cpf: string | null;
  enrichmentData: Prisma.JsonValue | null;
}

/** Build a CheckoutSocialLeadPrefill from a lead DB record. */
export function buildLeadPrefill(lead: LeadRecord): CheckoutSocialLeadPrefill {
  const address = extractAddressFromEnrichment(lead.enrichmentData);
  return {
    leadId: lead.id,
    provider: serializeProvider(lead.provider),
    name: lead.name,
    email: lead.email,
    avatarUrl: lead.avatarUrl,
    deviceFingerprint: lead.deviceFingerprint,
    phone: lead.phone,
    cpf: lead.cpf,
    cep: address.cep,
    street: address.street,
    number: address.number,
    neighborhood: address.neighborhood,
    city: address.city,
    state: address.state,
    complement: address.complement,
  };
}
