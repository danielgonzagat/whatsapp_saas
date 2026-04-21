import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { middleware } from './middleware';

const AUTHENTICATED_COOKIE =
  'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0=.eyJzdWIiOiJ1c2VyLTEiLCJlbWFpbCI6InVzZXJAZXhhbXBsZS5jb20ifQ==.';

function buildRequest(url: string) {
  return new NextRequest(url, {
    headers: {
      cookie: `kloel_access_token=${AUTHENTICATED_COOKIE}`,
    },
  });
}

describe('frontend middleware auth host routing', () => {
  it('keeps legal routes public on the auth host even with an authenticated cookie', () => {
    const response = middleware(buildRequest('https://auth.kloel.com/terms?_rsc=test-prefetch'));

    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('still redirects authenticated login visits back to the app host', () => {
    const response = middleware(buildRequest('https://auth.kloel.com/login'));

    expect(response.headers.get('location')).toBe('https://app.kloel.com/');
  });
});
