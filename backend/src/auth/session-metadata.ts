const IP_REDACT_SEGMENT = 'x';

export type AuthSessionDeviceType = 'mobile' | 'desktop' | 'monitor';

export interface AuthSessionContext {
  userAgent?: string | null;
  ipAddress?: string | null;
}

export interface AuthSessionSummary {
  id: string;
  isCurrent: boolean;
  device: string;
  detail: string;
  deviceType: AuthSessionDeviceType;
  ipAddress: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
}

type RawRefreshSession = {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  lastUsedAt?: Date | null;
  userAgent?: string | null;
  ipAddress?: string | null;
};

export function normalizeSessionContext(context?: AuthSessionContext | null) {
  return {
    userAgent: typeof context?.userAgent === 'string' ? context.userAgent.trim().slice(0, 512) : null,
    ipAddress: normalizeIpAddress(context?.ipAddress),
  };
}

export function buildSessionSummary(
  session: RawRefreshSession,
  currentSessionId?: string | null,
): AuthSessionSummary {
  const surface = detectSessionSurface(session.userAgent);
  return {
    id: session.id,
    isCurrent: session.id === currentSessionId,
    device: surface.device,
    detail: buildSessionDetail(session.lastUsedAt || session.createdAt, session.ipAddress),
    deviceType: surface.deviceType,
    ipAddress: session.ipAddress || null,
    createdAt: session.createdAt.toISOString(),
    lastUsedAt: (session.lastUsedAt || session.createdAt).toISOString(),
    expiresAt: session.expiresAt.toISOString(),
  };
}

function normalizeIpAddress(value: unknown): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const forwarded = raw.split(',')[0]?.trim() || '';
  if (!forwarded) return null;

  return forwarded.slice(0, 128);
}

function buildSessionDetail(lastSeenAt: Date, ipAddress?: string | null) {
  const formatted = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(lastSeenAt);

  const redactedIp = redactIpAddress(ipAddress);
  return redactedIp ? `Último acesso em ${formatted} • ${redactedIp}` : `Último acesso em ${formatted}`;
}

function redactIpAddress(ipAddress?: string | null) {
  const raw = String(ipAddress || '').trim();
  if (!raw) return '';

  if (raw.includes(':')) {
    const parts = raw.split(':').filter(Boolean);
    if (parts.length <= 2) return raw;
    return `${parts.slice(0, 2).join(':')}:${IP_REDACT_SEGMENT}:${parts.at(-1)}`;
  }

  const parts = raw.split('.').filter(Boolean);
  if (parts.length !== 4) return raw;
  return `${parts[0]}.${parts[1]}.${IP_REDACT_SEGMENT}.${IP_REDACT_SEGMENT}`;
}

function detectSessionSurface(userAgent?: string | null): {
  device: string;
  deviceType: AuthSessionDeviceType;
} {
  const resolvedUserAgent = String(userAgent || '');

  const browser = resolvedUserAgent.includes('Edg/')
    ? 'Edge'
    : resolvedUserAgent.includes('Firefox/')
      ? 'Firefox'
      : resolvedUserAgent.includes('Safari/') && !resolvedUserAgent.includes('Chrome/')
        ? 'Safari'
        : resolvedUserAgent.includes('Chrome/')
          ? 'Chrome'
          : 'Navegador';

  const os = /iPhone|iPad|iPod/i.test(resolvedUserAgent)
    ? 'iOS'
    : /Android/i.test(resolvedUserAgent)
      ? 'Android'
      : /Mac OS X/i.test(resolvedUserAgent)
        ? 'macOS'
        : /Windows/i.test(resolvedUserAgent)
          ? 'Windows'
          : /Linux/i.test(resolvedUserAgent)
            ? 'Linux'
            : 'sistema atual';

  const isMobile = /iPhone|Android.+Mobile|Mobile/i.test(resolvedUserAgent);

  return {
    device: `${browser} em ${os}`,
    deviceType: isMobile ? 'mobile' : os === 'Windows' ? 'monitor' : 'desktop',
  };
}
