import { describe, expect, it } from 'vitest';
import type { KloelGlobalSearchResult } from '@/lib/api/kloel-search';

const UTILS_MODULE = './command-palette-utils';

type UtilsModule = {
  mapGlobalSearchPayload: (payload: KloelGlobalSearchResult) => {
    id: string;
    type?: string;
    title: string;
    matchedContent?: string;
    href?: string;
    updatedAt?: string;
  };
};

async function loadUtils(): Promise<UtilsModule> {
  return (await import(UTILS_MODULE)) as unknown as UtilsModule;
}

describe('command palette global search mapping', () => {
  it('preserves result href/type and uses backend preview as matched content', async () => {
    const { mapGlobalSearchPayload } = await loadUtils();

    expect(
      mapGlobalSearchPayload({
        id: 'prod-1',
        type: 'product',
        title: 'PDRN real',
        href: '/products/prod-1',
        subtitle: 'Produto - Saude',
        preview: 'Bioestimulador cadastrado',
        updatedAt: '2026-05-10T10:00:00.000Z',
      }),
    ).toEqual(
      expect.objectContaining({
        id: 'prod-1',
        type: 'product',
        title: 'PDRN real',
        href: '/products/prod-1',
        matchedContent: 'Produto - Saude - Bioestimulador cadastrado',
        updatedAt: '2026-05-10T10:00:00.000Z',
      }),
    );
  });
});
