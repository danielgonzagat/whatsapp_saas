#!/usr/bin/env node

import { createSign } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

function redact(value) {
  if (typeof value !== 'string' || value.length < 8) return '[redacted]';
  return value.slice(0, 3) + '[redacted]' + value.slice(-3);
}

function resolveEnv() {
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  const keyId =
    process.env.APPLE_KEY_ID?.trim() ||
    process.env.APPLE_PRIVATE_KEY_ID?.trim();
  const serviceId =
    process.env.APPLE_SERVICE_ID?.trim() ||
    process.env.APPLE_CLIENT_ID?.trim() ||
    process.env.NEXT_PUBLIC_APPLE_CLIENT_ID?.trim();
  const redirectUri =
    process.env.APPLE_REDIRECT_URI?.trim() ||
    process.env.APPLE_CALLBACK_URL?.trim();

  let privateKey = process.env.APPLE_PRIVATE_KEY_P8?.trim() || '';
  if (!privateKey) {
    const p8Path = process.env.APPLE_PRIVATE_KEY_PATH?.trim();
    if (p8Path) {
      try {
        privateKey = readFileSync(p8Path, 'utf8').trim();
      } catch {
        // path exists but unreadable — will report missing
      }
    }
  }
  if (!privateKey) {
    const inline = process.env.APPLE_PRIVATE_KEY?.trim();
    if (inline) {
      privateKey = inline.includes('\\n') ? inline.replace(/\\n/g, '\n') : inline;
    }
  }

  const missing = [];
  if (!teamId) missing.push('APPLE_TEAM_ID');
  if (!keyId) missing.push('APPLE_KEY_ID');
  if (!privateKey) missing.push('APPLE_PRIVATE_KEY_P8 (or APPLE_PRIVATE_KEY_PATH / APPLE_PRIVATE_KEY)');
  if (!serviceId) missing.push('APPLE_SERVICE_ID (or APPLE_CLIENT_ID)');
  if (!redirectUri) missing.push('APPLE_REDIRECT_URI (or APPLE_CALLBACK_URL)');

  const configured = [...new Set([
    ...Object.keys(process.env).filter((k) => k.startsWith('APPLE_')).sort(),
    ...Object.keys(process.env).filter((k) => k.startsWith('NEXT_PUBLIC_APPLE_')).sort(),
  ])];

  return { teamId, keyId, serviceId, redirectUri, privateKey, missing, configured };
}

function encodeAuthJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function buildClientSecret({ teamId, keyId, serviceId, privateKey }) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: keyId };
  const payload = {
    iss: teamId,
    iat: issuedAt,
    exp: issuedAt + 3600,
    aud: 'https://appleid.apple.com',
    sub: serviceId,
  };
  const signingInput = `${encodeAuthJson(header)}.${encodeAuthJson(payload)}`;
  const signer = createSign('SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign({
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  });
  return `${signingInput}.${signature.toString('base64url')}`;
}

async function probe() {
  const env = resolveEnv();

  if (env.missing.length > 0) {
    console.error('MISSING_ENV: Required environment variables not set:');
    for (const v of env.missing) {
      console.error(`  - ${v}`);
    }
    console.error('');
    console.error('Available Apple-related env vars:', env.configured.join(', ') || '(none)');
    return { result: 'MISSING_ENV', missing: env.missing, configured: env.configured };
  }

  console.error('BUILD: Constructing ES256 client_secret JWT...');
  const clientSecret = buildClientSecret({
    teamId: env.teamId,
    keyId: env.keyId,
    serviceId: env.serviceId,
    privateKey: env.privateKey,
  });

  const code = `INVALID_PROBE_CODE_${Date.now()}`;
  const body = new URLSearchParams({
    client_id: env.serviceId,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: env.redirectUri,
  });

  console.error(`PROBE: POST ${APPLE_TOKEN_URL} with code=${code} ...`);

  const startedAt = new Date().toISOString();

  let response;
  try {
    response = await fetch(APPLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`NETWORK_ERROR: ${message}`);
    return {
      result: 'NETWORK_ERROR',
      error: message,
      at: startedAt,
    };
  }

  let payload;
  try {
    payload = await response.json().catch(() => ({}));
  } catch {
    payload = { error: 'unparseable_response' };
  }

  const status = response.status;
  const error = payload?.error ?? null;
  const errorDescription = payload?.error_description?.trim() ?? null;

  console.error(`RESPONSE: HTTP ${status} error=${error} description=${errorDescription ?? '(none)'}`);
  console.error('');

  if (status === 400 && error === 'invalid_grant') {
    console.log('PASS: Apple replied invalid_grant — client_secret JWT is well-formed and accepted by Apple.');
    return { result: 'PASS', status, error, errorDescription, at: startedAt };
  }

  if (error === 'invalid_client') {
    console.log('FAIL: Apple replied invalid_client — client_secret or client_id is invalid.');
    console.log(`  Reason: ${errorDescription ?? 'unknown'}`);
    return { result: 'FAIL', status, error, errorDescription, at: startedAt };
  }

  console.log(`UNEXPECTED: HTTP ${status} error=${error} description=${errorDescription ?? '(none)'}`);
  return { result: 'UNEXPECTED', status, error, errorDescription, at: startedAt };
}

const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';

function writeArtifact(result) {
  const iso = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = resolve(REPO_ROOT, 'artifacts', 'apple-validation');
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `${iso}.json`);
  writeFileSync(file, JSON.stringify(result, null, 2) + '\n', 'utf8');
  console.error(`ARTIFACT: ${file}`);
}

const outcome = await probe();
writeArtifact(outcome);

if (outcome.result === 'MISSING_ENV') {
  process.exit(2);
}
if (outcome.result === 'PASS') {
  process.exit(0);
}
process.exit(1);
