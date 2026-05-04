import type { CrawlerRole } from '../../types.ui-crawler';
import { ROLE_NAMES } from './constants';

/**
 * Classify a URL route into a {@link CrawlerRole}.
 *
 * @param url - The URL route path (e.g. `/admin/users`, `/vendas/pipeline`).
 * @returns The inferred crawler role.
 */
export function classifyRoleFromRoute(url: string): CrawlerRole {
  if (url === '/') return 'anonymous';
  const [firstSegment] = url
    .split('/')
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean);

  if (firstSegment && ROLE_NAMES.has(firstSegment as CrawlerRole)) {
    return firstSegment as CrawlerRole;
  }

  return 'customer';
}
