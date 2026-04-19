export type SecuritySessionDeviceType = 'mobile' | 'desktop' | 'monitor';

export interface SecuritySessionSurface {
  device: string;
  detail: string;
  deviceType: SecuritySessionDeviceType;
}

export function detectSecuritySessionSurface(userAgent?: string, timezone?: string): SecuritySessionSurface {
  const resolvedUserAgent =
    typeof userAgent === 'string'
      ? userAgent
      : typeof navigator !== 'undefined'
        ? navigator.userAgent || ''
        : '';
  const resolvedTimezone =
    typeof timezone === 'string' && timezone.trim()
      ? timezone
      : typeof Intl !== 'undefined'
        ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'fuso local'
        : 'fuso local';

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
    detail: `Sessão atual neste dispositivo • ${resolvedTimezone}`,
    deviceType: isMobile ? 'mobile' : os === 'Windows' ? 'monitor' : 'desktop',
  };
}
