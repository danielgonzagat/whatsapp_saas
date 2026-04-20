import { createHmac } from 'node:crypto';

type CheckStatus = 'pass' | 'fail' | 'skip';

type CheckResult = {
  name: string;
  status: CheckStatus;
  detail: string;
};

const colors = {
  reset: '\u001B[0m',
  red: '\u001B[31m',
  green: '\u001B[32m',
  yellow: '\u001B[33m',
  cyan: '\u001B[36m',
};

function paint(color: string, value: string) {
  return `${color}${value}${colors.reset}`;
}

function help() {
  console.log(`
Kloel production smoke test

Usage:
  npm --prefix frontend exec -- tsx scripts/smoke-test-prod.ts

Required env:
  SMOKE_SITE_URL

Optional env:
  SMOKE_AUTH_URL
  SMOKE_APP_URL
  SMOKE_API_URL
  SMOKE_META_VERIFY_TOKEN
  SMOKE_META_APP_SECRET
  SMOKE_FACEBOOK_TEST_USER_ID
  SMOKE_GOOGLE_RISC_JWT
  SMOKE_CHECKOUT_URL
  SMOKE_MAGIC_LINK_EMAIL
`);
}

function readEnv(name: string) {
  return String(process.env[name] || '').trim();
}

function normalizeBaseUrl(input: string) {
  return input.replace(/\/+$/, '');
}

function buildUrl(base: string, path: string) {
  return new URL(path, `${normalizeBaseUrl(base)}/`).toString();
}

async function fetchText(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const text = await response.text();
  return { response, text };
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { response, text, json };
}

