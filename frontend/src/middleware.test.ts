import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { middleware } from './middleware';

const AUTHENTICATED_COOKIE =
  'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0=.eyJzdWIiOiJ1c2VyLTEiLCJlbWFpbCI6InVzZXJAZXhhbXBsZS5jb20ifQ==.';

const ANONYMOUS_COOKIE =
  'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0=.eyJndWVzdCI6dHJ1ZSwiZW1haWwiOiJndWVzdEBndWVzdC5rbG9lbC5sb2NhbCJ9.';

function buildRequest(url: string, opts?: { authenticated?: boolean; anonymous?: boolean }) {
  const headers: Record<string, string> = {};

  if (opts?.anonymous) {
    headers.cookie = `kloel_access_token=${ANONYMOUS_COOKIE}`;
  } else if (opts?.authenticated !== false) {
    headers.cookie = `kloel_access_token=${AUTHENTICATED_COOKIE}`;
  }

  return new NextRequest(url, { headers });
}

function buildUnauthenticatedRequest(url: string) {
  return new NextRequest(url);
}

function expectNext(response: Response) {
  expect(response.headers.get('x-middleware-next')).toBe('1');
}

function expectRedirect(response: Response, expectedUrl: string) {
  expect(response.headers.get('location')).toBe(expectedUrl);
}

function expectRewrite(response: Response, expectedPathname: string) {
  expect(response.headers.get('x-middleware-rewrite')).toContain(expectedPathname);
}

/* ─── Static / API paths pass through ──────────────────────────────────── */

describe('static and api paths', () => {
  it('passes through _next/static requests', () => {
    const response = middleware(buildRequest('https://app.kloel.com/_next/static/chunk.js'));
    expectNext(response);
  });

  it('passes through _next/image requests', () => {
    const response = middleware(buildRequest('https://app.kloel.com/_next/image?url=/logo.png'));
    expectNext(response);
  });

  it('passes through favicon.ico', () => {
    const response = middleware(buildRequest('https://app.kloel.com/favicon.ico'));
    expectNext(response);
  });

  it('passes through .svg files', () => {
    const response = middleware(buildRequest('https://app.kloel.com/logo.svg'));
    expectNext(response);
  });

  it('passes through .css files', () => {
    const response = middleware(buildRequest('https://app.kloel.com/styles.css'));
    expectNext(response);
  });

  it('passes through .js files', () => {
    const response = middleware(buildRequest('https://app.kloel.com/app.js'));
    expectNext(response);
  });

  it('passes through api routes', () => {
    const response = middleware(buildRequest('https://app.kloel.com/api/auth/login'));
    expectNext(response);
  });
});

/* ─── Pay host routing ─────────────────────────────────────────────────── */

describe('pay host routing', () => {
  it('redirects pay host root to marketing', () => {
    const response = middleware(buildRequest('https://pay.kloel.com/'));
    expectRedirect(response, 'https://kloel.com/');
  });

  it('allows /order/* paths on pay host', () => {
    const response = middleware(buildRequest('https://pay.kloel.com/order/abc123'));
    expectNext(response);
  });

  it('allows /r/* paths on pay host', () => {
    const response = middleware(buildRequest('https://pay.kloel.com/r/abc123'));
    expectNext(response);
  });

  it('rewrites valid 8-char checkout codes to /r/* on pay host', () => {
    const response = middleware(buildRequest('https://pay.kloel.com/AbCdEf12'));
    expectRewrite(response, '/r/AbCdEf12');
  });

  it('redirects unrecognized paths on pay host to marketing', () => {
    const response = middleware(buildRequest('https://pay.kloel.com/nonexistent/path'));
    expectRedirect(response, 'https://kloel.com/');
  });

  it('redirects pay host root with query params to marketing', () => {
    const response = middleware(buildRequest('https://pay.kloel.com/?utm_source=fb'));
    expectRedirect(response, 'https://kloel.com/');
  });
});

/* ─── Marketing host routing ───────────────────────────────────────────── */

