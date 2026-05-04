import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';
import { calculateDynamicRisk } from '../dynamic-risk-model';
import { synthesizeDiagnostic } from '../diagnostic-synthesizer';
import { buildPredicateGraph } from '../predicate-graph';
import { buildPulseSignalGraph, type PulseSignalEvidence } from '../signal-graph';

function shouldSkipFile(filePath: string): boolean {
  return /\.(spec|test)\.(ts|tsx)$|__tests__|__mocks__|node_modules|\.next[/\\]/i.test(filePath);
}

function severityFromRisk(riskScore: number, fallback: Break['severity']): Break['severity'] {
  if (riskScore >= 0.9) return 'critical';
  if (riskScore >= 0.7) return 'high';
  if (riskScore >= 0.4) return 'medium';
  return fallback;
}

function isAsciiLetter(char: string | undefined): boolean {
  return char !== undefined && ((char >= 'A' && char <= 'Z') || (char >= 'a' && char <= 'z'));
}

function localeCallEmptyArgumentIndexes(line: string): number[] {
  const indexes: number[] = [];
  let cursor = 0;
  while (cursor < line.length) {
    const methodStart = line.indexOf('.to', cursor);
    if (methodStart === -1) {
      break;
    }
    const nameStart = methodStart + 1;
    let nameEnd = nameStart;
    while (isAsciiLetter(line[nameEnd])) {
      nameEnd++;
    }
    const methodName = line.slice(nameStart, nameEnd);
    if (!methodName.startsWith('toLocale') || !methodName.endsWith('String')) {
      cursor = nameEnd;
      continue;
    }
    let argsStart = nameEnd;
    while ((line[argsStart] || '').trim() === '') {
      argsStart++;
    }
    if (line[argsStart] !== '(') {
      cursor = argsStart + 1;
      continue;
    }
    let argsEnd = argsStart + 1;
    while ((line[argsEnd] || '').trim() === '') {
      argsEnd++;
    }
    if (line[argsEnd] === ')') {
      indexes.push(methodStart);
    }
    cursor = argsEnd + 1;
  }
  return indexes;
}

function synthesizeLocaleDiagnosticBreak(
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

function buildLocaleBreak(input: {
  file: string;
  line: number;
  summary: string;
  detail: string;
}): Break {
  return synthesizeLocaleDiagnosticBreak(
    {
      source: 'locale-format-weak-sensor',
      detector: 'locale-consistency-checker',
      truthMode: 'weak_signal',
      summary: input.summary,
      detail: input.detail,
      location: {
        file: input.file,
        line: input.line,
      },
    },
    'low',
  );
}

/** Check locale consistency. */
export function checkLocaleConsistency(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const files = walkFiles(config.frontendDir, ['.tsx', '.ts']).filter((f) => !shouldSkipFile(f));

  for (const file of files) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    if (!content.includes('toLocale')) {
      continue;
    }

    const lines = content.split('\n');
    const relFile = path.relative(config.rootDir, file);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip comments
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        continue;
      }

      for (const _index of localeCallEmptyArgumentIndexes(line)) {
        breaks.push(
          buildLocaleBreak({
            file: relFile,
            line: i + 1,
            summary: 'Locale formatter call has empty locale arguments',
            detail: `${trimmed.slice(0, 120)}; structural scanner needs product locale contract confirmation before blocking.`,
          }),
        );
      }
    }
  }

  return breaks;
}
