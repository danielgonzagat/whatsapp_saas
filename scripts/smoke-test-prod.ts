import { createHmac } from 'node:crypto';

type SmokeStatus = 'PASS' | 'FAIL';

type SmokeResult = {
  name: string;
  status: SmokeStatus;
  detail: string;
  durationMs: number;
};

type DerivedUrls = {
  marketingUrl: string;
  authUrl: string;
  appUrl: string;
  payUrl: string;
  apiUrl: string;
};

const green = (value: string) => `\u001b[32m${value}\u001b[0m`;
const red = (value: string) => `\u001b[31m${value}\u001b[0m`;
const yellow = (value: string) => `\u001b[33m${value}\u001b[0m`;

function getEnv(name: string) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : '';
}

function normalizeAbsoluteUrl(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return '';

  try {
    return new URL(trimmed).toString().replace(/\/+$/g, '');
  } catch {
    const withProtocol =
      /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(trimmed) ||
      trimmed.includes('railway.internal')
        ? `http://${trimmed}`
        : `https://${trimmed}`;

    return new URL(withProtocol).toString().replace(/\/+$/g, '');
  }
}

function deriveSubdomain(origin: string, target: 'auth' | 'app' | 'pay') {
  const url = new URL(origin);
  const hostname = url.hostname.toLowerCase();

  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.127.0.0.1')
  ) {
    const base = hostname.replace(/^(auth|app|pay)\./, '') || 'localhost';
    url.hostname = `${target}.${base}`;
    return url.origin;
  }

  const base = hostname.replace(/^(auth|app|pay)\./, '');
  url.hostname = `${target}.${base}`;
  return url.origin;
}

function resolveUrls(): DerivedUrls {
  const marketingUrl = normalizeAbsoluteUrl(
    getEnv('SMOKE_MARKETING_URL') ||
      getEnv('E2E_MARKETING_URL') ||
      getEnv('NEXT_PUBLIC_SITE_URL') ||
      'http://localhost:3000',
  );
  const authUrl = normalizeAbsoluteUrl(
    getEnv('SMOKE_AUTH_URL') || getEnv('E2E_AUTH_URL') || getEnv('NEXT_PUBLIC_AUTH_URL'),
  ) || deriveSubdomain(marketingUrl, 'auth');
  const appUrl = normalizeAbsoluteUrl(
    getEnv('SMOKE_APP_URL') || getEnv('E2E_APP_URL') || getEnv('NEXT_PUBLIC_APP_URL'),
  ) || deriveSubdomain(marketingUrl, 'app');
  const payUrl = normalizeAbsoluteUrl(
    getEnv('SMOKE_PAY_URL') || getEnv('E2E_PAY_URL') || getEnv('NEXT_PUBLIC_CHECKOUT_DOMAIN'),
  ) || deriveSubdomain(marketingUrl, 'pay');
  const apiUrl = normalizeAbsoluteUrl(
    getEnv('SMOKE_API_URL') ||
      getEnv('E2E_API_URL') ||
      getEnv('BACKEND_URL') ||
      getEnv('NEXT_PUBLIC_API_URL') ||
      'http://localhost:3001',
  );

  return { marketingUrl, authUrl, appUrl, payUrl, apiUrl };
}

function encodeBase64Url(value: Buffer | string) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8');
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function createMetaSignedRequest(appSecret: string, payload: Record<string, unknown>) {
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = createHmac('sha256', appSecret).update(encodedPayload).digest();
  return `${encodeBase64Url(signature)}.${encodedPayload}`;
}

