import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

// Matches any http/https URL that contains a domain name
const URL_RE = /https?:\/\/([a-zA-Z0-9.\-]+)/g;

// Internal / infrastructure hostnames — these must not appear in source code
const INTERNAL_DOMAIN_RE =
  /\b(railway\.app|vercel\.app|herokuapp\.com|localhost|127\.0\.0\.1|0\.0\.0\.0)\b/i;

// Production / branded URLs — lower severity but still worth flagging
const PROD_DOMAIN_RE = /\b(kloel\.com|api\.kloel\.com)\b/i;

// External well-known services that are legitimately referenced in code
const ALLOWED_EXTERNAL_RE = new RegExp(
  [
    'github\\.com',
    'githubusercontent\\.com',
    'npmjs\\.com',
    'nodejs\\.org',
    'googleapis\\.com',
    'google\\.com',
    'openai\\.com',
    'anthropic\\.com',
    'stripe\\.com',
    'twilio\\.com',
    'meta\\.com',
    'facebook\\.com',
    'graph\\.facebook\\.com',
    'w3\\.org',
    'schema\\.org',
    'json-schema\\.org',
    'swagger\\.io',
    'prisma\\.io',
    'nestjs\\.com',
    'nextjs\\.org',
    'vercel\\.com', // vercel.com docs ≠ vercel.app deployment
    'cloudflare\\.com',
    'sentry\\.io',
    'datadog\\.com',
    'example\\.com',
    'example\\.org',
    'placeholder\\.com',
    'via\\.placeholder\\.com',
    'unsplash\\.com',
    'tailwindcss\\.com',
    'fontawesome\\.com',
    'jsdelivr\\.net',
    'cdnjs\\.cloudflare\\.com',
    'fonts\\.googleapis\\.com',
    'fonts\\.gstatic\\.com',
    'maps\\.googleapis\\.com',
    'storage\\.googleapis\\.com',
    'accounts\\.google\\.com',
    'oauth2\\.googleapis\\.com',
    'whatsapp\\.com',
    'web\\.whatsapp\\.com',
    'lh3\\.googleusercontent\\.com',
    'avatars\\.githubusercontent\\.com',
    'raw\\.githubusercontent\\.com',
    'registry\\.npmjs\\.org',
    'registry\\.yarnpkg\\.com',
    'dl\\.k9s\\.io',
    'hub\\.docker\\.com',
    'index\\.docker\\.io',
    // Kloel pixel CDN — must be hardcoded in user-facing embed snippets
    'px\\.kloel\\.com',
  ].join('|'),
  'i',
);

function shouldSkipFile(file: string): boolean {
  return /node_modules|\.(spec|test)\.(ts|tsx|js|jsx)$|__tests__|__mocks__|\.next[/\\]/.test(file);
}

function isCommentLine(trimmed: string): boolean {
  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('#')
  );
}

