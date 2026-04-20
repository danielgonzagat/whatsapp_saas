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

const AGORA_LABEL = 'Última mensagem agora';

type RelativeBucket = {
  readonly limit: number;
  readonly compute: (diffMs: number) => string;
};

function pluralizeMonths(count: number): string {
  return `Última mensagem há ${count} mês${count > 1 ? 'es' : ''}`;
}

function pluralizeYears(days: number): string {
  const years = Math.floor(days / 365);
  return `Última mensagem há ${years} ano${years > 1 ? 's' : ''}`;
}

const MS_MIN = 60_000;
const MS_HOUR = 3_600_000;
const MS_DAY = 86_400_000;
const MS_WEEK = 604_800_000;
const MS_5_WEEKS = MS_WEEK * 5;
const MS_YEAR = MS_DAY * 365;

const RELATIVE_BUCKETS: readonly RelativeBucket[] = [
  { limit: MS_MIN, compute: () => AGORA_LABEL },
  { limit: MS_HOUR, compute: (ms) => `Última mensagem há ${Math.floor(ms / MS_MIN)} min` },
  { limit: MS_DAY, compute: (ms) => `Última mensagem há ${Math.floor(ms / MS_HOUR)} h` },
  { limit: MS_WEEK, compute: (ms) => `Última mensagem há ${Math.floor(ms / MS_DAY)} d` },
  { limit: MS_5_WEEKS, compute: (ms) => `Última mensagem há ${Math.floor(ms / MS_WEEK)} sem` },
  { limit: MS_YEAR, compute: (ms) => pluralizeMonths(Math.floor(ms / MS_DAY / 30)) },
];

function formatDiffMs(diffMs: number): string {
  for (const bucket of RELATIVE_BUCKETS) {
    if (diffMs < bucket.limit) {
      return bucket.compute(diffMs);
    }
  }
  return pluralizeYears(Math.floor(diffMs / MS_DAY));
}

export function formatRelativeTime(value?: string) {
  if (!value) {
    return AGORA_LABEL;
  }
  const diffMs = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return AGORA_LABEL;
  }
  return formatDiffMs(diffMs);
}
