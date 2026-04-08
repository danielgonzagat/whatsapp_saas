const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

function safeTimezone(value?: string | null): string {
  const candidate = String(value || '').trim();
  if (!candidate) return DEFAULT_TIMEZONE;

  try {
    new Intl.DateTimeFormat('en-US', {
      timeZone: candidate,
      hour: '2-digit',
    }).format(new Date());
    return candidate;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export function resolveWorkspaceTimezone(settings?: any): string {
  return safeTimezone(
    settings?.timezone ||
      settings?.businessInfo?.timezone ||
      settings?.profile?.timezone ||
      settings?.preferences?.timezone ||
      settings?.autopilot?.timezone,
  );
}

export function getWorkspaceLocalHour(settings?: any, now: Date = new Date()): number {
  const timezone = resolveWorkspaceTimezone(settings);
  return Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      hour12: false,
    }).format(now),
  );
}

export function isWithinWorkspaceWindow(input: {
  settings?: any;
  startHour: number;
  endHour: number;
  now?: Date;
}): boolean {
  const nowHour = getWorkspaceLocalHour(input.settings, input.now || new Date());
  if (input.startHour <= input.endHour) {
    return nowHour >= input.startHour && nowHour < input.endHour;
  }
  return nowHour >= input.startHour || nowHour < input.endHour;
}

export function getDelayUntilWorkspaceWindowOpens(input: {
  settings?: any;
  startHour: number;
  endHour: number;
  now?: Date;
  stepMinutes?: number;
}): number {
  const now = input.now || new Date();
  const stepMinutes = Math.max(5, input.stepMinutes || 15);

  for (let minutes = stepMinutes; minutes <= 48 * 60; minutes += stepMinutes) {
    const probe = new Date(now.getTime() + minutes * 60_000);
    if (
      isWithinWorkspaceWindow({
        settings: input.settings,
        startHour: input.startHour,
        endHour: input.endHour,
        now: probe,
      })
    ) {
      return Math.max(60_000, probe.getTime() - now.getTime());
    }
  }

  return Math.max(60_000, stepMinutes * 60_000);
}
