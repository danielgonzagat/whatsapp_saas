import { MetaAuthController } from './meta-auth.controller';
import type { MetaWhatsAppService } from './meta-whatsapp.service';

interface ControllerInternals {
  sanitizeReturnTo: (returnTo: string | null | undefined, channel?: string | null) => string;
  humanizeMetaError: (msg: string, code?: string | number | null) => string;
}

function makeController(opts?: { frontendUrl?: string }) {
  const prev = process.env.FRONTEND_URL;
  process.env.FRONTEND_URL = opts?.frontendUrl ?? 'https://app.kloel.com';

  const metaWhatsApp = {
    resolveRedirect: jest.fn().mockReturnValue({
      redirectUri: 'https://api.kloel.com/meta/auth/callback',
      source: 'BACKEND_PUBLIC_URL',
      baseUrl: 'https://api.kloel.com',
      isFallback: false,
    }),
    getRequestedScopesForChannel: jest
      .fn()
      .mockImplementation((c: string) => [`scope:${c}:1`, `scope:${c}:2`]),
    buildEmbeddedSignupUrl: jest.fn(),
    getOAuthRedirectUri: jest.fn().mockReturnValue('https://api.kloel.com/meta/auth/callback'),
  } satisfies Partial<MetaWhatsAppService> as unknown as MetaWhatsAppService;

  const controller = new MetaAuthController({} as never, metaWhatsApp, {
    metaConnection: {},
  } as never);

  const cleanup = () => {
    if (prev === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = prev;
  };

  return { controller, metaWhatsApp, cleanup };
}

function internals(controller: MetaAuthController): ControllerInternals {
  return controller as unknown as ControllerInternals;
}

describe('MetaAuthController.sanitizeReturnTo', () => {
  it('returns the path when it is a safe internal path', () => {
    const { controller, cleanup } = makeController();
    try {
      expect(internals(controller).sanitizeReturnTo('/marketing/whatsapp', 'whatsapp')).toBe(
        '/marketing/whatsapp',
      );
    } finally {
      cleanup();
    }
  });

  it('preserves query string and hash for safe paths', () => {
    const { controller, cleanup } = makeController();
    try {
      expect(internals(controller).sanitizeReturnTo('/inbox?tab=open#42', 'whatsapp')).toBe(
        '/inbox?tab=open#42',
      );
    } finally {
      cleanup();
    }
  });

  it('rejects protocol-relative URLs that would redirect off-site', () => {
    const { controller, cleanup } = makeController();
    try {
      expect(internals(controller).sanitizeReturnTo('//evil.example.com/path', 'whatsapp')).toBe(
        '/marketing/whatsapp',
      );
    } finally {
      cleanup();
    }
  });

  it('rejects backslash tricks that some browsers normalize to forward slashes', () => {
    const { controller, cleanup } = makeController();
    try {
      expect(internals(controller).sanitizeReturnTo('/\\evil.example.com', 'instagram')).toBe(
        '/marketing/instagram',
      );
    } finally {
      cleanup();
    }
  });

  it('rejects URL-encoded slash/backslash tricks', () => {
    const { controller, cleanup } = makeController();
    try {
      expect(internals(controller).sanitizeReturnTo('/%2fevil.example.com', 'facebook')).toBe(
        '/marketing/facebook',
      );
      expect(internals(controller).sanitizeReturnTo('/%5cevil.example.com', 'facebook')).toBe(
        '/marketing/facebook',
      );
    } finally {
      cleanup();
    }
  });

  it('rejects absolute URLs with non-http schemes', () => {
    const { controller, cleanup } = makeController();
    try {
      expect(internals(controller).sanitizeReturnTo('javascript:alert(1)', 'whatsapp')).toBe(
        '/marketing/whatsapp',
      );
      expect(internals(controller).sanitizeReturnTo('data:text/html,', null)).toBe(
        '/settings?section=apps',
      );
    } finally {
      cleanup();
    }
  });

  it('rejects CRLF injection in returnTo', () => {
    const { controller, cleanup } = makeController();
    try {
      expect(internals(controller).sanitizeReturnTo('/ok\r\nSet-Cookie: bad', 'whatsapp')).toBe(
        '/marketing/whatsapp',
      );
    } finally {
      cleanup();
    }
  });

  it('falls back to channel default when returnTo is empty', () => {
    const { controller, cleanup } = makeController();
    try {
      expect(internals(controller).sanitizeReturnTo('', 'instagram')).toBe('/marketing/instagram');
      expect(internals(controller).sanitizeReturnTo(null, 'facebook')).toBe('/marketing/facebook');
    } finally {
      cleanup();
    }
  });

  it('falls back to /settings?section=apps when channel is unknown', () => {
    const { controller, cleanup } = makeController();
    try {
      expect(internals(controller).sanitizeReturnTo(null, 'tiktok')).toBe('/settings?section=apps');
      expect(internals(controller).sanitizeReturnTo(null, null)).toBe('/settings?section=apps');
    } finally {
      cleanup();
    }
  });
});

describe('MetaAuthController.humanizeMetaError', () => {
  it('maps Graph API error code 190 to token expired/revoked message', () => {
    const { controller, cleanup } = makeController();
    try {
      const out = internals(controller).humanizeMetaError('Session has expired', 190);
      expect(out.toLowerCase()).toContain('token');
    } finally {
      cleanup();
    }
  });

  it('maps Graph API error code 200 to permission message', () => {
    const { controller, cleanup } = makeController();
    try {
      const out = internals(controller).humanizeMetaError('Permissions error', 200);
      expect(out.toLowerCase()).toContain('permiss');
    } finally {
      cleanup();
    }
  });

  it('maps the "URL not in app domains" Meta error to the dedicated message', () => {
    const { controller, cleanup } = makeController();
    try {
      const out = internals(controller).humanizeMetaError(
        "The URL's domain (api.kloel.com) is not included in the app's domains",
        100,
      );
      expect(out.toLowerCase()).toContain('redirect_uri');
    } finally {
      cleanup();
    }
  });

  it('maps rate-limit codes 4/17/32/613', () => {
    const { controller, cleanup } = makeController();
    try {
      for (const code of [4, 17, 32, 613]) {
        const out = internals(controller).humanizeMetaError('Anything', code);
        expect(out.toLowerCase()).toContain('limite');
      }
    } finally {
      cleanup();
    }
  });

  it('falls back to a generic message when nothing matches', () => {
    const { controller, cleanup } = makeController();
    try {
      const out = internals(controller).humanizeMetaError('Internal error', null);
      expect(out.length).toBeGreaterThan(0);
    } finally {
      cleanup();
    }
  });
});

describe('MetaAuthController.getDiagnostics', () => {
  const ORIGINAL_ENV = { ...process.env };
  afterEach(() => {
    for (const k of Object.keys(process.env)) delete process.env[k];
    Object.assign(process.env, ORIGINAL_ENV);
  });

  it('exposes redirect URI, masked appId, and per-channel scopes', () => {
    process.env.META_APP_ID = '1234567890';
    process.env.META_APP_SECRET = 'secret';
    process.env.META_VERIFY_TOKEN = 'verify';
    process.env.META_GRAPH_API_VERSION = 'v21.0';

    const { controller, cleanup } = makeController();
    try {
      const d = controller.getDiagnostics();
      expect(d.redirectUri).toBe('https://api.kloel.com/meta/auth/callback');
      expect(d.redirectUriSource).toBe('BACKEND_PUBLIC_URL');
      expect(d.isFallback).toBe(false);
      expect(d.appId).toBe('1234…7890');
      expect(d.appIdSet).toBe(true);
      expect(d.appSecretSet).toBe(true);
      expect(d.verifyTokenSet).toBe(true);
      expect(d.graphApiVersion).toBe('v21.0');
      expect(d.scopes.whatsapp.length).toBeGreaterThan(0);
      expect(d.scopes.instagram.length).toBeGreaterThan(0);
      expect(d.scopes.facebook.length).toBeGreaterThan(0);
      expect(d.checklist.appCredentialsPresent).toBe(true);
      expect(d.checklist.backendUrlRegistered).toBe(true);
      expect(d.checklist.webhookVerifyTokenPresent).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('does not leak the App Secret value', () => {
    process.env.META_APP_ID = '12345';
    process.env.META_APP_SECRET = 'super-secret-do-not-leak';

    const { controller, cleanup } = makeController();
    try {
      const d = controller.getDiagnostics();
      const serialized = JSON.stringify(d);
      expect(serialized).not.toContain('super-secret-do-not-leak');
    } finally {
      cleanup();
    }
  });
});