function createFacebookSignedRequest(secret: string, userId: string) {
  const payload = {
    algorithm: 'HMAC-SHA256',
    issued_at: Math.floor(Date.now() / 1000),
    user_id: userId,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  const signature = createHmac('sha256', secret).update(encodedPayload).digest('base64');
  const encodedSignature = signature
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  return `${encodedSignature}.${encodedPayload}`;
}

function createMetaWebhookSignature(secret: string, rawBody: string) {
  return `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

async function runCheck(name: string, fn: () => Promise<CheckResult>): Promise<CheckResult> {
  try {
    return await fn();
  } catch (error: unknown) {
    return {
      name,
      status: 'fail',
      detail: error instanceof Error ? error.message : 'unknown error',
    };
  }
}

function pass(name: string, detail: string): CheckResult {
  return { name, status: 'pass', detail };
}

function fail(name: string, detail: string): CheckResult {
  return { name, status: 'fail', detail };
}

function skip(name: string, detail: string): CheckResult {
  return { name, status: 'skip', detail };
}

function assertContains(body: string, expected: string[], label: string) {
  for (const token of expected) {
    if (!body.includes(token)) {
      throw new Error(`${label} missing token: ${token}`);
    }
  }
}

async function main() {
  if (process.argv.includes('--help')) {
    help();
    return;
  }

  const siteUrl = readEnv('SMOKE_SITE_URL');
  const authUrl = readEnv('SMOKE_AUTH_URL');
  const appUrl = readEnv('SMOKE_APP_URL');
  const apiUrl = readEnv('SMOKE_API_URL');
  const metaVerifyToken = readEnv('SMOKE_META_VERIFY_TOKEN');
  const metaAppSecret = readEnv('SMOKE_META_APP_SECRET');
  const facebookTestUserId = readEnv('SMOKE_FACEBOOK_TEST_USER_ID');
  const googleRiscJwt = readEnv('SMOKE_GOOGLE_RISC_JWT');
  const checkoutUrl = readEnv('SMOKE_CHECKOUT_URL');
  const magicLinkEmail = readEnv('SMOKE_MAGIC_LINK_EMAIL');

  if (!siteUrl) {
    console.error(paint(colors.red, 'SMOKE_SITE_URL is required.'));
    process.exitCode = 1;
    return;
  }

  const results: CheckResult[] = [];

  const legalChecks: Array<{ path: string; tokens: string[] }> = [
    {
      path: '/privacy',
      tokens: ['Google API Services User Data Policy', 'Limited Use', 'Uso de informações da Meta'],
    },
    { path: '/privacy/en', tokens: ['Google API Services User Data Policy', 'Limited Use'] },
    { path: '/terms', tokens: ['Termos de Serviço', 'Lei aplicável'] },
    { path: '/terms/en', tokens: ['Terms of Service', 'Governing law'] },
    { path: '/data-deletion', tokens: ['30 dias', 'Facebook/Meta', 'Excluir conta'] },
    { path: '/data-deletion/en', tokens: ['30 days', 'Facebook/Meta', 'delete'] },
  ];

  for (const check of legalChecks) {
    results.push(
      await runCheck(`legal:${check.path}`, async () => {
        const { response, text } = await fetchText(buildUrl(siteUrl, check.path));
        if (!response.ok) {
          return fail(`legal:${check.path}`, `expected 200, got ${response.status}`);
        }
        assertContains(text, check.tokens, check.path);
        return pass(`legal:${check.path}`, `200 OK`);
      }),
    );
  }

  if (authUrl) {
    results.push(
      await runCheck('auth:login-surface', async () => {
        const { response, text } = await fetchText(buildUrl(authUrl, '/login'));
        if (!response.ok) {
          return fail('auth:login-surface', `expected 200, got ${response.status}`);
        }
        assertContains(
          text,
          [
            'Continuar com Google',
            'Continuar com Facebook',
            'Continuar com Apple',
            'link mágico',
          ],
          'auth login surface',
        );
        return pass('auth:login-surface', 'social providers and magic-link CTA rendered');
      }),
    );
  } else {
    results.push(skip('auth:login-surface', 'SMOKE_AUTH_URL not provided'));
  }

  if (appUrl) {
    results.push(
      await runCheck('auth:google-endpoint', async () => {
        const { response } = await fetchText(buildUrl(appUrl, '/api/auth/google'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ credential: 'invalid-smoke-credential' }),
        });
        if (response.status === 404) {
          return fail('auth:google-endpoint', 'route returned 404');
        }
        return pass('auth:google-endpoint', `route reachable with status ${response.status}`);
      }),
    );

    results.push(
      await runCheck('auth:facebook-endpoint', async () => {
        const { response } = await fetchText(buildUrl(appUrl, '/api/auth/facebook'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ accessToken: 'invalid-smoke-token' }),
        });
        if (response.status === 404) {
          return fail('auth:facebook-endpoint', 'route returned 404');
        }
        return pass('auth:facebook-endpoint', `route reachable with status ${response.status}`);
      }),
    );

    results.push(
      await runCheck('auth:magic-link-request', async () => {
        if (!magicLinkEmail) {
          return skip('auth:magic-link-request', 'SMOKE_MAGIC_LINK_EMAIL not provided');
        }
        const { response } = await fetchJson(buildUrl(appUrl, '/api/auth/magic-link/request'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ email: magicLinkEmail, redirectTo: '/' }),
        });
        if (!response.ok) {
          return fail('auth:magic-link-request', `expected 2xx, got ${response.status}`);
        }
        return pass('auth:magic-link-request', 'magic link request accepted');
      }),
    );
  } else {
    results.push(skip('auth:google-endpoint', 'SMOKE_APP_URL not provided'));
    results.push(skip('auth:facebook-endpoint', 'SMOKE_APP_URL not provided'));
    results.push(skip('auth:magic-link-request', 'SMOKE_APP_URL not provided'));
  }

  if (apiUrl && metaVerifyToken) {
    results.push(
      await runCheck('meta:webhook-verify', async () => {
        const challenge = 'kloel-smoke-challenge';
        const { response, text } = await fetchText(
          `${buildUrl(apiUrl, '/webhooks/meta')}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(metaVerifyToken)}&hub.challenge=${encodeURIComponent(challenge)}`,
        );
        if (!response.ok) {
          return fail('meta:webhook-verify', `expected 200, got ${response.status}`);
        }
        if (text.trim() !== challenge) {
          return fail('meta:webhook-verify', 'challenge echo mismatch');
        }
        return pass('meta:webhook-verify', 'challenge echoed');
      }),
    );
  } else {
    results.push(skip('meta:webhook-verify', 'SMOKE_API_URL or SMOKE_META_VERIFY_TOKEN missing'));
  }

  if (apiUrl && metaAppSecret) {
    results.push(
      await runCheck('meta:webhook-post', async () => {
        const payload = JSON.stringify({ object: 'page', entry: [] });
        const { response } = await fetchText(buildUrl(apiUrl, '/webhooks/meta'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Hub-Signature-256': createMetaWebhookSignature(metaAppSecret, payload),
          },
          body: payload,
        });
        if (!response.ok) {
          return fail('meta:webhook-post', `expected 200, got ${response.status}`);
        }
        return pass('meta:webhook-post', 'signed POST accepted');
      }),
    );
  } else {
    results.push(skip('meta:webhook-post', 'SMOKE_API_URL or SMOKE_META_APP_SECRET missing'));
  }

  if (apiUrl && metaAppSecret && facebookTestUserId) {
    results.push(
      await runCheck('facebook:data-deletion', async () => {
        const signedRequest = createFacebookSignedRequest(metaAppSecret, facebookTestUserId);
        const { response, json } = await fetchJson(buildUrl(apiUrl, '/auth/facebook/data-deletion'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          body: new URLSearchParams({ signed_request: signedRequest }),
        });
        if (!response.ok || !json || typeof json !== 'object') {
          return fail('facebook:data-deletion', `expected JSON success, got ${response.status}`);
        }

        const record = json as { confirmation_code?: string };
        const code = String(record.confirmation_code || '').trim();
        if (!code) {
          return fail('facebook:data-deletion', 'missing confirmation_code');
        }

        if (!appUrl) {
          return pass('facebook:data-deletion', `confirmation code created: ${code}`);
        }

        const statusResponse = await fetchJson(
          buildUrl(appUrl, `/api/compliance/deletion-status/${encodeURIComponent(code)}`),
        );
        if (!statusResponse.response.ok) {
          return fail(
            'facebook:data-deletion',
            `status lookup failed with ${statusResponse.response.status}`,
          );
        }

        return pass('facebook:data-deletion', `confirmation code ${code} created and resolvable`);
      }),
    );
  } else {
    results.push(
      skip(
        'facebook:data-deletion',
        'SMOKE_API_URL, SMOKE_META_APP_SECRET or SMOKE_FACEBOOK_TEST_USER_ID missing',
      ),
    );
  }

  if (apiUrl && metaAppSecret && facebookTestUserId) {
    results.push(
      await runCheck('facebook:deauthorize', async () => {
        const signedRequest = createFacebookSignedRequest(metaAppSecret, facebookTestUserId);
        const { response } = await fetchText(buildUrl(apiUrl, '/auth/facebook/deauthorize'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          body: new URLSearchParams({ signed_request: signedRequest }),
        });
        if (!response.ok) {
          return fail('facebook:deauthorize', `expected 200, got ${response.status}`);
        }
        return pass('facebook:deauthorize', 'signed request accepted');
      }),
    );
  } else {
    results.push(
      skip(
        'facebook:deauthorize',
        'SMOKE_API_URL, SMOKE_META_APP_SECRET or SMOKE_FACEBOOK_TEST_USER_ID missing',
      ),
    );
  }

  if (apiUrl) {
    results.push(
      await runCheck('google:risc-invalid', async () => {
        const { response } = await fetchText(buildUrl(apiUrl, '/auth/google/risc-events'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/secevent+jwt',
            Accept: 'application/json',
          },
          body: 'invalid.jwt.token',
        });
        if (response.status >= 500) {
          return fail('google:risc-invalid', `expected 4xx, got ${response.status}`);
        }
        if (response.status < 400) {
          return fail('google:risc-invalid', `expected malformed JWT rejection, got ${response.status}`);
        }
        return pass('google:risc-invalid', `malformed SET rejected with ${response.status}`);
      }),
    );

    results.push(
      await runCheck('google:risc-valid', async () => {
        if (!googleRiscJwt) {
          return skip('google:risc-valid', 'SMOKE_GOOGLE_RISC_JWT not provided');
        }
        const { response } = await fetchText(buildUrl(apiUrl, '/auth/google/risc-events'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/secevent+jwt',
            Accept: 'application/json',
          },
          body: googleRiscJwt,
        });
        if (response.status !== 202) {
          return fail('google:risc-valid', `expected 202, got ${response.status}`);
        }
        return pass('google:risc-valid', 'valid SET accepted');
      }),
    );
  } else {
    results.push(skip('google:risc-invalid', 'SMOKE_API_URL not provided'));
    results.push(skip('google:risc-valid', 'SMOKE_API_URL not provided'));
  }

  if (checkoutUrl) {
    results.push(
      await runCheck('checkout:autofill-surface', async () => {
        const { response, text } = await fetchText(checkoutUrl);
        if (!response.ok) {
          return fail('checkout:autofill-surface', `expected 200, got ${response.status}`);
        }
        assertContains(
          text,
          [
            'autocomplete="cc-name"',
            'autocomplete="cc-number"',
            'autocomplete="cc-exp"',
            'autocomplete="cc-csc"',
            'autocomplete="email"',
            'autocomplete="tel"',
            'autocomplete="postal-code"',
            'autocomplete="address-line1"',
            'autocomplete="address-level2"',
            'autocomplete="address-level1"',
            '<form',
          ],
          'checkout HTML',
        );
        return pass('checkout:autofill-surface', 'autofill attributes found');
      }),
    );
  } else {
    results.push(skip('checkout:autofill-surface', 'SMOKE_CHECKOUT_URL not provided'));
  }

  console.log(paint(colors.cyan, '\nKloel smoke test results\n'));

  for (const result of results) {
    const icon =
      result.status === 'pass'
        ? paint(colors.green, 'PASS')
        : result.status === 'fail'
          ? paint(colors.red, 'FAIL')
          : paint(colors.yellow, 'SKIP');
    console.log(`${icon} ${result.name} — ${result.detail}`);
  }

  const failures = results.filter((item) => item.status === 'fail').length;
  const passes = results.filter((item) => item.status === 'pass').length;
  const skips = results.filter((item) => item.status === 'skip').length;

  console.log(
    `\nSummary: ${paint(colors.green, String(passes))} passed, ${paint(colors.red, String(failures))} failed, ${paint(colors.yellow, String(skips))} skipped`,
  );

  if (failures > 0) {
    process.exitCode = 1;
  }
}

void main();
