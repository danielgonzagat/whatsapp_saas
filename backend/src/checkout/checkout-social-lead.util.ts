import { Prisma } from '@prisma/client';
import type { GoogleAuthService } from '../auth/google-auth.service';
import type { UpdateSocialLeadDto } from './dto/update-social-lead.dto';

const D_RE = /\D/g;

type GooglePeopleProfile = Awaited<ReturnType<GoogleAuthService['fetchPeopleProfile']>>;

/** Normalize optional. */
export function normalizeOptional(value?: string | null) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

/** Normalize email. */
export function normalizeEmail(value?: string | null) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return normalized || null;
}

/** Normalize phone. */
export function normalizePhone(value?: string | null) {
  const digits = String(value || '').replace(D_RE, '');
  return digits || null;
}

/** Extract address from enrichment. */
export function extractAddressFromEnrichment(value: Prisma.JsonValue | null) {
  const root = readJsonObject(value);
  const nestedAddress = readJsonObject(root?.address);
  const addressSource = nestedAddress || root;

  return {
    cep: readFirstString(addressSource, [
      'cep',
      'zip',
      'zipCode',
      'zipcode',
      'postalCode',
      'addressZip',
    ]),
    street: readFirstString(addressSource, [
      'street',
      'logradouro',
      'addressStreet',
      'addressLine1',
      'line1',
      'address',
    ]),
    number: readFirstString(addressSource, ['number', 'addressNumber', 'numero']),
    neighborhood: readFirstString(addressSource, ['neighborhood', 'bairro', 'district']),
    city: readFirstString(addressSource, ['city', 'cidade', 'addressCity']),
    state: readFirstString(addressSource, ['state', 'uf', 'estado', 'addressState']),
    complement: readFirstString(addressSource, [
      'complement',
      'complemento',
      'addressComplement',
      'line2',
    ]),
  };
}

/** Merge lead address snapshot. */
export function mergeLeadAddressSnapshot(
  current: Prisma.JsonValue | null,
  dto: UpdateSocialLeadDto,
): Prisma.InputJsonValue | undefined {
  const addressEntries = Object.entries({
    cep: normalizeOptional(dto.cep),
    street: normalizeOptional(dto.street),
    number: normalizeOptional(dto.number),
    neighborhood: normalizeOptional(dto.neighborhood),
    city: normalizeOptional(dto.city),
    state: normalizeOptional(dto.state),
    complement: normalizeOptional(dto.complement),
  }).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== '');

  if (addressEntries.length === 0) {
    return undefined;
  }

  const root = readJsonObject(current) || {};
  const address = readJsonObject(root.address) || {};

  return {
    ...root,
    address: {
      ...address,
      ...Object.fromEntries(addressEntries),
    },
  };
}

/** Merge google people profile. */
export function mergeGooglePeopleProfile(
  current: Prisma.JsonValue | null,
  profile: GooglePeopleProfile,
): Prisma.InputJsonValue {
  const root = readJsonObject(current) || {};
  const address = readJsonObject(root.address) || {};
  const providerProfile = readJsonObject(root.googleProfile) || {};

  return {
    ...root,
    googleProfile: {
      ...providerProfile,
      email: profile.email,
      phone: profile.phone,
    },
    address: {
      ...address,
      street: normalizeOptional(profile.address?.street) || address.street || null,
      city: normalizeOptional(profile.address?.city) || address.city || null,
      state: normalizeOptional(profile.address?.state) || address.state || null,
      postalCode: normalizeOptional(profile.address?.postalCode) || address.postalCode || null,
      countryCode: normalizeOptional(profile.address?.countryCode) || address.countryCode || null,
      formattedValue:
        normalizeOptional(profile.address?.formattedValue) || address.formattedValue || null,
    },
  };
}

/** To json value. */
export function toJsonValue(value: Record<string, string | boolean | null>): Prisma.InputJsonValue {
  return value;
}

function readJsonObject(value: Prisma.JsonValue | null | undefined) {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    return null;
  }

  return value as Record<string, Prisma.JsonValue>;
}

function readFirstString(
  value: Record<string, Prisma.JsonValue> | null,
  keys: readonly string[],
): string | null {
  if (!value) {
    return null;
  }

  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === 'string') {
      const normalized = normalizeOptional(candidate);
      if (normalized) {
        return normalized;
      }
    }
  }

  return null;
}
