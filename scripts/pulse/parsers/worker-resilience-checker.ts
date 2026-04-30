import { safeJoin } from '../safe-path';
import * as path from 'path';
import * as ts from 'typescript';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';
import { calculateDynamicRisk } from '../dynamic-risk-model';
import { synthesizeDiagnostic } from '../diagnostic-synthesizer';
import { buildPredicateGraph } from '../predicate-graph';
import { buildPulseSignalGraph, type PulseSignalEvidence } from '../signal-graph';

// ===== Puppeteer timeout patterns =====
// Only methods that actually accept { timeout } in their options object.
// Excluded: page.evaluate() — uses page.setDefaultTimeout(), no per-call option.
// Excluded: page.click() — ClickOptions does not include timeout in puppeteer-core v24.
// Excluded: page.type() — KeyboardTypeOptions does not include timeout.
const PUPPETEER_TIMEOUT_CALLS = [
  /\bpage\.goto\s*\(/,
  /\bpage\.waitForSelector\s*\(/,
  /\bpage\.waitForFunction\s*\(/,
  /\bpage\.waitForNavigation\s*\(/,
];
const HAS_TIMEOUT_IN_CALL = /\btimeout\s*:/;

function shouldSkipFile(file: string): boolean {
  const normalized = file.replaceAll('\\', '/').toLowerCase();
  return (
    normalized.endsWith('.spec.ts') ||
    normalized.endsWith('.test.ts') ||
    normalized.endsWith('.spec.tsx') ||
    normalized.endsWith('.test.tsx') ||
    normalized.endsWith('.spec.js') ||
    normalized.endsWith('.test.js') ||
    normalized.endsWith('.spec.jsx') ||
    normalized.endsWith('.test.jsx') ||
    normalized.includes('/__tests__/') ||
    normalized.includes('/__mocks__/')
  );
}

function isCommentLine(trimmed: string): boolean {
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

function severityFromRisk(riskScore: number, fallback: Break['severity']): Break['severity'] {
  if (riskScore >= 0.9) return 'critical';
  if (riskScore >= 0.7) return 'high';
  if (riskScore >= 0.4) return 'medium';
  return fallback;
}

function synthesizeWorkerResilienceBreak(signal: PulseSignalEvidence, surface: string): Break {
  const signalGraph = buildPulseSignalGraph([signal]);
  const predicateGraph = buildPredicateGraph(signalGraph);
  const risk = calculateDynamicRisk({ predicateGraph });
  const diagnostic = synthesizeDiagnostic(signalGraph, predicateGraph, risk);

  return {
    type: diagnostic.id,
    severity: severityFromRisk(risk.score, 'medium'),
    file: signal.location.file,
    line: signal.location.line,
    description: diagnostic.title,
    detail: `${diagnostic.summary}; evidence=${diagnostic.evidenceIds.join(',')}; predicates=${diagnostic.predicateKinds.join(',')}; signal=${signal.detail ?? signal.summary}`,
    source: `${signal.source};detector=${signal.detector};truthMode=${signal.truthMode}`,
    surface,
  };
}

function buildWorkerResilienceBreak(input: {
  detector: string;
  summary: string;
  detail: string;
  file: string;
  line: number;
  surface: string;
}): Break {
  return synthesizeWorkerResilienceBreak(
    {
      source: 'static-worker-resilience-checker',
      detector: input.detector,
      truthMode: 'confirmed_static',
      summary: input.summary,
      detail: input.detail,
      location: {
        file: input.file,
        line: input.line,
      },
    },
    input.surface,
  );
}

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function hasBullMqImport(sourceFile: ts.SourceFile): boolean {
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) {
      continue;
    }
    if (!ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    if (statement.moduleSpecifier.text === 'bullmq') {
      return true;
    }
  }
  return false;
}

function receiverName(receiver: ts.Expression): string {
  if (ts.isIdentifier(receiver)) {
    return receiver.text;
  }
  if (ts.isPropertyAccessExpression(receiver)) {
    return receiver.name.text;
  }
  return receiver.getText();
}

function isQueueLikeReceiver(receiver: ts.Expression, fileImportsBullMq: boolean): boolean {
  const name = receiverName(receiver).toLowerCase();
  return name.includes('queue') || (fileImportsBullMq && name !== 'set' && name !== 'map');
}

function hasRetryProperty(node: ts.Node): boolean {
  let found = false;
  const visit = (child: ts.Node): void => {
    if (found) {
      return;
    }
    if (ts.isPropertyAssignment(child)) {
      const name = child.name;
      if (ts.isIdentifier(name) && (name.text === 'attempts' || name.text === 'backoff')) {
        found = true;
        return;
      }
      if (ts.isStringLiteral(name) && (name.text === 'attempts' || name.text === 'backoff')) {
        found = true;
        return;
      }
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function sourceHasDefaultJobRetry(content: string, fileName: string): boolean {
  const sourceFile = ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true);
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) {
      return;
    }
    if (ts.isPropertyAssignment(node)) {
      const name = node.name;
      const isDefaultOptions =
        (ts.isIdentifier(name) && name.text === 'defaultJobOptions') ||
        (ts.isStringLiteral(name) && name.text === 'defaultJobOptions');
      if (isDefaultOptions && hasRetryProperty(node.initializer)) {
        found = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function isBullMqAddCall(node: ts.Node, fileImportsBullMq: boolean): node is ts.CallExpression {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) {
    return false;
  }
  const method = node.expression.name.text;
  if (method !== 'add' && method !== 'addBulk') {
    return false;
  }
  return isQueueLikeReceiver(node.expression.expression, fileImportsBullMq);
}

/** Check worker resilience. */
export function checkWorkerResilience(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  if (!config.workerDir) {
    return breaks;
  }

  const files = walkFiles(config.workerDir, ['.ts']).filter((f) => !shouldSkipFile(f));

  // Check if queue.ts defines queues with defaultJobOptions retry — if so, per-job retry is inherited
  const queueTsPath = safeJoin(config.workerDir, 'queue.ts');
  let queueHasDefaultRetry = false;
  try {
    const queueContent = readTextFile(queueTsPath, 'utf8');
    queueHasDefaultRetry = sourceHasDefaultJobRetry(queueContent, queueTsPath);
  } catch {
    // queue.ts not found — conservative, will flag per-job missing retry
  }

  for (const file of files) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    const relFile = path.relative(config.rootDir, file);
    const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
    const fileImportsBullMq = hasBullMqImport(sourceFile);

    // ===== File-level: Puppeteer page leak check =====
    const hasNewPage =
      content.includes('browser.newPage()') || content.includes('browser?.newPage()');
    const hasPageGoto = content.includes('page.goto(') || content.includes('page?.goto(');
    const hasPageClose =
      content.includes('page.close()') ||
      content.includes('page?.close()') ||
      content.includes('.close()');

    if ((hasNewPage || hasPageGoto) && !hasPageClose) {
      breaks.push(
        buildWorkerResilienceBreak({
          detector: 'puppeteer-page-lifecycle-evidence',
          summary: 'Puppeteer page lifecycle evidence lacks a close operation',
          detail:
            'Static worker source contains browser.newPage() or page.goto() evidence without page.close() evidence.',
          file: relFile,
          line: 1,
          surface: 'worker-puppeteer-page-lifecycle',
        }),
      );
    }

    // ===== Line-level checks =====
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const trimmed = raw.trim();

      if (isCommentLine(trimmed)) {
        continue;
      }

      // --- Puppeteer timeout check ---
      for (const callRe of PUPPETEER_TIMEOUT_CALLS) {
        if (!callRe.test(raw)) {
          continue;
        }

        // Check same line and next 4 lines for `timeout:` (larger window for multi-line option objects)
        const window = lines.slice(i, Math.min(i + 5, lines.length)).join(' ');
        if (!HAS_TIMEOUT_IN_CALL.test(window)) {
          breaks.push(
            buildWorkerResilienceBreak({
              detector: 'puppeteer-timeout-evidence',
              summary: 'Puppeteer call evidence lacks an explicit timeout predicate',
              detail: `Observed call without timeout evidence: ${trimmed.slice(0, 80)}`,
              file: relFile,
              line: i + 1,
              surface: 'worker-puppeteer-timeout',
            }),
          );
        }
        // Only flag once per line even if multiple patterns match
        break;
      }
    }

    const visit = (node: ts.Node): void => {
      if (isBullMqAddCall(node, fileImportsBullMq)) {
        const line = lineOf(sourceFile, node);
        const currentLine = lines[line - 1]?.trim() ?? '';
        const prevLine = line > 1 ? (lines[line - 2]?.trim() ?? '') : '';
        const hasPulseOk = currentLine.includes('PULSE:OK') || prevLine.includes('PULSE:OK');

        if (!queueHasDefaultRetry && !hasPulseOk && !hasRetryProperty(node)) {
          breaks.push(
            buildWorkerResilienceBreak({
              detector: 'bullmq-ast-retry-policy-evidence',
              summary: 'BullMQ enqueue AST evidence lacks retry or backoff predicates',
              detail: `Observed queue add call without attempts/backoff AST evidence: ${currentLine.slice(0, 80)}`,
              file: relFile,
              line,
              surface: 'worker-bullmq-retry-policy',
            }),
          );
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  return breaks;
}