async function fetchText(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const text = await response.text();
  return { response, text };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function printUsage() {
  console.log(`Usage: smoke-test-prod

Environment inputs:
  SMOKE_MARKETING_URL / E2E_MARKETING_URL / NEXT_PUBLIC_SITE_URL
  SMOKE_AUTH_URL / E2E_AUTH_URL / NEXT_PUBLIC_AUTH_URL
  SMOKE_APP_URL / E2E_APP_URL / NEXT_PUBLIC_APP_URL
  SMOKE_PAY_URL / E2E_PAY_URL / NEXT_PUBLIC_CHECKOUT_DOMAIN
  SMOKE_API_URL / E2E_API_URL / BACKEND_URL / NEXT_PUBLIC_API_URL
  SMOKE_CHECKOUT_CODE / E2E_CHECKOUT_CODE / MP_TEST_CHECKOUT_CODE
  META_APP_SECRET
  META_WEBHOOK_VERIFY_TOKEN or META_VERIFY_TOKEN

This script validates:
  - legal pages
  - auth surface
  - public visitor chat health route
  - public visitor session route + guest compatibility alias
  - authenticated privacy endpoints reject anonymous access
  - authenticated session-security endpoints reject anonymous access
  - Meta webhook verification via app-domain proxy
  - Facebook compliance callbacks via app-domain proxy
  - Google RISC malformed-token rejection via app-domain proxy
  - legacy WAHA/browser-runtime routes return 410 Gone
  - checkout form + autocomplete attributes
`);
}

async function main() {
  if (process.argv.includes('--help')) {
    printUsage();
    return;
  }

  const urls = resolveUrls();
  const results: SmokeResult[] = [];
  let confirmationCode = '';

  async function runCheck(name: string, fn: () => Promise<string>) {
    const startedAt = Date.now();
    try {
      const detail = await fn();
      results.push({
        name,
        status: 'PASS',
        detail,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      results.push({
        name,
        status: 'FAIL',
        detail: error instanceof Error ? error.message : 'Unknown error',
        durationMs: Date.now() - startedAt,
      });
    }
  }

  await runCheck('Legal /privacy', async () => {
    const { response, text } = await fetchText(`${urls.marketingUrl}/privacy`);
    assert(response.ok, `expected 200, received ${response.status}`);
    assert(
      text.includes('Google API Services User Data Policy'),
      'privacy page missing Google policy disclosure',
    );
    return `${response.status} with Google policy clause`;
  });

  await runCheck('Legal /terms', async () => {
    const { response, text } = await fetchText(`${urls.marketingUrl}/terms`);
    assert(response.ok, `expected 200, received ${response.status}`);
    assert(/Termos de Serviço|Terms of Service/i.test(text), 'terms page missing title copy');
    return `${response.status} with terms copy`;
  });

  await runCheck('Legal /data-deletion', async () => {
    const { response, text } = await fetchText(`${urls.marketingUrl}/data-deletion`);
    assert(response.ok, `expected 200, received ${response.status}`);
    assert(/exclusão|deletion/i.test(text), 'data deletion page missing deletion copy');
    return `${response.status} with deletion instructions`;
  });

  await runCheck('Privacy endpoints require authentication', async () => {
    const [exportAttempt, deletionAttempt, googleExtendedAttempt] = await Promise.all([
      fetchText(`${urls.apiUrl}/user/data-export`),
      fetchText(`${urls.apiUrl}/user/data-deletion`, { method: 'DELETE' }),
      fetchText(`${urls.apiUrl}/user/google-profile-extended`, {
        headers: {
          'X-Google-Access-Token': 'smoke-google-access-token',
        },
      }),
    ]);

    const allowedStatuses = new Set([400, 401, 403]);
    assert(
      allowedStatuses.has(exportAttempt.response.status),
      `expected export endpoint to reject anonymous access, received ${exportAttempt.response.status}`,
    );
    assert(
      allowedStatuses.has(deletionAttempt.response.status),
      `expected deletion endpoint to reject anonymous access, received ${deletionAttempt.response.status}`,
    );
    assert(
      allowedStatuses.has(googleExtendedAttempt.response.status),
      `expected google extended profile endpoint to reject anonymous access, received ${googleExtendedAttempt.response.status}`,
    );

    return `export=${exportAttempt.response.status} deletion=${deletionAttempt.response.status} googleExtended=${googleExtendedAttempt.response.status}`;
  });

  await runCheck('Session security endpoints require authentication', async () => {
    const [listAttempt, revokeCurrentAttempt, revokeOthersAttempt, revokeOneAttempt] =
      await Promise.all([
        fetchText(`${urls.apiUrl}/auth/sessions`),
        fetchText(`${urls.apiUrl}/auth/sessions/revoke-current`, { method: 'POST' }),
        fetchText(`${urls.apiUrl}/auth/sessions/revoke-others`, { method: 'POST' }),
        fetchText(`${urls.apiUrl}/auth/sessions/revoke`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ sessionId: 'smoke-session' }),
        }),
      ]);

    const allowedStatuses = new Set([400, 401, 403]);
    const attempts = [
      ['list', listAttempt.response.status],
      ['revoke-current', revokeCurrentAttempt.response.status],
      ['revoke-others', revokeOthersAttempt.response.status],
      ['revoke-one', revokeOneAttempt.response.status],
    ] as const;

    for (const [name, status] of attempts) {
      assert(
        allowedStatuses.has(status),
        `expected ${name} endpoint to reject anonymous access, received ${status}`,
      );
    }

    return attempts.map(([name, status]) => `${name}=${status}`).join(' ');
  });

  await runCheck('Meta webhook verify challenge', async () => {
    const verifyToken = getEnv('META_WEBHOOK_VERIFY_TOKEN') || getEnv('META_VERIFY_TOKEN');
    assert(verifyToken, 'META_WEBHOOK_VERIFY_TOKEN or META_VERIFY_TOKEN is required');

    const challenge = '123456';
    const { response, text } = await fetchText(
      `${urls.appUrl}/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(
        verifyToken,
      )}&hub.challenge=${challenge}`,
    );

    assert(response.status === 200, `expected 200, received ${response.status}`);
    assert(text.trim() === challenge, `expected challenge ${challenge}, received ${text.trim()}`);
    return 'challenge echoed correctly';
  });

  await runCheck('Meta webhook verify rejects invalid token', async () => {
    const { response } = await fetchText(
      `${urls.appUrl}/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=invalid-token&hub.challenge=654321`,
    );

    assert(response.status === 403, `expected 403, received ${response.status}`);
    return '403 invalid verify token';
  });

  await runCheck('Facebook data deletion callback', async () => {
    const appSecret = getEnv('META_APP_SECRET');
    assert(appSecret, 'META_APP_SECRET is required');

    const signedRequest = createMetaSignedRequest(appSecret, {
      algorithm: 'HMAC-SHA256',
      user_id: `smoke-user-${Date.now()}`,
    });

    const { response, text } = await fetchText(
      `${urls.appUrl}/api/auth/facebook/data-deletion`,
      {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ signed_request: signedRequest }).toString(),
      },
    );

    assert(response.status === 201, `expected 201, received ${response.status}`);
    const data = JSON.parse(text) as { url?: string; confirmation_code?: string };
    assert(Boolean(data.url), 'response missing url');
    assert(Boolean(data.confirmation_code), 'response missing confirmation_code');
    confirmationCode = String(data.confirmation_code);
    return `confirmation ${confirmationCode}`;
  });

  await runCheck('Facebook data deletion rejects malformed signed_request', async () => {
    const { response } = await fetchText(
      `${urls.appUrl}/api/auth/facebook/data-deletion`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ signed_request: 'broken-payload' }).toString(),
      },
    );

    assert(response.status === 400, `expected 400, received ${response.status}`);
    return '400 malformed signed_request';
  });

  await runCheck('Facebook deauthorize callback', async () => {
    const appSecret = getEnv('META_APP_SECRET');
    assert(appSecret, 'META_APP_SECRET is required');

    const signedRequest = createMetaSignedRequest(appSecret, {
      algorithm: 'HMAC-SHA256',
      user_id: `smoke-deauth-${Date.now()}`,
    });

    const { response } = await fetchText(`${urls.appUrl}/api/auth/facebook/deauthorize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ signed_request: signedRequest }).toString(),
    });

    assert(response.status === 200, `expected 200, received ${response.status}`);
    return '200 OK';
  });

  await runCheck('Google RISC malformed token rejection', async () => {
    const { response, text } = await fetchText(`${urls.appUrl}/api/auth/google/risc-events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/secevent+jwt',
      },
      body: 'invalid-google-risc-token',
    });

    assert(response.status === 400, `expected 400, received ${response.status}`);
    return text.slice(0, 120) || '400 malformed token';
  });

  await runCheck('Legacy WAHA/browser routes disabled', async () => {
    const attempts = await Promise.all([
      fetchText(`${urls.appUrl}/api/whatsapp-api/session/qr`),
      fetchText(`${urls.appUrl}/api/whatsapp-api/session/view`),
      fetchText(`${urls.appUrl}/api/whatsapp-api/session/link`, { method: 'POST' }),
      fetchText(`${urls.appUrl}/api/whatsapp-api/session/claim`, { method: 'POST' }),
      fetchText(`${urls.appUrl}/api/whatsapp-api/session/action`, { method: 'POST' }),
      fetchText(`${urls.appUrl}/api/whatsapp-api/session/takeover`, { method: 'POST' }),
      fetchText(`${urls.appUrl}/api/whatsapp-api/session/resume-agent`, { method: 'POST' }),
      fetchText(`${urls.appUrl}/api/whatsapp-api/session/pause-agent`, { method: 'POST' }),
      fetchText(`${urls.appUrl}/api/whatsapp-api/session/stream-token`, { method: 'POST' }),
      fetchText(`${urls.appUrl}/api/whatsapp-api/session/action-turn`, { method: 'POST' }),
    ]);

    const features = [
      'qr_code',
      'viewer',
      'legacy_session_link',
      'legacy_session_claim',
      'viewer_action',
      'viewer_takeover',
      'viewer_resume_agent',
      'viewer_pause_agent',
      'viewer_stream',
      'viewer_action_turn',
    ];

    attempts.forEach(({ response, text }, index) => {
      assert(response.status === 410, `expected 410 for ${features[index]}, received ${response.status}`);
      assert(/Descontinuado|Meta/i.test(text), `${features[index]} missing migration guidance`);
    });

    return features.map((feature) => `${feature}=410`).join(' ');
  });

  await runCheck('Data deletion status page', async () => {
    assert(confirmationCode, 'missing confirmation code from deletion callback');
    const { response, text } = await fetchText(
      `${urls.marketingUrl}/data-deletion/status/${encodeURIComponent(confirmationCode)}`,
    );
    assert(response.ok, `expected 200, received ${response.status}`);
    assert(text.includes(confirmationCode), 'status page missing confirmation code');
    return `status page rendered for ${confirmationCode}`;
  });

  await runCheck('Auth surface', async () => {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
      await page.goto(`${urls.authUrl}/login`, { waitUntil: 'domcontentloaded' });
      await page.getByText('Google').waitFor({ state: 'visible', timeout: 10000 });
      await page.getByRole('button', { name: 'Facebook' }).waitFor({ state: 'visible' });
      await page.getByRole('button', { name: 'Apple' }).waitFor({ state: 'visible' });
      await page
        .getByRole('button', { name: 'Receber link mágico' })
        .waitFor({ state: 'visible' });
      return 'Google, Facebook, Apple and magic link visible';
    } finally {
      await browser.close();
    }
  });

  await runCheck('Public visitor chat health', async () => {
    const [{ response, text }, { response: guestAliasResponse, text: guestAliasText }] =
      await Promise.all([
        fetchText(`${urls.apiUrl}/chat/visitor/health`),
        fetchText(`${urls.apiUrl}/chat/guest/health`),
      ]);

    assert(response.ok, `expected 200, received ${response.status}`);
    assert(/online/i.test(text), 'visitor health route missing online status');
    assert(guestAliasResponse.ok, `expected guest alias 200, received ${guestAliasResponse.status}`);
    assert(/visitor/i.test(guestAliasText), 'guest alias health route missing visitor mode');
    return `${response.status} visitor health + guest alias compatibility`;
  });

  await runCheck('Public visitor session route', async () => {
    const [{ response, text }, { response: guestAliasResponse, text: guestAliasText }] =
      await Promise.all([
        fetchText(`${urls.apiUrl}/chat/visitor/session`),
        fetchText(`${urls.apiUrl}/chat/guest/session`),
      ]);

    assert(response.ok, `expected 200, received ${response.status}`);
    assert(guestAliasResponse.ok, `expected guest alias 200, received ${guestAliasResponse.status}`);

    const data = JSON.parse(text) as { sessionId?: string };
    const guestAliasData = JSON.parse(guestAliasText) as { sessionId?: string };

    assert(/^visitor_/i.test(String(data.sessionId || '')), 'visitor session route returned non-visitor id');
    assert(
      /^visitor_/i.test(String(guestAliasData.sessionId || '')),
      'guest alias session route returned non-visitor id',
    );

    return `visitor=${data.sessionId} guestAlias=${guestAliasData.sessionId}`;
  });

  await runCheck('Checkout form and autocomplete', async () => {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const checkoutCode =
      getEnv('SMOKE_CHECKOUT_CODE') || getEnv('E2E_CHECKOUT_CODE') || getEnv('MP_TEST_CHECKOUT_CODE') || 'MPX9Q2Z7';

    try {
      await page.goto(`${urls.payUrl}/${checkoutCode}`, { waitUntil: 'domcontentloaded' });

      const acceptCookiesButton = page.getByRole('button', { name: 'Aceitar tudo' });
      if (await acceptCookiesButton.isVisible().catch(() => false)) {
        await acceptCookiesButton.click();
      }

      const cardForm = page.locator('form').filter({
        has: page.locator('input[autocomplete="cc-number"]'),
      });

      await cardForm.first().waitFor({ state: 'visible', timeout: 15000 });

      const requiredSelectors = [
        'input[autocomplete="email"]',
        'input[autocomplete="tel"]',
        'input[autocomplete="postal-code"]',
        'input[autocomplete="address-line1"]',
        'input[autocomplete="address-level2"]',
        'input[autocomplete="address-level1"]',
        'input[autocomplete="cc-name"]',
        'input[autocomplete="cc-number"]',
        'input[autocomplete="cc-exp"]',
        'input[autocomplete="cc-csc"]',
      ];

      for (const selector of requiredSelectors) {
        assert((await page.locator(selector).count()) > 0, `missing ${selector}`);
      }

      await page.getByRole('button', { name: /continuar com apple/i }).waitFor({
        state: 'visible',
        timeout: 10000,
      });

      return `validated checkout ${checkoutCode} with autofill + Apple social entry`;
    } finally {
      await browser.close();
    }
  });

  console.log('');
  console.log(`Smoke target: ${urls.marketingUrl}`);
  console.log(`App target:   ${urls.appUrl}`);
  console.log(`Auth target:  ${urls.authUrl}`);
  console.log(`Pay target:   ${urls.payUrl}`);
  console.log(`API target:   ${urls.apiUrl}`);
  console.log('');

  for (const result of results) {
    const statusLabel = result.status === 'PASS' ? green('PASS') : red('FAIL');
    console.log(
      `${statusLabel} ${result.name} (${result.durationMs}ms)\n  ${result.detail}`,
    );
  }

  const failures = results.filter((result) => result.status === 'FAIL');
  console.log('');
  if (failures.length === 0) {
    console.log(green(`Smoke test completed: ${results.length}/${results.length} checks passed.`));
    return;
  }

  console.log(red(`Smoke test failed: ${failures.length} of ${results.length} checks failed.`));
  console.log(yellow('Review the failing checks above and fix production configuration or routes.'));
  process.exitCode = 1;
}

void main().catch((error) => {
  console.error(red(`Fatal smoke-test error: ${error instanceof Error ? error.message : String(error)}`));
  process.exitCode = 1;
});
