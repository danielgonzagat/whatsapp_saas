const MEMBER_AREA_ID_PATTERN = /^[A-Za-z0-9_-]{1,120}$/;

/** Build member area preview path. */
export function buildMemberAreaPreviewPath(memberAreaId: unknown): string | null {
  const normalizedId =
    typeof memberAreaId === 'string' || typeof memberAreaId === 'number'
      ? String(memberAreaId).trim()
      : '';

  if (!MEMBER_AREA_ID_PATTERN.test(normalizedId)) {
    return null;
  }

  return `/produtos/area-membros/preview/${encodeURIComponent(normalizedId)}`;
}
