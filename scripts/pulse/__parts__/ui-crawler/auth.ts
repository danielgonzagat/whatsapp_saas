import * as path from 'path';
import { AUTH_BOUNDARY_RE } from './constants';

export function parseNextRouteGroups(relFromApp: string): string[] {
  return relFromApp.split(path.sep).flatMap((segment) => {
    const trimmed = segment.trim();
    if (trimmed.length > 2 && trimmed.startsWith('(') && trimmed.endsWith(')')) {
      return [trimmed.slice(1, -1).toLowerCase()];
    }
    return [];
  });
}

export function routeTokenFromAppSegment(segment: string): string | null {
  if (segment === '.' || segment === '') {
    return null;
  }
  if (segment.startsWith('(') && segment.endsWith(')')) {
    return null;
  }
  if (segment.startsWith('[[...') && segment.endsWith(']]')) {
    return `:${segment.slice(5, -2)}`;
  }
  if (segment.startsWith('[...') && segment.endsWith(']')) {
    return `:${segment.slice(4, -1)}`;
  }
  if (segment.startsWith('[') && segment.endsWith(']')) {
    return `:${segment.slice(1, -1)}`;
  }
  return segment;
}

export function routeFromAppDir(dir: string): string {
  const tokens = dir.split(path.sep).flatMap((segment) => {
    const token = routeTokenFromAppSegment(segment);
    return token ? [token] : [];
  });

  if (tokens.length === 0) {
    return '/';
  }

  return `/${tokens.join('/')}`;
}

/**
 * Determine if a page file or its route group requires authentication.
 * Checks for middleware imports, auth guards, and route group prefixes.
 */
export function detectAuthRequired(filePath: string, relFromApp: string, content: string): boolean {
  if (AUTH_BOUNDARY_RE.test(content)) return true;

  const routeGroups = parseNextRouteGroups(relFromApp);
  if (routeGroups.some((group) => group && AUTH_BOUNDARY_RE.test(group))) return true;

  const normalizedPath = filePath.toLowerCase();
  if (/(?:^|[/.:-])(?:middleware|guard|protected-route)(?:[/.:-]|$)/i.test(normalizedPath))
    return true;

  return false;
}
