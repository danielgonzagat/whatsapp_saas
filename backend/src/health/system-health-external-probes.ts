import { ConfigService } from '@nestjs/config';
import { StripeService } from '../billing/stripe.service';

export async function probeStripe(stripeService: StripeService | undefined): Promise<{
  dependency: string;
  status: 'UP' | 'DOWN';
  error?: string;
  latencyMs: number;
}> {
  const startedAt = Date.now();
  try {
    if (!stripeService) {
      return {
        dependency: 'stripe',
        status: 'DOWN',
        error: 'STRIPE_SECRET_KEY not configured',
        latencyMs: Date.now() - startedAt,
      };
    }
    try {
      await stripeService.retrieveBalance();
      return { dependency: 'stripe', status: 'UP', latencyMs: Date.now() - startedAt };
    } catch (err) {
      throw err;
    }
  } catch (err: unknown) {
    return {
      dependency: 'stripe',
      status: 'DOWN',
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - startedAt,
    };
  }
}

export async function probeMetaCloud(config: ConfigService): Promise<{
  dependency: string;
  status: 'UP' | 'DOWN';
  error?: string;
  latencyMs: number;
}> {
  const startedAt = Date.now();
  const appId = config.get<string>('META_APP_ID');
  const appSecret = config.get<string>('META_APP_SECRET');

  if (!appId || !appSecret) {
    return {
      dependency: 'metacloud',
      status: 'DOWN',
      error: 'META_APP_ID or META_APP_SECRET not configured',
      latencyMs: Date.now() - startedAt,
    };
  }

  type FetchFn = (url: string, init: RequestInit) => Promise<Response>;
  const apiFetch: FetchFn = (globalThis as Record<string, unknown>).fetch as FetchFn;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2_000);

    try {
      const token = `${appId}|${appSecret}`;
      const response = await apiFetch(
        `https://graph.facebook.com/v21.0/${appId}?access_token=${encodeURIComponent(token)}&fields=id`,
        { signal: controller.signal },
      );
      clearTimeout(timeout);

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Meta Graph API returned ${response.status}: ${body.slice(0, 200)}`);
      }

      return { dependency: 'metacloud', status: 'UP', latencyMs: Date.now() - startedAt };
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  } catch (err: unknown) {
    return {
      dependency: 'metacloud',
      status: 'DOWN',
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - startedAt,
    };
  }
}

export async function probeOpenAI(config: ConfigService): Promise<{
  dependency: string;
  status: 'UP' | 'DOWN';
  error?: string;
  latencyMs: number;
}> {
  const startedAt = Date.now();
  const apiKey = config.get<string>('OPENAI_API_KEY');

  if (!apiKey) {
    return {
      dependency: 'openai',
      status: 'DOWN',
      error: 'OPENAI_API_KEY not configured',
      latencyMs: Date.now() - startedAt,
    };
  }

  type FetchFn = (url: string, init: RequestInit) => Promise<Response>;
  const apiFetch: FetchFn = (globalThis as Record<string, unknown>).fetch as FetchFn;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2_000);

    try {
      const response = await apiFetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`OpenAI API returned ${response.status}: ${body.slice(0, 200)}`);
      }

      return { dependency: 'openai', status: 'UP', latencyMs: Date.now() - startedAt };
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  } catch (err: unknown) {
    return {
      dependency: 'openai',
      status: 'DOWN',
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - startedAt,
    };
  }
}

export async function probeAnthropic(config: ConfigService): Promise<{
  dependency: string;
  status: 'UP' | 'DOWN';
  error?: string;
  latencyMs: number;
}> {
  const startedAt = Date.now();
  const apiKey = config.get<string>('ANTHROPIC_API_KEY');

  if (!apiKey) {
    return {
      dependency: 'anthropic',
      status: 'DOWN',
      error: 'ANTHROPIC_API_KEY not configured',
      latencyMs: Date.now() - startedAt,
    };
  }

  type FetchFn = (url: string, init: RequestInit) => Promise<Response>;
  const apiFetch: FetchFn = (globalThis as Record<string, unknown>).fetch as FetchFn;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2_000);

    try {
      const response = await apiFetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Anthropic API returned ${response.status}: ${body.slice(0, 200)}`);
      }

      return { dependency: 'anthropic', status: 'UP', latencyMs: Date.now() - startedAt };
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  } catch (err: unknown) {
    return {
      dependency: 'anthropic',
      status: 'DOWN',
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - startedAt,
    };
  }
}

