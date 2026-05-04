import * as path from 'path';
import * as ts from 'typescript';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';
import { calculateDynamicRisk } from '../dynamic-risk-model';
import { synthesizeDiagnostic } from '../diagnostic-synthesizer';
import { buildPredicateGraph } from '../predicate-graph';
import { buildPulseSignalGraph, type PulseSignalEvidence } from '../signal-graph';

interface EffectSurfaceEvidence {
  dataProviderCalls: number;
  outboundBoundaryCalls: number;
}

function calleeText(node: ts.Expression): string {
  if (ts.isIdentifier(node)) {
    return node.text;
  }
  if (ts.isPropertyAccessExpression(node)) {
    return `${calleeText(node.expression)}.${node.name.text}`;
  }
  if (ts.isElementAccessExpression(node)) {
    return calleeText(node.expression);
  }
  return '';
}

function hasRuntimeUrlArgument(node: ts.CallExpression): boolean {
  return node.arguments.some((argument) => {
    if (!ts.isStringLiteralLike(argument)) {
      return false;
    }
    try {
      const url = new URL(argument.text);
      return Boolean(url.protocol && url.host);
    } catch {
      return false;
    }
  });
}

function collectEffectSurfaceEvidence(content: string): EffectSurfaceEvidence {
  const sourceFile = ts.createSourceFile('error-surface.ts', content, ts.ScriptTarget.Latest, true);
  const evidence: EffectSurfaceEvidence = {
    dataProviderCalls: 0,
    outboundBoundaryCalls: 0,
  };

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = calleeText(node.expression);
      const segments = callee.split('.').filter(Boolean);
      if (segments.length >= 3 && segments.includes('prisma')) {
        evidence.dataProviderCalls++;
      }
      if (hasRuntimeUrlArgument(node)) {
        evidence.outboundBoundaryCalls++;
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return evidence;
}

function isHighRiskErrorSurface(evidence: EffectSurfaceEvidence): boolean {
  return evidence.dataProviderCalls > 0 || evidence.outboundBoundaryCalls > 0;
}

/**
 * Extract the body of a catch block starting at line `catchLineIdx`.
 * Returns up to `maxLines` lines after the `} catch (...) {` opener.
 */
function extractCatchBody(lines: string[], catchLineIdx: number, maxLines = 80): string[] {
  // Find the opening `{` of the catch body
  let braceFound = false;
  let startBody = catchLineIdx;

  for (let i = catchLineIdx; i < Math.min(lines.length, catchLineIdx + 3); i++) {
    if (/\{/.test(lines[i])) {
      startBody = i + 1;
      braceFound = true;
      break;
    }
  }

  if (!braceFound) {
    return [];
  }

  // Collect lines until we find the closing `}` or hit maxLines
  const body: string[] = [];
  let depth = 0;

  for (let i = startBody; i < Math.min(lines.length, startBody + maxLines); i++) {
    const t = lines[i].trim();
    // Count braces to detect nested blocks
    for (const ch of lines[i]) {
      if (ch === '{') {
        depth++;
      }
      if (ch === '}') {
        depth--;
      }
    }
    // If depth drops below 0, we've hit the closing `}` of the catch
    if (depth < 0) {
      break;
    }
    body.push(t);
  }

  return body;
}

/**
 * Check if a catch body is effectively empty:
 * - No lines, or
 * - All lines are empty/whitespace/comments
 */
function isCatchBodyEmpty(bodyLines: string[]): boolean {
  if (bodyLines.length === 0) {
    return true;
  }
  return bodyLines.every((l) => {
    const t = l.trim();
    return t === '' || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
  });
}

/**
 * Check if a catch body only logs without re-throwing or returning.
 * This means it swallows the error silently after logging.
 */
function isCatchBodyLogOnly(bodyLines: string[]): boolean {
  if (bodyLines.length === 0) {
    return false;
  }
  const meaningful = bodyLines.filter((l) => {
    const t = l.trim();
    return t !== '' && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
  });
  if (meaningful.length === 0) {
    return false;
  }

  // All meaningful lines are console.log/console.error/console.warn/logger.log etc.
  // AND there's no throw or return
  const hasThrowOrReturn = meaningful.some((l) => /\b(?:throw|return)\b/.test(l));
  if (hasThrowOrReturn) {
    return false;
  }

  const allLogging = meaningful.every((l) =>
    /\bconsole\.\w+\s*\(|\bthis\.logger\.\w+|\bLogger\.\w+|\bthis\.log\b/.test(l),
  );

  return allLogging;
}

/**
 * Check if a catch body re-throws (has `throw` statement).
 */
function catchBodyRethrows(bodyLines: string[]): boolean {
  return bodyLines.some((l) => /\bthrow\b/.test(l.trim()));
}

function catchBodyReportsOrCompensates(bodyLines: string[]): boolean {
  const body = bodyLines.join('\n');
  return /alert|Sentry|captureException|captureMessage|Failed|notifyOps|appendAudit|adminAuditLog|auditLog|deadLetter|dlq|reasons\.push|state\s*:\s*['"`]FAILED|status\s*:\s*[A-Za-z0-9_.]*FAILED|enrichmentStatus\s*:/i.test(
    body,
  );
}

function synthesizeErrorHandlerBreak(
  signal: PulseSignalEvidence,
  severity: Break['severity'],
  surface: string,
): Break {
  const signalGraph = buildPulseSignalGraph([signal]);
  const predicateGraph = buildPredicateGraph(signalGraph);
  const diagnostic = synthesizeDiagnostic(
    signalGraph,
    predicateGraph,
    calculateDynamicRisk({ predicateGraph }),
  );

  return {
    type: diagnostic.id,
    severity,
    file: signal.location.file,
    line: signal.location.line,
    description: diagnostic.title,
    detail: `${diagnostic.summary}; evidence=${diagnostic.evidenceIds.join(',')}; predicates=${diagnostic.predicateKinds.join(',')}`,
    source: `${signal.source};detector=${signal.detector};truthMode=${signal.truthMode}`,
    surface,
  };
}

function buildErrorHandlerBreak(input: {
  detector: string;
  summary: string;
  detail: string;
  file: string;
  line: number;
  severity: Break['severity'];
  surface: string;
}): Break {
  return synthesizeErrorHandlerBreak(
    {
      source: 'static:error-handler-auditor',
      detector: input.detector,
      truthMode: 'confirmed_static',
      summary: input.summary,
      detail: input.detail,
      location: {
        file: input.file,
        line: input.line,
      },
    },
    input.severity,
    input.surface,
  );
}

/** Check error handlers. */
export function checkErrorHandlers(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const dirs = [config.backendDir, config.workerDir];

  for (const dir of dirs) {
    if (!dir) {
      continue;
    }

    const files = walkFiles(dir, ['.ts']);

    for (const file of files) {
      // Skip test/spec/seed/migration/mock files
      if (/\.(test|spec|d)\.ts$|seed|migration|fixture|mock\./i.test(file)) {
        continue;
      }

      let content: string;
      try {
        content = readTextFile(file, 'utf8');
      } catch {
        continue;
      }

      const lines = content.split('\n');
      const relFile = path.relative(config.rootDir, file);
      const effectSurfaceEvidence = collectEffectSurfaceEvidence(content);
      const isEffectfulSurface = isHighRiskErrorSurface(effectSurfaceEvidence);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Skip comment lines
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
          continue;
        }

        // ── CHECK 1: catch block analysis ─────────────────────────────────────
        // Use word boundary to avoid matching 'catchupEnabled', 'catchAll', etc.
        if (/\}\s*catch\s*[\w(]/.test(trimmed) || /^\s*catch[\s({]/.test(trimmed)) {
          // Skip if a PULSE:OK annotation is on the preceding line(s) — intentional suppression
          const prevLine = i > 0 ? lines[i - 1].trim() : '';
          const prevPrevLine = i > 1 ? lines[i - 2].trim() : '';
          if (/PULSE:OK/.test(prevLine) || /PULSE:OK/.test(prevPrevLine)) {
            continue;
          }

          const bodyLines = extractCatchBody(lines, i);
          // Also skip if the catch body itself contains a PULSE:OK annotation
          if (bodyLines.some((l) => /PULSE:OK/.test(l))) {
            continue;
          }
          const hasReportedOrCompensatedEffectError =
            isEffectfulSurface && catchBodyReportsOrCompensates(bodyLines);

          if (isCatchBodyEmpty(bodyLines)) {
            // Empty catch — swallows error completely
            if (isEffectfulSurface) {
              breaks.push(
                buildErrorHandlerBreak({
                  detector: 'empty-catch-high-risk-effect-evidence',
                  severity: 'critical',
                  file: relFile,
                  line: i + 1,
                  summary: 'Empty catch block observed on high-risk mutating effect path',
                  detail: trimmed.slice(0, 120),
                  surface: 'error-handling-effect',
                }),
              );
            } else {
              breaks.push(
                buildErrorHandlerBreak({
                  detector: 'empty-catch-evidence',
                  severity: 'medium',
                  file: relFile,
                  line: i + 1,
                  summary: 'Empty catch block observed without recovery evidence',
                  detail: trimmed.slice(0, 120),
                  surface: 'error-handling',
                }),
              );
            }
          } else if (isCatchBodyLogOnly(bodyLines) && !hasReportedOrCompensatedEffectError) {
            // Logs but doesn't rethrow/return
            if (isEffectfulSurface) {
              breaks.push(
                buildErrorHandlerBreak({
                  detector: 'log-only-catch-high-risk-effect-evidence',
                  severity: 'critical',
                  file: relFile,
                  line: i + 1,
                  summary:
                    'Catch block on high-risk mutating effect path only logs without propagation evidence',
                  detail: trimmed.slice(0, 120),
                  surface: 'error-handling-effect',
                }),
              );
            } else {
              breaks.push(
                buildErrorHandlerBreak({
                  detector: 'log-only-catch-evidence',
                  severity: 'medium',
                  file: relFile,
                  line: i + 1,
                  summary: 'Catch block only logs without propagation evidence',
                  detail: trimmed.slice(0, 120),
                  surface: 'error-handling',
                }),
              );
            }
          } else if (
            isEffectfulSurface &&
            !catchBodyRethrows(bodyLines) &&
            !hasReportedOrCompensatedEffectError
          ) {
            // Effectful catch that does something but doesn't rethrow
            // Downgrade to high if catch has a return (intentional error handling)
            // or calls an error reporting function
            const meaningful = bodyLines.filter((l) => l.trim() && !l.trim().startsWith('//'));
            const hasReturn = meaningful.some((l) => /\breturn\b/.test(l));
            const hasErrorReport = meaningful.some((l) =>
              /report|sentry|notify|alert|emit|dispatch|rollback/i.test(l),
            );
            const hasNullReturn = meaningful.some((l) =>
              /return\s*(null|undefined|false|\[\]|\{\}|0|''|"")\s*;?/.test(l),
            );
            if (hasReturn || hasErrorReport) {
              // Intentional error handling — not swallowed, downgrade
              breaks.push(
                buildErrorHandlerBreak({
                  detector: 'handled-catch-high-risk-effect-evidence',
                  severity: 'high',
                  file: relFile,
                  line: i + 1,
                  summary: hasNullReturn
                    ? 'Catch block on high-risk mutating effect path returns default without failure propagation evidence'
                    : 'Catch block on high-risk mutating effect path handles error without rethrow evidence',
                  detail: trimmed.slice(0, 120),
                  surface: 'error-handling-effect',
                }),
              );
            } else {
              breaks.push(
                buildErrorHandlerBreak({
                  detector: 'non-propagating-catch-high-risk-effect-evidence',
                  severity: 'critical',
                  file: relFile,
                  line: i + 1,
                  summary:
                    'Catch block on high-risk mutating effect path lacks propagation or compensation evidence',
                  detail: trimmed.slice(0, 120),
                  surface: 'error-handling-effect',
                }),
              );
            }
          }
        }

        // ── CHECK 2: .then( without .catch( ───────────────────────────────────
        // Look for .then( that is NOT followed by .catch( on same line or next 2 lines
        if (/\.then\s*\(/.test(trimmed)) {
          // Skip if this line already has .catch(
          if (/\.catch\s*\(/.test(trimmed)) {
            continue;
          }

          // Skip if it's inside a chain that has await (then is on a thenable, not a Promise chain)
          if (/\bawait\b/.test(trimmed)) {
            continue;
          }

          // Check the next 5 lines for .catch( (chain may span multiple lines)
          const nextLines = lines.slice(i + 1, Math.min(lines.length, i + 6)).join('\n');
          if (!/\.catch\s*\(/.test(nextLines)) {
            // Additional filter: skip if it's a test assertion chain (.then().expect())
            // or a type guard (.then(res => res.json()))
            if (/\.(expect|toBe|toEqual|toMatch|finally)\s*\(/.test(trimmed + nextLines)) {
              continue;
            }

            breaks.push(
              buildErrorHandlerBreak({
                detector: 'promise-chain-rejection-handler-evidence',
                severity: 'medium',
                file: relFile,
                line: i + 1,
                summary: 'Promise chain observed without rejection handler evidence',
                detail: trimmed.slice(0, 120),
                surface: 'error-handling-promise',
              }),
            );
          }
        }
      }
    }
  }

  return breaks;
}
