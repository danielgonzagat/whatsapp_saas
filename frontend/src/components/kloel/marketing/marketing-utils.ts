export function isBrainAvgResponseMeaningful(
  avgResponseTime: string | number | null | undefined,
): boolean {
  if (typeof avgResponseTime === 'number') {
    return avgResponseTime > 0;
  }
  if (typeof avgResponseTime === 'string') {
    const trimmed = avgResponseTime.trim();
    return trimmed !== '' && trimmed !== '--';
  }
  return false;
}