export async function probeEmail(): Promise<{
  dependency: string;
  status: 'UP' | 'DOWN';
  error?: string;
  latencyMs: number;
}> {
  const startedAt = Date.now();
  const isProduction = process.env.NODE_ENV === 'production';

  const hasResend = Boolean(process.env.RESEND_API_KEY?.trim());
  const hasSendGrid = Boolean(process.env.SENDGRID_API_KEY?.trim());
  const hasSmtp = Boolean(process.env.SMTP_HOST?.trim());
  const configured = hasResend || hasSendGrid || hasSmtp;

  if (!configured && isProduction) {
    return {
      dependency: 'email',
      status: 'DOWN',
      error: 'No email provider configured: RESEND_API_KEY, SENDGRID_API_KEY, or SMTP_HOST missing',
      latencyMs: Date.now() - startedAt,
    };
  }

  return { dependency: 'email', status: 'UP', latencyMs: Date.now() - startedAt };
}

export function checkOpenAI(config: ConfigService) {
  const key = config.get('OPENAI_API_KEY');
  return { status: key ? 'CONFIGURED' : 'MISSING' };
}

export function checkAnthropic(config: ConfigService) {
  const key = config.get('ANTHROPIC_API_KEY');
  return { status: key ? 'CONFIGURED' : 'MISSING' };
}

export function checkStripe(config: ConfigService) {
  const key = config.get('STRIPE_SECRET_KEY');
  return { status: key ? 'CONFIGURED' : 'MISSING' };
}

export function checkBackup() {
  return { status: 'CONFIGURED' };
}

export function checkEmail() {
  const hasResend = Boolean(process.env.RESEND_API_KEY?.trim());
  const hasSendGrid = Boolean(process.env.SENDGRID_API_KEY?.trim());
  const hasSmtp = Boolean(process.env.SMTP_HOST?.trim());
  const configured = hasResend || hasSendGrid || hasSmtp;

  if (configured) {
    const provider = hasResend ? 'resend' : hasSendGrid ? 'sendgrid' : 'smtp';
    return { status: 'CONFIGURED', provider };
  }
  return { status: 'NOT_CONFIGURED', missing: ['RESEND_API_KEY', 'SENDGRID_API_KEY', 'SMTP_HOST'] };
}

function getConfiguredGoogleClientIds(config: ConfigService) {
  const raw = [
    config.get<string>('GOOGLE_CLIENT_ID'),
    config.get<string>('NEXT_PUBLIC_GOOGLE_CLIENT_ID'),
    config.get<string>('GOOGLE_ALLOWED_CLIENT_IDS'),
  ]
    .filter((value): value is string => typeof value === 'string')
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);

  return [...new Set(raw)];
}

export function checkGoogleAuth(config: ConfigService) {
  const clientIds = getConfiguredGoogleClientIds(config);
  const clientSecret = config.get('GOOGLE_CLIENT_SECRET');

  if (clientIds.length) {
    return {
      status: 'CONFIGURED',
      mode: 'google_identity_services',
      clientIdsConfigured: clientIds.length,
      clientSecret: clientSecret ? 'CONFIGURED' : 'OPTIONAL_MISSING',
    };
  }

  return {
    status: 'MISSING',
    missing: ['GOOGLE_CLIENT_ID or NEXT_PUBLIC_GOOGLE_CLIENT_ID or GOOGLE_ALLOWED_CLIENT_IDS'],
  };
}
