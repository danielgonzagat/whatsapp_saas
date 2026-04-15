/**
 * Returns the time-of-day salutation in Brazilian Portuguese.
 *
 *  00:00–04:59 → "Boa madrugada"
 *  05:00–11:59 → "Bom dia"
 *  12:00–17:59 → "Boa tarde"
 *  18:00–23:59 → "Boa noite"
 */
export function resolveGreeting(hour: number): string {
  if (hour < 0 || hour > 23 || !Number.isInteger(hour)) {
    // Fall back to a neutral greeting on bad input rather than throwing.
    return 'Olá';
  }
  if (hour < 5) return 'Boa madrugada';
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

export function firstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return '';
  return trimmed.split(/\s+/)[0];
}
