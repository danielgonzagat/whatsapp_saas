import { safeJoin, safeResolve } from '../safe-path';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { readTextFile } from '../safe-fs';

type MiddlewareTruthMode = 'weak_signal' | 'confirmed_static';

type MiddlewareDiagnosticBreak = Break & {
  truthMode: MiddlewareTruthMode;
};

interface MiddlewareDiagnosticInput {
  predicateKinds: string[];
  severity: Break['severity'];
  file: string;
  line: number;
  description: string;
  detail: string;
  truthMode: MiddlewareTruthMode;
}

function buildMiddlewareDiagnostic(input: MiddlewareDiagnosticInput): MiddlewareDiagnosticBreak {
  const predicateToken = input.predicateKinds
    .map((predicate) => predicate.replace(/[^a-z0-9]+/gi, '-').toLowerCase())
    .filter(Boolean)
    .join('+');

  return {
    type: `diagnostic:middleware-chain-checker:${predicateToken || 'middleware-observation'}`,
    severity: input.severity,
    file: input.file,
    line: input.line,
    description: input.description,
    detail: input.detail,
    source: `regex-heuristic:middleware-chain-checker;truthMode=${input.truthMode};predicates=${input.predicateKinds.join(',')}`,
    truthMode: input.truthMode,
  };
}

/** Check middleware. */
export function checkMiddleware(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const mainPath = safeJoin(config.backendDir, 'src', 'main.ts');
  let content: string;
  try {
    content = readTextFile(mainPath, 'utf8');
  } catch {
    // main.ts not found — can't audit middleware
    return breaks;
  }

  const relFile = path.relative(config.rootDir, mainPath);
  const lines = content.split('\n');

  // ── CHECK 1: ValidationPipe ──────────────────────────────────────────────────
  // Accept any of the common patterns:
  //   app.useGlobalPipes(new ValidationPipe(…))
  //   { provide: APP_PIPE, useClass: ValidationPipe }
  //   import { ValidationPipe } used anywhere with useGlobalPipes
  const hasValidationPipe =
    /ValidationPipe/.test(content) && (/useGlobalPipes/.test(content) || /APP_PIPE/.test(content));

  if (!hasValidationPipe) {
    // Find the line of `bootstrap` function or first line as best anchor
    let anchorLine = 1;
    for (let i = 0; i < lines.length; i++) {
      if (/async\s+function\s+bootstrap/.test(lines[i])) {
        anchorLine = i + 1;
        break;
      }
    }

    breaks.push(
      buildMiddlewareDiagnostic({
        predicateKinds: ['bootstrap_middleware', 'validation_pipe_not_observed'],
        severity: 'high',
        file: relFile,
        line: anchorLine,
        description: 'Global ValidationPipe registration was not observed in static scan',
        detail:
          'Add `app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))` in bootstrap(). Without it, incoming DTOs are never validated.',
        truthMode: 'weak_signal',
      }),
    );
  }

  // ── CHECK 2: Permissive CORS ─────────────────────────────────────────────────
  // Flag `origin: true` that is NOT inside a NODE_ENV check (e.g., dev-only guard).
  // We look for `origin: true` (the literal boolean) outside of `if (... NODE_ENV ...)`.
  //
  // Strategy: scan each line for `origin: true`, then check its surrounding 15-line
  // context for a NODE_ENV guard. If none found → permissive.

  for (let i = 0; i < lines.length; i++) {
    if (!/origin\s*:\s*true\b/.test(lines[i])) {
      continue;
    }

    // Check a window of ±15 lines for NODE_ENV references
    const windowStart = Math.max(0, i - 15);
    const windowEnd = Math.min(lines.length - 1, i + 15);
    const window = lines.slice(windowStart, windowEnd + 1).join('\n');

    const hasNodeEnvGuard = /NODE_ENV/.test(window);

    if (!hasNodeEnvGuard) {
      breaks.push(
        buildMiddlewareDiagnostic({
          predicateKinds: ['cors_configuration', 'unconditional_origin_true'],
          severity: 'high',
          file: relFile,
          line: i + 1,
          description: '`origin: true` was observed without a nearby NODE_ENV guard',
          detail: `Line ${i + 1}: "origin: true" accepts any origin without a NODE_ENV guard. This is safe in dev but dangerous in production. Restrict to an allowlist or wrap with a NODE_ENV !== 'production' check.`,
          truthMode: 'weak_signal',
        }),
      );
    }
  }

  return breaks;
}
