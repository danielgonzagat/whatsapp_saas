import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

// Matches any http/https URL that contains a domain name
const URL_RE = /https?:\/\/([a-zA-Z0-9.\-]+)/g;

// Internal / infrastructure hostnames — these must not appear in source code
const INTERNAL_DOMAIN_RE = /\b(railway\.app|vercel\.app|herokuapp\.com|localhost|127\.0\.0\.1|0\.0\.0\.0)\b/i;

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
    'asaas\\.com',
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
    'vercel\\.com',       // vercel.com docs ≠ vercel.app deployment
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
  ].join('|'),
  'i',
);

function shouldSkipFile(file: string): boolean {
  return /node_modules|\.(spec|test)\.(ts|tsx|js|jsx)$|__tests__|__mocks__|\.next[/\\]/.test(file);
}

function isCommentLine(trimmed: string): boolean {
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('#');
}

function isImportLine(trimmed: string): boolean {
  return /^\s*(?:import|export)\s+/.test(trimmed) || /^\s*(?:from|require)\s*\(?\s*['"`]/.test(trimmed);
}

function isConfigDocLine(file: string): boolean {
  // Skip files that are explicitly configuration / documentation
  return /(?:README|CHANGELOG|\.md$|\.env|env\.ts$|env\.js$|constants\.ts$|config\.ts$|next\.config\.|jest\.config\.|tsconfig\.|\.eslintrc|\.prettierrc|package\.json$)/.test(
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
