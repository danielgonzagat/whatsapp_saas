import { BadRequestException } from '@nestjs/common';

/**
 * Parses an ISO-like date string from a controller query/body param.
 * Returns undefined for empty input. Throws BadRequestException with the
 * given label when the input is non-empty but unparseable.
 *
 * Canonical so multiple controllers (admin-carteira, calendar, ...) share
 * the same validation + error shape for date query params.
 */
export function parseDateOrFail(raw: string | undefined, label: string): Date | undefined {
  if (!raw) {
    return undefined;
  }
  const parsed = new Date(raw);
  if (isNaN(parsed.getTime())) {
    throw new BadRequestException(`Invalid ${label}`);
  }
  return parsed;
}
