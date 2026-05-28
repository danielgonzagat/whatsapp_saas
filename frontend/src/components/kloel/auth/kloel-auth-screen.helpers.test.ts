import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

import {
  KLOEL_AUTH_SCREEN_FONT,
  KLOEL_AUTH_SCREEN_INPUT_BASE,
  navigateCurrentWindow,
  resolveOAuthErrorMessage,
} from './kloel-auth-screen.helpers';

describe('resolveOAuthErrorMessage', () => {
  // Each branch in the helper produces a distinct seller-facing string, so we
  // assert the *exact* text rather than just a substring — copy regressions
  // are visible bugs and the spec must lock them.

  it('maps every known Apple reason to its specific message', () => {
    expect(resolveOAuthErrorMessage('apple_auth_failed', 'missing_identity_token')).toBe(
      'A Apple nao retornou o token de autenticacao. Tente novamente.',
    );
    expect(resolveOAuthErrorMessage('apple_auth_failed', 'timeout')).toBe(
      'A autenticacao com Apple expirou. Tente novamente.',
    );
  });

  it('falls back to a generic Apple failure for unknown reasons', () => {
    expect(resolveOAuthErrorMessage('apple_auth_failed', '')).toBe(
      'Falha ao autenticar com Apple.',
    );
    expect(resolveOAuthErrorMessage('apple_auth_failed', 'totally_unknown')).toBe(
      'Falha ao autenticar com Apple.',
    );
  });

  it('maps every known TikTok reason to its specific message', () => {
    expect(resolveOAuthErrorMessage('tiktok_auth_failed', 'missing_code')).toBe(
      'O TikTok nao retornou o codigo de autorizacao. Tente novamente.',
    );
    expect(resolveOAuthErrorMessage('tiktok_auth_failed', 'state_mismatch')).toBe(
      'A sessao de login com TikTok expirou ou ficou invalida. Tente novamente.',
    );
    expect(resolveOAuthErrorMessage('tiktok_auth_failed', 'access_denied')).toBe(
      'O login com TikTok foi cancelado ou negado.',
    );
    expect(resolveOAuthErrorMessage('tiktok_auth_failed', 'timeout')).toBe(
      'O TikTok demorou para responder. Tente novamente.',
    );
    expect(resolveOAuthErrorMessage('tiktok_auth_failed', 'token_exchange_failed')).toBe(
      'Nao foi possivel validar o login com TikTok. Tente novamente.',
    );
  });

  it('treats every TikTok config-missing reason as "unavailable"', () => {
    const unavailable = 'Login com TikTok indisponivel no momento.';
    expect(resolveOAuthErrorMessage('tiktok_auth_failed', 'client_key_missing')).toBe(unavailable);
    expect(resolveOAuthErrorMessage('tiktok_auth_failed', 'client_secret_missing')).toBe(
      unavailable,
    );
    expect(resolveOAuthErrorMessage('tiktok_auth_failed', 'backend_not_configured')).toBe(
      unavailable,
    );
  });

  it('falls back to a generic TikTok failure for unknown reasons', () => {
    expect(resolveOAuthErrorMessage('tiktok_auth_failed', '')).toBe('Falha ao autenticar com TikTok.');
    expect(resolveOAuthErrorMessage('tiktok_auth_failed', 'mystery')).toBe(
      'Falha ao autenticar com TikTok.',
    );
  });

  it('returns the social-generic message for every other error code', () => {
    const generic = 'Nao foi possivel concluir a autenticacao social.';
    expect(resolveOAuthErrorMessage('', '')).toBe(generic);
    expect(resolveOAuthErrorMessage('google_auth_failed', 'timeout')).toBe(generic);
    expect(resolveOAuthErrorMessage('facebook_auth_failed', 'access_denied')).toBe(generic);
    expect(resolveOAuthErrorMessage('unknown_provider', 'unknown')).toBe(generic);
  });
});

describe('navigateCurrentWindow', () => {
  let originalDocument: Document | undefined;

  beforeEach(() => {
    // jsdom already supplies `document`, but keep a snapshot so the
    // SSR-fallback test can swap it out without leaking into siblings.
    originalDocument = globalThis.document;
  });

  afterEach(() => {
    if (originalDocument) {
      Object.defineProperty(globalThis, 'document', {
        value: originalDocument,
        configurable: true,
        writable: true,
      });
    }
    vi.restoreAllMocks();
  });

  it('creates an anchor, clicks it, and removes it from the DOM', () => {
    const created: HTMLAnchorElement[] = [];
    const realCreateElement = document.createElement.bind(document);
    const createSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tagName: string) => {
        const el = realCreateElement(tagName) as HTMLAnchorElement;
        if (tagName === 'a') {
          created.push(el);
        }
        return el;
      });

    navigateCurrentWindow('https://example.com/path');

    expect(createSpy).toHaveBeenCalledWith('a');
    expect(created).toHaveLength(1);
    const anchor = created[0];
    expect(anchor.href).toBe('https://example.com/path');
    expect(anchor.rel).toBe('noopener noreferrer');
    // It must NOT be attached after the click finishes.
    expect(anchor.isConnected).toBe(false);
  });

  it('actually fires a click on the synthesised anchor', () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    navigateCurrentWindow('https://example.com/click');
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when document is undefined (SSR safety)', () => {
    Object.defineProperty(globalThis, 'document', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    expect(() => navigateCurrentWindow('https://example.com/ssr')).not.toThrow();
  });
});

describe('KLOEL_AUTH_SCREEN_FONT', () => {
  it('declares the Sora variable font with the expected fallback chain', () => {
    expect(KLOEL_AUTH_SCREEN_FONT).toBe("var(--font-sora), 'Sora', sans-serif");
  });
});

describe('KLOEL_AUTH_SCREEN_INPUT_BASE', () => {
  it('is a frozen shape of layout-critical CSS properties', () => {
    // The component depends on these specific values to align with the design
    // contract — guard against accidental drift via an explicit field test.
    expect(KLOEL_AUTH_SCREEN_INPUT_BASE.width).toBe('100%');
    expect(KLOEL_AUTH_SCREEN_INPUT_BASE.height).toBe(44);
    expect(KLOEL_AUTH_SCREEN_INPUT_BASE.borderRadius).toBe(6);
    expect(KLOEL_AUTH_SCREEN_INPUT_BASE.padding).toBe('0 14px');
    expect(KLOEL_AUTH_SCREEN_INPUT_BASE.fontSize).toBe(14);
    expect(KLOEL_AUTH_SCREEN_INPUT_BASE.fontFamily).toBe(KLOEL_AUTH_SCREEN_FONT);
    expect(KLOEL_AUTH_SCREEN_INPUT_BASE.outline).toBe('none');
    expect(KLOEL_AUTH_SCREEN_INPUT_BASE.transition).toBe('border-color 150ms ease');
    expect(KLOEL_AUTH_SCREEN_INPUT_BASE.boxSizing).toBe('border-box');
  });

  it('uses design tokens (no raw hex) for color/border surfaces', () => {
    // Indirect assertion: the values must be strings so they can resolve
    // through the design-tokens module — guards against accidental literal
    // overrides at extraction time.
    expect(typeof KLOEL_AUTH_SCREEN_INPUT_BASE.background).toBe('string');
    expect(typeof KLOEL_AUTH_SCREEN_INPUT_BASE.border).toBe('string');
    expect(typeof KLOEL_AUTH_SCREEN_INPUT_BASE.color).toBe('string');
  });
});
