import { describe, expect, it } from 'vitest';
import { resolveParserFunction } from '../parser-worker';
import type { Break } from '../types';

describe('parser worker function resolution', () => {
  it('prefers the parser check export over helper exports', async () => {
    const helper = () => ({ endpoints: [] });
    const checkSecurityXss = async (): Promise<Break[]> => [];

    const resolved = resolveParserFunction('security-xss', {
      buildSecurityXssProbePlan: helper,
      containsRawScriptTag: () => false,
      checkSecurityXss,
    });

    await expect(resolved?.({} as never)).resolves.toEqual([]);
  });

  it('does not execute arbitrary helper exports when no parser check exists', () => {
    const resolved = resolveParserFunction('security-xss', {
      buildSecurityXssProbePlan: () => ({ endpoints: [] }),
      containsRawScriptTag: () => false,
    });

    expect(resolved).toBeNull();
  });
});
