import type { Logger } from '@nestjs/common';
import type { ResolvedOAuthRedirect } from './meta-oauth-url.helpers';

export interface MetaStartupCheckInput {
  env: NodeJS.ProcessEnv;
  resolved: ResolvedOAuthRedirect;
  logger?: Pick<Logger, 'log' | 'warn' | 'error'>;
}

export interface MetaStartupCheckResult {
  ok: boolean;
  problems: string[];
  warnings: string[];
}

const REQUIRED_IN_PROD = [
  { key: 'META_APP_ID', label: 'META_APP_ID (Meta App ID, painel Settings -> Basic)' },
  { key: 'META_APP_SECRET', label: 'META_APP_SECRET (Meta App Secret, painel Settings -> Basic)' },
  { key: 'FRONTEND_URL', label: 'FRONTEND_URL (ex: https://app.kloel.com)' },
] as const;

const RECOMMENDED_IN_PROD = [
  {
    key: 'META_VERIFY_TOKEN',
    label: 'META_VERIFY_TOKEN (verificacao do webhook Meta — sem isso o webhook recusa)',
  },
] as const;

/**
 * Validate that the env has the variables Meta OAuth needs, and that the
 * resolved redirect URI is plausible for production (https, not localhost
 * fallback). Non-fatal: returns problems/warnings, never throws.
 *
 * The caller is expected to log at the right level (error for problems,
 * warn for warnings) so it shows up in Railway logs at boot.
 */
export function runMetaStartupCheck(input: MetaStartupCheckInput): MetaStartupCheckResult {
  const { env, resolved, logger } = input;
  const isProd =
    String(env.NODE_ENV || '')
      .trim()
      .toLowerCase() === 'production';

  const problems: string[] = [];
  const warnings: string[] = [];

  if (isProd) {
    for (const { key, label } of REQUIRED_IN_PROD) {
      if (!String(env[key] || '').trim()) {
        problems.push(`${label} nao esta setado.`);
      }
    }
    for (const { key, label } of RECOMMENDED_IN_PROD) {
      if (!String(env[key] || '').trim()) {
        warnings.push(`${label} nao esta setado.`);
      }
    }
    if (resolved.isFallback) {
      problems.push(
        `OAuth redirect URI caiu para fallback localhost (${resolved.redirectUri}). ` +
          'Defina BACKEND_PUBLIC_URL ou META_OAUTH_REDIRECT_URI para o backend publico.',
      );
    } else if (!resolved.redirectUri.startsWith('https://')) {
      problems.push(
        `OAuth redirect URI nao usa https (${resolved.redirectUri}). ` +
          'A Meta exige https em producao — Facebook recusa o OAuth.',
      );
    }
  } else if (resolved.isFallback && logger) {
    logger.log(
      `[meta] dev fallback redirect_uri=${resolved.redirectUri} ` +
        '(setar BACKEND_PUBLIC_URL ou usar ngrok para OAuth real)',
    );
  }

  if (logger) {
    for (const problem of problems) {
      logger.error(`[meta][startup-check] ${problem}`);
    }
    for (const warning of warnings) {
      logger.warn(`[meta][startup-check] ${warning}`);
    }
    if (!problems.length && !warnings.length) {
      logger.log(
        `[meta][startup-check] OK redirect_uri=${resolved.redirectUri} source=${resolved.source}`,
      );
    }
  }

  return { ok: problems.length === 0, problems, warnings };
}
