export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface SubmitKycContext {
  ipAddress?: string;
  userAgent?: string;
}

export interface ConnectAddressInput {
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  cep?: string | null;
}

export function trimToUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function digitsOnly(value: unknown): string | undefined {
  const raw = trimToUndefined(value);
  if (!raw) return undefined;
  const normalized = raw.replace(/\D/g, '');
  return normalized || undefined;
}

export function buildPersonName(name: string | null | undefined): {
  firstName?: string;
  lastName?: string;
} {
  const normalized = trimToUndefined(name);
  if (!normalized) return {};
  const parts = normalized.split(/\s+/);
  const firstName = parts.shift();
  const lastName = parts.join(' ') || undefined;
  return {
    ...(firstName !== undefined ? { firstName } : {}),
    ...(lastName !== undefined ? { lastName } : {}),
  };
}

export function buildDateOfBirth(
  date: Date | null | undefined,
): { day: number; month: number; year: number } | undefined {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return undefined;
  return { day: date.getUTCDate(), month: date.getUTCMonth() + 1, year: date.getUTCFullYear() };
}

export function buildConnectAddress(fiscal: ConnectAddressInput) {
  const line1 = [trimToUndefined(fiscal.street), trimToUndefined(fiscal.number)]
    .filter(Boolean)
    .join(', ');
  const line2 = [trimToUndefined(fiscal.complement), trimToUndefined(fiscal.neighborhood)]
    .filter(Boolean)
    .join(' - ');
  return {
    line1: line1 || undefined,
    line2: line2 || undefined,
    city: trimToUndefined(fiscal.city),
    state: trimToUndefined(fiscal.state),
    postalCode: trimToUndefined(fiscal.cep),
    country: 'BR' as const,
  };
}