describe('marketing host routing', () => {
  it('allows marketing host root', () => {
    const response = middleware(buildRequest('https://kloel.com/'));
    expectNext(response);
  });

  it('allows /terms on marketing host', () => {
    const response = middleware(buildRequest('https://kloel.com/terms'));
    expectNext(response);
  });

  it('allows /privacy on marketing host', () => {
    const response = middleware(buildRequest('https://kloel.com/privacy'));
    expectNext(response);
  });

  it('redirects /login on marketing host to auth host', () => {
    const response = middleware(buildRequest('https://kloel.com/login'));
    expectRedirect(response, 'https://auth.kloel.com/login');
  });

  it('redirects known app paths on marketing host for unauthenticated users to login', () => {
    const response = middleware(buildUnauthenticatedRequest('https://kloel.com/dashboard'));
    const location = response.headers.get('location')!;
    expect(location).toContain('auth.kloel.com/login');
    expect(location).toContain('forceAuth=1');
  });

  it('redirects known app paths on marketing host for authenticated users to app host', () => {
    const response = middleware(buildRequest('https://kloel.com/dashboard'));
    expect(response.headers.get('location')).toMatch(/^https:\/\/app\.kloel\.com/);
  });

  it('redirects unknown paths on marketing host to marketing root', () => {
    const response = middleware(buildUnauthenticatedRequest('https://kloel.com/unknown'));
    expectRedirect(response, 'https://kloel.com/');
  });

  it('redirects /register on marketing host to auth host', () => {
    const response = middleware(buildRequest('https://kloel.com/register'));
    expectRedirect(response, 'https://auth.kloel.com/register');
  });
});

/* ─── Auth host routing ────────────────────────────────────────────────── */

describe('auth host routing', () => {
  it('redirects authenticated users on auth host /login to app host /', () => {
    const response = middleware(buildRequest('https://auth.kloel.com/login'));
    expectRedirect(response, 'https://app.kloel.com/');
  });

  it('keeps legal routes public on the auth host even with an authenticated cookie', () => {
    const response = middleware(buildRequest('https://auth.kloel.com/terms?_rsc=test-prefetch'));
    expect(response.headers.get('location')).toBeNull();
    expectNext(response);
  });

  it('keeps legal routes public on the auth host without an authenticated cookie', () => {
    const response = middleware(buildUnauthenticatedRequest('https://auth.kloel.com/privacy'));
    expectNext(response);
  });

  it('redirects authenticated users from auth host register to app host', () => {
    const response = middleware(buildRequest('https://auth.kloel.com/register'));
    expectRedirect(response, 'https://app.kloel.com/');
  });

  it('redirects anonymous users on auth host root to login with forceAuth', () => {
    const response = middleware(buildUnauthenticatedRequest('https://auth.kloel.com/'));
    expectRedirect(response, 'https://auth.kloel.com/login?forceAuth=1');
  });

  it('allows anonymous users to access login on auth host', () => {
    const response = middleware(buildUnauthenticatedRequest('https://auth.kloel.com/login'));
    expectNext(response);
  });

  it('allows anonymous users to access register on auth host', () => {
    const response = middleware(buildUnauthenticatedRequest('https://auth.kloel.com/register'));
    expectNext(response);
  });

  it('redirects anonymous users from unknown app paths on auth host to login', () => {
    const response = middleware(buildUnauthenticatedRequest('https://auth.kloel.com/dashboard'));
    const location = response.headers.get('location')!;
    expect(location).toContain('auth.kloel.com/login');
    expect(location).toContain('forceAuth=1');
  });

  it('handles forceAuth query param on auth host root', () => {
    const response = middleware(
      buildRequest('https://auth.kloel.com/?forceAuth=1'),
    );
    expectRedirect(response, 'https://auth.kloel.com/login?forceAuth=1');
  });

  it('allows forceAuth on login page on auth host', () => {
    const response = middleware(
      buildRequest('https://auth.kloel.com/login?forceAuth=1'),
    );
    expectNext(response);
  });

  it('handles forceAuth with next param on auth host root', () => {
    const response = middleware(
      buildRequest('https://auth.kloel.com/?forceAuth=1&next=%2Fdashboard'),
    );
    const location = response.headers.get('location')!;
    expect(location).toContain('https://auth.kloel.com/login');
    expect(location).toContain('forceAuth=1');
    expect(location).toContain('next=');
  });
});

/* ─── App host routing ─────────────────────────────────────────────────── */

