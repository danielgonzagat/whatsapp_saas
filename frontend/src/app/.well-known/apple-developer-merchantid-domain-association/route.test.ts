import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it } from 'vitest';
import { GET } from './route';

const originalAssociation = process.env.APPLE_PAY_DOMAIN_ASSOCIATION;
const originalAssociationAlias = process.env.APPLE_DEVELOPER_MERCHANTID_DOMAIN_ASSOCIATION;

function requestFor(host: string) {
  return new NextRequest(`https://${host}/.well-known/apple-developer-merchantid-domain-association`);
}

afterEach(() => {
  if (originalAssociation === undefined) {
    delete process.env.APPLE_PAY_DOMAIN_ASSOCIATION;
  } else {
    process.env.APPLE_PAY_DOMAIN_ASSOCIATION = originalAssociation;
  }

  if (originalAssociationAlias === undefined) {
    delete process.env.APPLE_DEVELOPER_MERCHANTID_DOMAIN_ASSOCIATION;
  } else {
    process.env.APPLE_DEVELOPER_MERCHANTID_DOMAIN_ASSOCIATION = originalAssociationAlias;
  }
});

describe('Apple Pay merchant-domain association route', () => {
  it('serves the configured association file on pay.kloel.com', async () => {
    process.env.APPLE_PAY_DOMAIN_ASSOCIATION = 'merchant-domain-association-content';

    const response = await GET(requestFor('pay.kloel.com'));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/octet-stream');
    expect(await response.text()).toBe('merchant-domain-association-content');
  });

  it('does not serve the Apple Pay verification file from non-checkout domains', async () => {
    process.env.APPLE_PAY_DOMAIN_ASSOCIATION = 'merchant-domain-association-content';

    const response = await GET(requestFor('app.kloel.com'));

    expect(response.status).toBe(404);
  });

  it('fails closed when the association file is not configured', async () => {
    delete process.env.APPLE_PAY_DOMAIN_ASSOCIATION;
    delete process.env.APPLE_DEVELOPER_MERCHANTID_DOMAIN_ASSOCIATION;

    const response = await GET(requestFor('pay.kloel.com'));

    expect(response.status).toBe(503);
  });
});
