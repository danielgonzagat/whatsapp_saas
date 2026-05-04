import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';
import { calculateDynamicRisk } from '../dynamic-risk-model';
import { synthesizeDiagnostic } from '../diagnostic-synthesizer';
import { buildPredicateGraph } from '../predicate-graph';
import { buildPulseSignalGraph, type PulseSignalEvidence } from '../signal-graph';

function severityFromRisk(riskScore: number, fallback: Break['severity']): Break['severity'] {
  if (riskScore >= 0.9) return 'critical';
  if (riskScore >= 0.7) return 'high';
  if (riskScore >= 0.4) return 'medium';
  return fallback;
}

function synthesizePromiseDiagnosticBreak(
  signal: PulseSignalEvidence,
  fallback: Break['severity'],
): Break {
  const signalGraph = buildPulseSignalGraph([signal]);
  const predicateGraph = buildPredicateGraph(signalGraph);
  const risk = calculateDynamicRisk({ predicateGraph });
  const diagnostic = synthesizeDiagnostic(signalGraph, predicateGraph, risk);

  return {
    type: diagnostic.id,
    severity: severityFromRisk(risk.score, fallback),
    file: signal.location.file,
    line: signal.location.line,
    description: diagnostic.title,
    detail: `${diagnostic.summary}; evidence=${diagnostic.evidenceIds.join(',')}; predicates=${diagnostic.predicateKinds.join(',')}; signal=${signal.detail ?? signal.summary}`,
    source: `${signal.source};detector=${signal.detector};truthMode=${signal.truthMode};proofMode=${diagnostic.proofMode}`,
  };
}

function buildPromiseBreak(input: {
  file: string;
  line: number;
  summary: string;
  detail: string;
}): Break {
  return synthesizePromiseDiagnosticBreak(
    {
      source: 'promise-chain-weak-sensor',
      detector: 'missing-await-checker',
      truthMode: 'weak_signal',
      summary: input.summary,
      detail: input.detail,
      location: {
        file: input.file,
        line: input.line,
      },
    },
    'high',
  );
}

/** Check missing await. */
export function checkMissingAwait(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const dirs = [config.backendDir, config.workerDir].filter(Boolean);

  for (const dir of dirs) {
    const files = walkFiles(dir, ['.ts']).filter((f) => {
      if (/\.(spec|test|d)\.ts$/.test(f)) {
        return false;
      }
      if (/node_modules/.test(f)) {
        return false;
      }
      return true;
    });

    for (const file of files) {
      let content: string;
      try {
        content = readTextFile(file, 'utf8');
      } catch {
        continue;
      }

      const lines = content.split('\n');
      const relFile = path.relative(config.rootDir, file);

      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();

        // Skip comment lines
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
          continue;
        }

        // Look for .then( calls
        if (!trimmed.includes('.then(')) {
          continue;
        }

        // Skip lines that already chain .catch( on the same line
        if (trimmed.includes('.catch(')) {
          continue;
        }

        // Check the next 3 lines for .catch(
        const nextLines = lines.slice(i + 1, Math.min(i + 4, lines.length));
        const hasCatch = nextLines.some((l) => l.includes('.catch('));
        if (hasCatch) {
          continue;
        }

        // Skip common false positives: test matchers, comments, string literals
        if (/['"`].*\.then\(.*['"`]/.test(trimmed)) {
          continue;
        }
        // Skip Promise.resolve().then() — these are utility patterns
        if (/Promise\s*\.\s*resolve\s*\(\s*\)\.then\(/.test(trimmed)) {
          continue;
        }
        // Skip already-awaited expressions: `await something().then(...)`
        if (/\bawait\b/.test(trimmed)) {
          continue;
        }
        // Skip variable assignments where result is captured (float is less likely)
        if (/(?:const|let|var)\s+\w+\s*=\s*\w+.*\.then\(/.test(trimmed)) {
          continue;
        }
        // Skip return statements with .then() — they propagate the promise
        if (/^\s*return\s+/.test(lines[i])) {
          continue;
        }

        breaks.push(
          buildPromiseBreak({
            file: relFile,
            line: i + 1,
            summary: 'Promise chain has no adjacent catch, await, return, or capture evidence',
            detail: `${trimmed.slice(0, 120)}; syntax sensor needs control-flow confirmation before blocking.`,
          }),
        );
      }
    }
  }

  return breaks;
}
