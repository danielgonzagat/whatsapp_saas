import { describe, expect, it } from 'vitest';

import { deletionStatusCopy, formatDeletionProviderLabel } from './data-deletion-status';

describe('data deletion status copy', () => {
  it('keeps pt-BR labels for public status states', () => {
    expect(deletionStatusCopy.completed).toEqual({
      label: 'Concluído',
      detail:
        'O fluxo de exclusão foi concluído e os dados remanescentes seguem retenção legal.',
    });
  });

  it('formats provider labels for public display', () => {
    expect(formatDeletionProviderLabel('facebook')).toBe('Facebook');
    expect(formatDeletionProviderLabel('google')).toBe('Google');
    expect(formatDeletionProviderLabel('self')).toBe('Autoatendimento Kloel');
    expect(formatDeletionProviderLabel('custom-provider')).toBe('custom-provider');
  });
});
