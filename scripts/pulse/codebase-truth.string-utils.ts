/**
 * String utility helpers for codebase-truth analysis.
 * Companion to codebase-truth.analysis.ts.
 */
import { SEMANTIC_NOISE_TOKENS } from './codebase-truth.tokens';

export function normalizeText(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

export function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(/\s+/)
    .filter((token) => token.length >= 2 && /[a-z]/.test(token));
}

export function slugify(value: string): string {
  return normalizeText(value).replace(/\s+/g, '-');
}

export function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function titleCase(value: string): string {
  return value
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ');
}

export function singularize(value: string): string {
  if (value.endsWith('ies') && value.length > 3) return `${value.slice(0, -3)}y`;
  if (value.endsWith('ses') || value.endsWith('ss')) return value;
  if (value.endsWith('s') && value.length > 3) return value.slice(0, -1);
  return value;
}

export function getRouteSegments(route: string): string[] {
  return route
    .split('/')
    .filter(Boolean)
    .filter((segment) => !segment.startsWith(':'));
}

export function isUserFacingGroup(group: string): boolean {
  return group === 'main' || group === 'public' || group === 'checkout';
}

export function shouldIgnoreSemanticToken(token: string): boolean {
  return !token || SEMANTIC_NOISE_TOKENS.has(token) || token.length < 2 || !/[a-z]/.test(token);
}

export function basenameWithoutExt(filePath: string): string {
  const fileName = filePath.split('/').pop() || filePath;
  return fileName.replace(/\.[^.]+$/u, '');
}

export function extractRootToken(value: string | null | undefined): string | null {
  if (!value) return null;
  const rawSegments = String(value)
    .split('/')
    .flatMap((segment) => tokenize(segment))
    .flatMap((segment) => [segment, singularize(segment)]);
  return rawSegments.find((token) => !shouldIgnoreSemanticToken(token)) || null;
}