function isImportLine(trimmed: string): boolean {
  return (
    /^\s*(?:import|export)\s+/.test(trimmed) || /^\s*(?:from|require)\s*\(?\s*['"`]/.test(trimmed)
  );
}

function isConfigDocLine(file: string): boolean {
  // Skip files that are explicitly configuration / documentation
  return /(?:README|CHANGELOG|\.md$|\.env|env\.ts$|env\.js$|constants\.ts$|config\.ts$|app-config\.module\.ts$|next\.config\.|jest\.config\.|tsconfig\.|\.eslintrc|\.prettierrc|package\.json$)/.test(
    path.basename(file),
  );
}

export function checkHardcodedUrls(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const scanDirs = [config.frontendDir, config.backendDir, config.workerDir].filter(Boolean);

  for (const dir of scanDirs) {
    const files = walkFiles(dir, ['.ts', '.tsx']);

    for (const file of files) {
      if (shouldSkipFile(file)) continue;
      if (isConfigDocLine(file)) continue;

      let content: string;
      try {
        content = fs.readFileSync(file, 'utf8');
      } catch {
        continue;
      }

      const lines = content.split('\n');
      const relFile = path.relative(config.rootDir, file);

      for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const trimmed = raw.trim();

        if (isCommentLine(trimmed)) continue;
        if (isImportLine(trimmed)) continue;
        if (!trimmed.includes('http')) continue;

        URL_RE.lastIndex = 0;
        let m: RegExpExecArray | null;

        while ((m = URL_RE.exec(raw)) !== null) {
          const fullUrl = m[0];
          const domain = m[1];

          // Skip well-known external services
          if (ALLOWED_EXTERNAL_RE.test(domain)) continue;

          // Skip localhost in fallback/default patterns: `|| 'http://localhost'` or env var defaults
          if (/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(domain)) {
            // Also check 1-8 preceding lines for dev-guard context (handles multi-line arrays)
            const prevLines = lines.slice(Math.max(0, i - 8), i).join('\n');
            if (
              // Explicit fallback patterns: `|| 'http://localhost'` or `?? 'http://localhost'`
              /\|\|\s*['"`]|(?:\?\?)\s*['"`]/.test(raw) ||
              // Process.env usage on same line or within preceding lines (multi-line fallback chain)
              /process\.env/.test(raw) ||
              /process\.env/.test(prevLines) ||
              // new URL(path, base) — 127.0.0.1 as base for URL parsing (standard Node.js pattern)
              /new\s+URL\s*\(/.test(raw) ||
              // ConfigService/config.get() with default — `.get('KEY', 'http://localhost')`
              // Single-line: `.get('KEY', 'http://localhost')` OR multi-line split
              /\.get\s*\([^)]+,\s*['"`]http/.test(raw) ||
              /configService\.get|this\.config\.get|config\.get/.test(prevLines) ||
              // Joi schema defaults — `Joi.string().default('http://localhost')`
              /Joi\.|\.default\s*\(/.test(raw) ||
              // CORS allowed origins list / gateway configuration (current or preceding lines)
              /cors|origin|gateway|WebSocketGateway|allowedOrigins|Set\s*\(/i.test(raw) ||
              /cors|allowedOrigins|Set\s*\(\[/i.test(prevLines) ||
              // getServerApiBase function return — dev-mode fallback
              /getServerApiBase|API_BASE/i.test(raw) ||
              // window.location.hostname === 'localhost' guard block (dev-only branch, current or prev lines)
              /hostname.*localhost|localhost.*hostname/i.test(raw) ||
              /hostname.*localhost|localhost.*hostname/i.test(prevLines) ||
              // Stripe/external tool URL construction with env fallback
              /NEXT_PUBLIC_APP_URL|FRONTEND_URL|APP_URL|BACKEND_URL|API_URL|SERVICE_BASE/i.test(
                raw,
              ) ||
              // Return statement inside a getServerApiBase-style function (check prev lines for function name)
              /getServerApiBase|getApiBase|getBackendBase/i.test(prevLines)
            )
              continue;
          }

          // Skip vercel.app / railway.app deployment URLs in CORS configuration context
          if (/vercel\.app|railway\.app|herokuapp\.com/.test(domain)) {
            const prevLines4 = lines.slice(Math.max(0, i - 8), i).join('\n');
            if (
              /cors|allowedOrigins|Set\s*\(\[/i.test(prevLines4) ||
              /cors|origin|allowedOrigins/i.test(raw)
            )
              continue;
          }

          if (INTERNAL_DOMAIN_RE.test(domain)) {
            breaks.push({
              type: 'HARDCODED_INTERNAL_URL',
              severity: 'medium',
              file: relFile,
              line: i + 1,
              description: `Hardcoded internal/infrastructure URL: ${fullUrl}`,
              detail: `Move to environment variable. Line: ${trimmed.slice(0, 120)}`,
            });
          } else if (PROD_DOMAIN_RE.test(domain)) {
            // Skip prod-domain URLs that are used as env var fallbacks
            // e.g. `process.env.NEXT_PUBLIC_SITE_URL || 'https://kloel.com'`
            const prevLinesProd = lines.slice(Math.max(0, i - 4), i).join('\n');
            if (
              // Explicit fallback operator on same line: `|| 'https://kloel.com'` or `?? 'https://kloel.com'`
              /\|\|\s*['"`]|(?:\?\?)\s*['"`]/.test(raw) ||
              // process.env reference on same line or preceding lines
              /process\.env/.test(raw) ||
              /process\.env/.test(prevLinesProd) ||
              // ConfigService / Joi schema defaults
              /\.get\s*\([^)]+,\s*['"`]http/.test(raw) ||
              /configService\.get|this\.config\.get|config\.get/.test(prevLinesProd) ||
              /Joi\.|\.default\s*\(/.test(raw) ||
              // CORS / gateway allowed origins
              /cors|origin|gateway|allowedOrigins|Set\s*\(/i.test(raw) ||
              /cors|allowedOrigins|Set\s*\(\[/i.test(prevLinesProd)
            )
              continue;

            breaks.push({
              type: 'HARDCODED_PROD_URL',
              severity: 'low',
              file: relFile,
              line: i + 1,
              description: `Hardcoded production URL: ${fullUrl}`,
              detail: `Consider using an env var for portability. Line: ${trimmed.slice(0, 120)}`,
            });
          }
        }
      }
    }
  }

  return breaks;
}
