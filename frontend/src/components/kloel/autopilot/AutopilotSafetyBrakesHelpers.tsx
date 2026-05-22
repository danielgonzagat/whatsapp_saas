import { colors } from '@/lib/design-tokens';

export function statusTone(status?: string) {
  const normalized = String(status || '').toUpperCase();
  if (['UP', 'CONFIGURED', 'COMPLETED'].includes(normalized)) {
    return { color: colors.brand.green, bg: `${colors.brand.green}20` };
  }
  if (['DEGRADED', 'PARTIAL', 'QUEUED', 'PROCESSING'].includes(normalized)) {
    return { color: colors.semantic.warning, bg: 'rgba(245, 158, 11, 0.15)' };
  }
  if (
    ['DOWN', 'FAILED', 'ERROR', 'SKIPPED', 'DISABLED', 'BILLING_SUSPENDED', 'MISSING'].includes(
      normalized,
    )
  ) {
    return { color: colors.semantic.error, bg: 'rgba(239, 68, 68, 0.12)' };
  }
  return { color: colors.brand.cyan, bg: `${colors.brand.cyan}18` };
}

export function StatusPill({ label, status }: { label: string; status?: string | undefined }) {
  const tone = statusTone(status);
  return (
    <div
      className="px-3 py-2 rounded-lg border text-sm flex items-center justify-between gap-3"
      style={{
        backgroundColor: colors.background.surface2,
        borderColor: colors.stroke,
      }}
    >
      <span style={{ color: colors.text.secondary }}>{label}</span>
      <span
        className="px-2 py-1 rounded-md text-xs font-semibold uppercase tracking-wide"
        style={{ color: tone.color, backgroundColor: tone.bg }}
      >
        {status || 'unknown'}
      </span>
    </div>
  );
}
