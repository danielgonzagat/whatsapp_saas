import { KLOEL_THEME } from '@/lib/kloel-theme';

export const SURFACE = KLOEL_THEME.bgCard;
export const SURFACE_HOVER = KLOEL_THEME.bgHover;
export const DIVIDER = KLOEL_THEME.borderSubtle;
export const MUTED = KLOEL_THEME.textSecondary;
export const MUTED_2 = KLOEL_THEME.textTertiary;
export const TEXT = KLOEL_THEME.textPrimary;
export const EMBER = KLOEL_THEME.accent;
export const VOID = KLOEL_THEME.bgPrimary;
export const F = "'Sora', sans-serif";
export const M = "'JetBrains Mono', monospace";

export function formatRelativeTime(value?: string) {
  if (!value) return 'Última mensagem agora';

  const diffMs = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return 'Última mensagem agora';

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'Última mensagem agora';
  if (minutes < 60) return `Última mensagem há ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Última mensagem há ${hours} h`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `Última mensagem há ${days} d`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `Última mensagem há ${weeks} sem`;

  const months = Math.floor(days / 30);
  if (months < 12) return `Última mensagem há ${months} mês${months > 1 ? 'es' : ''}`;

  const years = Math.floor(days / 365);
  return `Última mensagem há ${years} ano${years > 1 ? 's' : ''}`;
}
