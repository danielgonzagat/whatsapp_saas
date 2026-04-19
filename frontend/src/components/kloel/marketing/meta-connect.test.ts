import { describe, expect, it } from 'vitest';
import { resolveMetaConnectUrl } from './meta-connect';

describe('resolveMetaConnectUrl', () => {
  it('accepts a top-level url from normalized api responses', () => {
    expect(
      resolveMetaConnectUrl({
        data: {},
        url: 'https://www.facebook.com/dialog/oauth?client_id=top-level',
      } as never),
    ).toBe('https://www.facebook.com/dialog/oauth?client_id=top-level');
  });

  it('returns the official Meta URL when the backend provides one', () => {
    expect(
      resolveMetaConnectUrl({
        data: {
          url: 'https://www.facebook.com/dialog/oauth?client_id=123',
        },
      }),
    ).toBe('https://www.facebook.com/dialog/oauth?client_id=123');
  });

  it('accepts nested data payloads from legacy callers that still expect data.data.url', () => {
    expect(
      resolveMetaConnectUrl({
        data: {
          data: {
            url: 'https://www.facebook.com/dialog/oauth?client_id=legacy',
          },
        },
      } as never),
    ).toBe('https://www.facebook.com/dialog/oauth?client_id=legacy');
  });

  it('surfaces the backend error message instead of replacing it with a generic fallback', () => {
    expect(() =>
      resolveMetaConnectUrl({
        error: 'Meta Embedded Signup não configurado no servidor.',
      }),
    ).toThrow('Meta Embedded Signup não configurado no servidor.');
  });

  it('falls back to a stable generic error when neither url nor backend message is present', () => {
    expect(() => resolveMetaConnectUrl({})).toThrow(
      'Nao foi possivel iniciar a conexao oficial da Meta.',
    );
  });
});
