import { createPublicKey } from 'node:crypto';
import { buildClientSecret } from '../../backend/src/auth/__companions__/apple-auth.service.companion';

type AppleValidationStatus = 'blocked' | 'ready_for_human_login' | 'failed';

interface AppleValidationReport {
  checkedAt: string;
  missing: string[];
  status: AppleValidationStatus;
  steps: Record<string, boolean | string>;
}

const required = ['APPLE_CLIENT_ID', 'APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY'];

function privateKeyFromEnv(): string {
  const raw = process.env.APPLE_PRIVATE_KEY?.trim() || '';
  return raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;
}

function report(
  status: AppleValidationStatus,
  steps: Record<string, boolean | string>,
  missing: string[],
) {
  const payload: AppleValidationReport = {
    checkedAt: new Date().toISOString(),
    missing,
    status,
    steps,
  };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function main(): Promise<void> {
  const missing = required.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    report('blocked', { envPresent: false, reason: 'missing_required_apple_env' }, missing);
    process.exitCode = 2;
    return;
  }

  const privateKey = privateKeyFromEnv();
  try {
    createPublicKey(privateKey);
  } catch (error: unknown) {
    report(
      'failed',
      {
        envPresent: true,
        privateKeyParseable: false,
        reason: error instanceof Error ? error.message : 'private_key_parse_failed',
      },
      [],
    );
    process.exitCode = 1;
    return;
  }

  try {
    const clientSecret = buildClientSecret({
      clientId: process.env.APPLE_CLIENT_ID || '',
      teamId: process.env.APPLE_TEAM_ID || '',
      keyId: process.env.APPLE_KEY_ID || '',
      privateKey,
    });
    const parts = clientSecret.split('.');
    report(
      'ready_for_human_login',
      {
        clientSecretGenerated: true,
        envPresent: true,
        jwtGenerated: parts.length === 3,
        privateKeyParseable: true,
      },
      [],
    );
  } catch (error: unknown) {
    report(
      'failed',
      {
        envPresent: true,
        jwtGenerated: false,
        reason: error instanceof Error ? error.message : 'client_secret_generation_failed',
      },
      [],
    );
    process.exitCode = 1;
  }
}

void main();
