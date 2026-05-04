import { safeJoin, safeResolve } from '../safe-path';
import { execSync } from 'child_process';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';

// Only run in DEEP/TOTAL mode — check for env var
// Usage: PULSE_DEEP=1 npx ts-node scripts/pulse/index.ts

interface ProjectTarget {
  dir: string;
  categoryParts: string[];
  label: string;
}

interface TscDiagnosticEvidence {
  filePath: string;
  lineNumber: number;
  code: string;
  message: string;
}

interface BuildDiagnosticInput {
  categoryParts: string[];
  severity: Break['severity'];
  file: string;
  line: number;
  description: string;
  detail: string;
  predicates: readonly string[];
}

// Grammar for TypeScript diagnostics emitted by `tsc --noEmit`.
const tscDiagnosticGrammarPatterns = [
  /^(.+?)\((\d+),\d+\): error (TS\d+): (.+)$/,
  /^(.+?):(\d+):\d+\s+-\s+error (TS\d+): (.+)$/,
];

const MAX_ERRORS_PER_PROJECT = 20;
const TSC_TIMEOUT_MS = 60_000;

function diagnosticType(parts: string[]): string {
  return parts.map((part) => part.toUpperCase()).join('_');
}

function buildDiagnostic(input: BuildDiagnosticInput): Break {
  const predicateEvidence = input.predicates.join(',');
  return {
    type: diagnosticType(input.categoryParts),
    severity: input.severity,
    file: input.file,
    line: input.line,
    description: input.description,
    detail: `${input.detail} Evidence predicates: ${predicateEvidence}.`,
    source: `grammar-kernel:build-checker;truthMode=observed_tsc_output;predicates=${predicateEvidence}`,
  };
}

function appendBuildDiagnostic(breaks: Break[], input: BuildDiagnosticInput): void {
  breaks.push(buildDiagnostic(input));
}

function parseTscDiagnosticLine(line: string): TscDiagnosticEvidence | null {
  for (const pattern of tscDiagnosticGrammarPatterns) {
    const match = pattern.exec(line);
    if (!match) {
      continue;
    }

    const [, filePath, lineNum, code, message] = match;
    return {
      filePath,
      lineNumber: parseInt(lineNum, 10) || 1,
      code,
      message: message.trim(),
    };
  }

  return null;
}

function parseTscOutput(
  stderr: string,
  projectDir: string,
  rootDir: string,
  categoryParts: string[],
  label: string,
): Break[] {
  const breaks: Break[] = [];
  const lines = stderr.split('\n');

  for (const raw of lines) {
    if (breaks.length >= MAX_ERRORS_PER_PROJECT) {
      break;
    }

    const line = raw.trim();
    if (!line) {
      continue;
    }

    const evidence = parseTscDiagnosticLine(line);
    if (!evidence) {
      continue;
    }

    // Resolve file path relative to root
    const absFile = path.isAbsolute(evidence.filePath)
      ? evidence.filePath
      : safeResolve(projectDir, evidence.filePath);
    const relFile = path.relative(rootDir, absFile);

    appendBuildDiagnostic(breaks, {
      categoryParts,
      severity: 'critical',
      file: relFile,
      line: evidence.lineNumber,
      description: `${label} TypeScript compile error: ${evidence.code}`,
      detail: evidence.message.slice(0, 200),
      predicates: ['tsc_process_failed', 'tsc_diagnostic_line_parsed'],
    });
  }

  return breaks;
}

function runTsc(
  projectDir: string,
  rootDir: string,
  categoryParts: string[],
  label: string,
): Break[] {
  try {
    execSync('npx tsc --noEmit', {
      cwd: projectDir,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: TSC_TIMEOUT_MS,
    });
    // No error → clean build
    return [];
  } catch (err: unknown) {
    const e = err as { stderr?: string; stdout?: string; message?: string };

    // tsc writes errors to stdout (not stderr) for --noEmit
    const output = (e.stderr || '') + (e.stdout || '');
    if (!output.trim()) {
      // Execution failed but no parseable output (e.g. tsc not installed)
      return [];
    }

    const parsed = parseTscOutput(output, projectDir, rootDir, categoryParts, label);

    // If we couldn't parse individual errors but tsc failed, emit one generic break
    if (parsed.length === 0) {
      const breaks: Break[] = [];
      appendBuildDiagnostic(breaks, {
        categoryParts,
        severity: 'critical',
        file: path.relative(rootDir, projectDir),
        line: 1,
        description: `${label} TypeScript compilation failed`,
        detail: output.split('\n').filter(Boolean).slice(0, 3).join(' | ').slice(0, 200),
        predicates: ['tsc_process_failed', 'tsc_output_unparsed'],
      });
      return breaks;
    }

    return parsed;
  }
}

/** Check builds. */
export function checkBuilds(config: PulseConfig): Break[] {
  if (!process.env.PULSE_DEEP) {
    return [];
  }

  const targets: ProjectTarget[] = [
    {
      dir: path.dirname(config.frontendDir), // frontend/ (not frontend/src)
      categoryParts: ['build', 'frontend', 'fails'],
      label: 'Frontend',
    },
    {
      dir: path.dirname(config.backendDir), // backend/ (not backend/src)
      categoryParts: ['build', 'backend', 'fails'],
      label: 'Backend',
    },
    {
      dir: config.workerDir,
      categoryParts: ['build', 'worker', 'fails'],
      label: 'Worker',
    },
  ];

  const breaks: Break[] = [];

  for (const target of targets) {
    const result = runTsc(target.dir, config.rootDir, target.categoryParts, target.label);
    breaks.push(...result);
  }

  return breaks;
}