describe('app host routing', () => {
  it('rewrites app host root to /chat for authenticated users', () => {
    const response = middleware(buildRequest('https://app.kloel.com/'));
    expectRewrite(response, '/chat');
  });

  it('redirects app host root to login for unauthenticated users', () => {
    const response = middleware(buildUnauthenticatedRequest('https://app.kloel.com/'));
    const location = response.headers.get('location')!;
    expect(location).toContain('auth.kloel.com/login');
    expect(location).toContain('forceAuth=1');
  });

  it('allows /auth/impersonate on app host', () => {
    const response = middleware(buildUnauthenticatedRequest('https://app.kloel.com/auth/impersonate'));
    expectNext(response);
  });

  it('allows /dashboard on app host regardless of auth', () => {
    const response = middleware(buildUnauthenticatedRequest('https://app.kloel.com/dashboard'));
    expectNext(response);
  });

  it('redirects unauthenticated users on app host known paths to login', () => {
    const response = middleware(buildUnauthenticatedRequest('https://app.kloel.com/products'));
    const location = response.headers.get('location')!;
    expect(location).toContain('auth.kloel.com/login');
    expect(location).toContain('forceAuth=1');
  });

  it('allows authenticated users on app host known paths', () => {
    const response = middleware(buildRequest('https://app.kloel.com/products'));
    expectNext(response);
  });

  it('redirects legal paths on app host to marketing host', () => {
    const response = middleware(buildRequest('https://app.kloel.com/terms'));
    expectRedirect(response, 'https://kloel.com/terms');
  });

  it('redirects unknown paths on app host to app root', () => {
    const response = middleware(buildRequest('https://app.kloel.com/some-bogus-path'));
    expectRedirect(response, 'https://app.kloel.com/');
  });

  it('preserves query params when redirecting authenticated users from app root to /chat', () => {
    const response = middleware(buildRequest('https://app.kloel.com/?ref=test'));
    expectRewrite(response, '/chat');
  });
});

/* ─── Unknown host routing ─────────────────────────────────────────────── */

describe('unknown host routing', () => {
  it('allows root on unknown hosts', () => {
    const response = middleware(buildUnauthenticatedRequest('https://example.com/'));
    expectNext(response);
  });

  it('allows login on unknown hosts', () => {
    const response = middleware(buildUnauthenticatedRequest('https://example.com/login'));
    expectNext(response);
  });

  it('allows legal paths on unknown hosts', () => {
    const response = middleware(buildUnauthenticatedRequest('https://example.com/terms'));
    expectNext(response);
  });

  it('redirects unauthenticated users from known app paths on unknown hosts to login', () => {
    const response = middleware(buildUnauthenticatedRequest('https://example.com/dashboard'));
    const location = response.headers.get('location')!;
    expect(location).toContain('/login');
    expect(location).toContain('next=');
  });

  it('allows authenticated users on unknown hosts for every path', () => {
    const response = middleware(buildRequest('https://example.com/some-path'));
    expectNext(response);
  });
});

/* ─── Legal paths ──────────────────────────────────────────────────────── */

describe('legal paths', () => {
  it('allows /terms on auth host for anonymous users', () => {
    const response = middleware(buildUnauthenticatedRequest('https://auth.kloel.com/terms'));
    expectNext(response);
  });

  it('allows /privacy on auth host for anonymous users', () => {
    const response = middleware(buildUnauthenticatedRequest('https://auth.kloel.com/privacy'));
    expectNext(response);
  });

  it('allows /cookies on auth host for anonymous users', () => {
    const response = middleware(buildUnauthenticatedRequest('https://auth.kloel.com/cookies'));
    expectNext(response);
  });

  it('allows /data-deletion on auth host for anonymous users', () => {
    const response = middleware(buildUnauthenticatedRequest('https://auth.kloel.com/data-deletion'));
    expectNext(response);
  });

  it('allows sub-path under /terms on auth host', () => {
    const response = middleware(buildUnauthenticatedRequest('https://auth.kloel.com/terms/sub-page'));
    expectNext(response);
  });
});

/* ─── Login redirect preserves next path ───────────────────────────────── */

describe('login redirect preserves next path', () => {
  it('includes next path when redirecting to login from app host', () => {
    const response = middleware(
      buildUnauthenticatedRequest('https://app.kloel.com/products?foo=bar'),
    );
    const location = response.headers.get('location')!;
    expect(location).toContain('auth.kloel.com/login');
    expect(location).toContain('forceAuth=1');
    expect(location).toContain('next=');
  });

  it('includes next path when redirecting to login from marketing host', () => {
    const response = middleware(
      buildUnauthenticatedRequest('https://kloel.com/dashboard?ref=home'),
    );
    const location = response.headers.get('location')!;
    expect(location).toContain('auth.kloel.com/login');
    expect(location).toContain('forceAuth=1');
    expect(location).toContain('next=');
  });
});
