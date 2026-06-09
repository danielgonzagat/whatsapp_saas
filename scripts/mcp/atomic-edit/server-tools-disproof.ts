import * as childProcess from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { REPO_ROOT } from './guard.js';
import { ok, fail } from './server-helpers-result.js';

const DISPROOF_BRIEFING_MODES = ['self-test', 'verify-corpus', 'select-disproofs', 'build-briefing', 'briefing'] as const;
type DisproofBriefingMode = (typeof DISPROOF_BRIEFING_MODES)[number];

const LESSON_RULE_MODES = ['verify-lessons', 'cluster-witnesses', 'consolidate'] as const;
type LessonRuleMode = (typeof LESSON_RULE_MODES)[number];

function isDisproofBriefingMode(value: unknown): value is DisproofBriefingMode {
  return typeof value === 'string' && (DISPROOF_BRIEFING_MODES as readonly string[]).includes(value);
}

function isLessonRuleMode(value: unknown): value is LessonRuleMode {
  return typeof value === 'string' && (LESSON_RULE_MODES as readonly string[]).includes(value);
}

const MODE_TO_CLI: Record<Exclude<DisproofBriefingMode, 'briefing'>, string> = {
  'self-test': '--self-test',
  'verify-corpus': '--verify-corpus-jsonl',
  'select-disproofs': '--select-disproofs',
  'build-briefing': '--build-briefing',
};

const LESSON_MODE_TO_CLI: Record<LessonRuleMode, string> = {
  'verify-lessons': '--verify-lessons-jsonl',
  'cluster-witnesses': '--cluster-witnesses',
  consolidate: '--consolidate',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalRecordArray(value: unknown, name: string): Record<string, unknown>[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || !value.every(isRecord)) throw new Error(`${name} must be an array of objects`);
  return value;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, stableValue(nested)]));
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function atomicSourceRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.basename(here) === 'dist' ? path.resolve(here, '..') : here;
}

function disproofHarnessPath(): string {
  return path.resolve(atomicSourceRoot(), '..', 'atomic-edit-evolution', 'disproof-corpus-harness.mjs');
}

function defaultCorpusPath(): string {
  return path.join(REPO_ROOT, '.atomic', 'disproof-corpus.jsonl');
}

function lessonHarnessPath(): string {
  return path.resolve(atomicSourceRoot(), '..', 'atomic-edit-evolution', 'lesson-harness.mjs');
}

function defaultLessonsPath(): string {
  return path.join(REPO_ROOT, '.atomic', 'lesson-rules.jsonl');
}

function readCorpusText(args: Record<string, unknown>): { corpusText: string; corpusPath: string; source: 'inline' | 'disk' } {
  if (typeof args.corpusText === 'string') {
    return { corpusText: args.corpusText, corpusPath: '<inline>', source: 'inline' };
  }
  const corpusPath = defaultCorpusPath();
  const corpusText = fs.existsSync(corpusPath) ? fs.readFileSync(corpusPath, 'utf8') : '';
  return { corpusText, corpusPath, source: 'disk' };
}

function readLessonsText(args: Record<string, unknown>): { lessonsText: string; lessonsPath: string; source: 'inline' | 'disk' } {
  if (typeof args.lessonsText === 'string') {
    return { lessonsText: args.lessonsText, lessonsPath: '<inline>', source: 'inline' };
  }
  const lessonsPath = defaultLessonsPath();
  const lessonsText = fs.existsSync(lessonsPath) ? fs.readFileSync(lessonsPath, 'utf8') : '';
  return { lessonsText, lessonsPath, source: 'disk' };
}

function lessonsTextFromRecords(records: Record<string, unknown>[]): string {
  return records.length === 0 ? '' : `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
}

function parseHarnessJson(stdout: string): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(stdout.trim() || '{}');
    if (!isRecord(parsed)) return { ok: false, error: 'disproof harness returned non-object JSON' };
    return { ok: true, value: parsed };
  } catch (error) {
    return { ok: false, error: `disproof harness returned invalid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function runDisproofHarness(mode: Exclude<DisproofBriefingMode, 'briefing'>, input: Record<string, unknown>): {
  status: number | null;
  signal: NodeJS.Signals | null;
  stderr: string;
  parsed: { ok: true; value: Record<string, unknown> } | { ok: false; error: string };
} {
  const script = disproofHarnessPath();
  if (!fs.existsSync(script)) throw new Error(`disproof corpus harness not found: ${script}`);
  const child = childProcess.spawnSync(process.execPath, [script, MODE_TO_CLI[mode]], {
    cwd: atomicSourceRoot(),
    env: {
      ...process.env,
      ATOMIC_SINGLE_TOOL_CALL: '',
      ATOMIC_SINGLE_TOOL_NAME: '',
      ATOMIC_SINGLE_TOOL_ARGS_JSON: '',
    },
    input: mode === 'self-test' ? undefined : JSON.stringify(input),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return {
    status: child.status,
    signal: child.signal,
    stderr: child.stderr ?? (child.error instanceof Error ? child.error.message : ''),
    parsed: parseHarnessJson(child.stdout ?? ''),
  };
}

function runLessonHarness(mode: LessonRuleMode, input: Record<string, unknown>): {
  status: number | null;
  signal: NodeJS.Signals | null;
  stderr: string;
  parsed: { ok: true; value: Record<string, unknown> } | { ok: false; error: string };
} {
  const script = lessonHarnessPath();
  if (!fs.existsSync(script)) throw new Error(`lesson harness not found: ${script}`);
  const child = childProcess.spawnSync(process.execPath, [script, LESSON_MODE_TO_CLI[mode]], {
    cwd: atomicSourceRoot(),
    env: {
      ...process.env,
      ATOMIC_SINGLE_TOOL_CALL: '',
      ATOMIC_SINGLE_TOOL_NAME: '',
      ATOMIC_SINGLE_TOOL_ARGS_JSON: '',
    },
    input: JSON.stringify(input),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return {
    status: child.status,
    signal: child.signal,
    stderr: child.stderr ?? (child.error instanceof Error ? child.error.message : ''),
    parsed: parseHarnessJson(child.stdout ?? ''),
  };
}

function requireHarnessOk(result: ReturnType<typeof runDisproofHarness>, label: string): Record<string, unknown> {
  if (result.parsed.ok !== true) throw new Error(`${label}: ${result.parsed.error}`);
  const value = result.parsed.value;
  if (value.ok !== true) throw new Error(`${label}: ${typeof value.error === 'string' ? value.error : 'harness returned ok=false'}`);
  return value;
}

function requireLessonHarnessOk(result: ReturnType<typeof runLessonHarness>, label: string): Record<string, unknown> {
  if (result.parsed.ok !== true) throw new Error(`${label}: ${result.parsed.error}`);
  const value = result.parsed.value;
  if (value.ok !== true) throw new Error(`${label}: ${typeof value.error === 'string' ? value.error : 'lesson harness returned ok=false'}`);
  return value;
}

function loadValidatedLessonRules(args: Record<string, unknown>): {
  lessons: Record<string, unknown>[];
  lessonsPath: string;
  lessonsSource: 'inline' | 'disk';
  lessonsText: string;
  lessonsVerified: Record<string, unknown>;
} {
  let lessonInput = readLessonsText(args);
  if (args.lessons !== undefined && args.lessons !== null) {
    const inlineLessons = optionalRecordArray(args.lessons, 'lessons');
    lessonInput = { lessonsText: lessonsTextFromRecords(inlineLessons), lessonsPath: '<inline>', source: 'inline' };
  }
  const verified = requireLessonHarnessOk(
    runLessonHarness('verify-lessons', { lessonsText: lessonInput.lessonsText }),
    'verify-lessons',
  );
  const lessons = Array.isArray(verified.lessons) ? verified.lessons : [];
  if (!lessons.every(isRecord)) throw new Error('verify-lessons returned a non-object lesson');
  return {
    lessons,
    lessonsPath: lessonInput.lessonsPath,
    lessonsSource: lessonInput.source,
    lessonsText: lessonInput.lessonsText,
    lessonsVerified: verified,
  };
}

function writeLessonRulesAtomically(targetPath: string, text: string): { afterSha256: string; bytes: number; path: string } {
  const canonicalPath = defaultLessonsPath();
  if (targetPath !== canonicalPath) throw new Error('lesson rules persistence is hardwired to .atomic/lesson-rules.jsonl');
  fs.mkdirSync(path.dirname(canonicalPath), { recursive: true });
  const tmpPath = path.join(
    path.dirname(canonicalPath),
    `.lesson-rules.${process.pid}.${Date.now()}.${crypto.randomBytes(8).toString('hex')}.tmp`,
  );
  let fd: number | null = null;
  try {
    fd = fs.openSync(tmpPath, 'wx', 0o600);
    fs.writeSync(fd, text, 0, 'utf8');
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tmpPath, canonicalPath);
    const after = fs.readFileSync(canonicalPath, 'utf8');
    if (after !== text) throw new Error('lesson rules post-write byte verification failed');
    return { afterSha256: sha256(after), bytes: Buffer.byteLength(after, 'utf8'), path: canonicalPath };
  } catch (error) {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch { /* best-effort close */ }
    }
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch { /* best-effort temp cleanup */ }
    throw error;
  }
}

function lessonProofLimits(): string[] {
  return [
    'LessonRules are proposer guidance, not gates and not proof of correctness.',
    'LessonRules must carry neverAGate:true and pass recomputation before use.',
    'Persisted lessons are hardwired to .atomic/lesson-rules.jsonl; callers cannot choose a path.',
  ];
}

function runLessonRules(args: Record<string, unknown>): Record<string, unknown> {
  const rawMode = args.mode ?? 'consolidate';
  if (!isLessonRuleMode(rawMode)) throw new Error(`refused: unknown lesson rule mode: ${String(rawMode)}`);
  const mode = rawMode;
  const limits = lessonProofLimits();
  const canonicalLessonsPath = defaultLessonsPath();
  const lessonInput = readLessonsText(args);
  if (mode === 'verify-lessons') {
    const lessonState = loadValidatedLessonRules(args);
    return {
      ok: true,
      changed: false,
      mode,
      lessonsFile: lessonState.lessonsPath,
      lessonsSource: lessonState.lessonsSource,
      lessonCount: lessonState.lessons.length,
      lessonsDigest: sha256(lessonState.lessonsText),
      lessonsVerified: lessonState.lessonsVerified,
      proofLimits: limits,
    };
  }
  const { corpusText, corpusPath, source: corpusSource } = readCorpusText(args);
  if (mode === 'cluster-witnesses') {
    const clustered = requireLessonHarnessOk(runLessonHarness('cluster-witnesses', { corpusText }), 'cluster-witnesses');
    return {
      ok: true,
      changed: false,
      mode,
      corpusPath,
      corpusSource,
      clusters: clustered.clusters ?? [],
      proofLimits: limits,
    };
  }
  const consolidated = requireLessonHarnessOk(
    runLessonHarness('consolidate', { corpusText, lessonsText: lessonInput.lessonsText }),
    'consolidate',
  );
  const nextLessonsText = typeof consolidated.lessonsText === 'string' ? consolidated.lessonsText : lessonInput.lessonsText;
  const changed = nextLessonsText !== lessonInput.lessonsText;
  const verified = requireLessonHarnessOk(runLessonHarness('verify-lessons', { lessonsText: nextLessonsText }), 'verify-consolidated-lessons');
  const persist = args.persist === true;
  const preview = args.preview === true;
  const writeReceipt = persist && !preview && changed ? writeLessonRulesAtomically(canonicalLessonsPath, nextLessonsText) : null;
  return {
    ok: true,
    changed: writeReceipt !== null,
    mode,
    preview,
    persisted: writeReceipt !== null,
    corpusPath,
    corpusSource,
    lessonsFile: '.atomic/lesson-rules.jsonl',
    lessonsSource: lessonInput.source,
    accepted: consolidated.accepted ?? [],
    discarded: consolidated.discarded ?? [],
    acceptedCount: Array.isArray(consolidated.accepted) ? consolidated.accepted.length : 0,
    discardedCount: Array.isArray(consolidated.discarded) ? consolidated.discarded.length : 0,
    existingLessonsDigest: sha256(lessonInput.lessonsText),
    lessonsDigest: sha256(nextLessonsText),
    lessonsVerified: verified,
    writeReceipt,
    proofLimits: limits,
  };
}

function runBriefing(args: Record<string, unknown>): Record<string, unknown> {
  const { corpusText, corpusPath, source } = readCorpusText(args);
  const lessonRules = loadValidatedLessonRules(args);
  const verify = requireHarnessOk(runDisproofHarness('verify-corpus', { corpusText }), 'verify-corpus');
  const selection = requireHarnessOk(
    runDisproofHarness('select-disproofs', {
      corpusText,
      region: typeof args.region === 'string' ? args.region : '',
      k: typeof args.k === 'number' && Number.isFinite(args.k) ? args.k : 8,
      seed: typeof args.seed === 'string' ? args.seed : undefined,
    }),
    'select-disproofs',
  );
  const selected = Array.isArray(selection.selected) ? selection.selected : [];
  const briefing = requireHarnessOk(
    runDisproofHarness('build-briefing', {
      selected,
      lessons: lessonRules.lessons,
      repairTraces: optionalRecordArray(args.repairTraces, 'repairTraces'),
    }),
    'build-briefing',
  );
  return {
    ok: true,
    changed: false,
    mode: 'briefing',
    corpusPath,
    corpusSource: source,
    lessonsFile: lessonRules.lessonsPath,
    lessonsSource: lessonRules.lessonsSource,
    lessonsVerified: lessonRules.lessonsVerified,
    lessonCount: lessonRules.lessons.length,
    corpusVerified: verify,
    selection,
    briefing,
    briefingDigest: briefing.briefingDigest,
    briefingText: briefing.text,
    selectedCount: selected.length,
    proofLimits: [
      'Briefing is proposer guidance, not a gate and not a proof of correctness.',
      'The hard gate remains the only judge; learned lessons may never weaken admission.',
      'The corpus is verified before selection; forged records are rejected by the harness.',
    ],
  };
}

function runShadowGate(args: Record<string, unknown>): Record<string, unknown> {
  const region = typeof args.region === 'string' ? args.region : '';
  const k = typeof args.k === 'number' && Number.isFinite(args.k) ? args.k : 8;
  const { corpusText, corpusPath, source } = readCorpusText(args);
  const lessonRules = loadValidatedLessonRules(args);
  const corpusVerified = requireHarnessOk(runDisproofHarness('verify-corpus', { corpusText }), 'verify-corpus');
  const selection = requireHarnessOk(
    runDisproofHarness('select-disproofs', {
      corpusText,
      region,
      k,
      seed: typeof args.seed === 'string' ? args.seed : 'atomic-shadow-gate',
    }),
    'select-disproofs',
  );
  const selected = Array.isArray(selection.selected) ? selection.selected : [];
  const briefing = requireHarnessOk(
    runDisproofHarness('build-briefing', {
      selected,
      lessons: lessonRules.lessons,
      repairTraces: optionalRecordArray(args.repairTraces, 'repairTraces'),
    }),
    'build-briefing',
  );
  const proposalDigest = typeof args.proposalDigest === 'string'
    ? args.proposalDigest
    : sha256(stableJson({
      diffText: typeof args.diffText === 'string' ? args.diffText : null,
      files: Array.isArray(args.files) ? args.files : [],
      intent: typeof args.intent === 'string' ? args.intent : null,
      region,
    }));
  const wallKeys = selected.map((entry) => (typeof entry.wallKey === 'string' ? entry.wallKey : sha256(stableJson(entry))));
  const verdict = selected.length > 0 ? 'KNOWN_WALLS_FOUND' : 'NO_KNOWN_WALLS_FOUND';
  const shadowGateDigest = sha256(stableJson({
    briefingDigest: typeof briefing.briefingDigest === 'string' ? briefing.briefingDigest : null,
    corpusHead: corpusVerified.headRecordSha256 ?? null,
    proposalDigest,
    region,
    verdict,
    wallKeys,
  }));
  return {
    ok: true,
    changed: false,
    mode: 'shadow-gate',
    verdict,
    shadowCount: 1,
    shadowGateDigest,
    proposalDigest,
    region,
    corpusPath,
    corpusSource: source,
    lessonsFile: lessonRules.lessonsPath,
    lessonsSource: lessonRules.lessonsSource,
    lessonsVerified: lessonRules.lessonsVerified,
    lessonCount: lessonRules.lessons.length,
    corpusVerified,
    selection,
    witnesses: selected,
    witnessCount: selected.length,
    briefing,
    briefingDigest: briefing.briefingDigest,
    briefingText: briefing.text,
    archiveEntrySha256: null,
    correctedDiff: null,
    proofLimits: [
      'Shadow gate is a read-only probe, not promotion and not admission.',
      'It returns witnesses/briefing only; it never returns a corrected diff.',
      'A clean shadow result only means no matching historical wall was selected; the hard gate remains the judge.',
    ],
  };
}

function harnessInput(mode: Exclude<DisproofBriefingMode, 'briefing'>, args: Record<string, unknown>): Record<string, unknown> {
  const { corpusText } = readCorpusText(args);
  switch (mode) {
    case 'self-test':
      return {};
    case 'verify-corpus':
      return { corpusText };
    case 'select-disproofs':
      return {
        corpusText,
        region: typeof args.region === 'string' ? args.region : '',
        k: typeof args.k === 'number' && Number.isFinite(args.k) ? args.k : 8,
        seed: typeof args.seed === 'string' ? args.seed : undefined,
      };
    case 'build-briefing': {
      const lessonRules = loadValidatedLessonRules(args);
      return {
        selected: optionalRecordArray(args.selected, 'selected'),
        lessons: lessonRules.lessons,
        repairTraces: optionalRecordArray(args.repairTraces, 'repairTraces'),
      };
    }
  }
}

export function registerToolsDisproof(server: McpServer): void {
  server.registerTool(
    'atomic_lesson_rules',
    {
      title: 'Atomic lesson rules - validated disproof-to-lesson consolidation',
      description:
        'Consolidates verified disproof witnesses into validated LessonRules, verifies existing .atomic/lesson-rules.jsonl, ' +
        'and optionally persists the append-only guidance corpus. LessonRules are proposer guidance only and never gates.',
      inputSchema: {
        mode: z.enum(['verify-lessons', 'cluster-witnesses', 'consolidate']).optional().describe('Defaults to consolidate.'),
        corpusText: z.string().optional().describe('Inline disproof corpus JSONL; defaults to repo .atomic/disproof-corpus.jsonl.'),
        lessonsText: z.string().optional().describe('Inline LessonRule JSONL; defaults to repo .atomic/lesson-rules.jsonl.'),
        lessons: z.array(z.record(z.string(), z.unknown())).optional().describe('Optional inline LessonRule records; verified before use.'),
        persist: z.boolean().optional().describe('When true, persist consolidated lessons to .atomic/lesson-rules.jsonl.'),
        preview: z.boolean().optional().describe('When true, return the would-be result without writing even if persist is true.'),
      },
    },
    async (a) => {
      try {
        return ok(runLessonRules(a as Record<string, unknown>));
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    'atomic_disproof_briefing',
    {
      title: 'Atomic disproof briefing - proof feedback for proposers',
      description:
        'Turns the verified disproof corpus into proposer guidance: verifies .atomic/disproof-corpus.jsonl, selects relevant walls, ' +
        'builds a layered briefing, and returns briefingDigest for proposal ledgers. This is guidance only; the hard gate remains the judge.',
      inputSchema: {
        mode: z.enum(['self-test', 'verify-corpus', 'select-disproofs', 'build-briefing', 'briefing']).optional().describe('Defaults to briefing.'),
        region: z.string().optional().describe('Region/path touched by the next proposal; used by select-disproofs/briefing.'),
        k: z.number().int().positive().max(32).optional().describe('Maximum disproof walls to select. Defaults to 8.'),
        seed: z.string().optional().describe('Deterministic anti-myopia seed for distant-wall selection.'),
        corpusText: z.string().optional().describe('Inline corpus JSONL; defaults to repo .atomic/disproof-corpus.jsonl.'),
        selected: z.array(z.record(z.string(), z.unknown())).optional().describe('Preselected witness records for build-briefing.'),
        lessons: z.array(z.record(z.string(), z.unknown())).optional().describe('Optional inline LessonRule records to include in briefing L1; verified before use.'),
        lessonsText: z.string().optional().describe('Inline LessonRule JSONL; defaults to repo .atomic/lesson-rules.jsonl when lessons is omitted.'),
        repairTraces: z.array(z.record(z.string(), z.unknown())).optional().describe('Optional disproval-to-accepted-repair traces for briefing L3.'),
      },
    },
    async (a) => {
      try {
        const args = a as Record<string, unknown>;
        const rawMode = args.mode ?? 'briefing';
        if (!isDisproofBriefingMode(rawMode)) return fail(`refused: unknown disproof briefing mode: ${String(rawMode)}`);
        const mode = rawMode;
        if (mode === 'briefing') return ok(runBriefing(args));
        const input = harnessInput(mode, args);
        const result = runDisproofHarness(mode, input);
        if (result.parsed.ok !== true) return fail(result.parsed.error);
        return ok({
          ok: true,
          changed: false,
          mode,
          accepted: result.parsed.value.ok === true,
          harnessExitCode: result.status,
          harnessSignal: result.signal,
          harness: result.parsed.value,
          stderr: result.stderr.trim().length > 0 ? result.stderr.trim() : undefined,
        });
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    'atomic_shadow_gate',
    {
      title: 'Atomic shadow gate - read-only preflight wall probe',
      description:
        'Runs a read-only probe over the verified disproof corpus before proposing an edit. It returns selected witnesses, a briefing, ' +
        'and shadowGateDigest for audit. It does not promote, admit, archive, append to the corpus, or repair the diff.',
      inputSchema: {
        intent: z.string().optional().describe('Intent of the proposal being probed.'),
        region: z.string().optional().describe('Region/path the proposal expects to touch.'),
        proposalDigest: z.string().optional().describe('Caller-computed digest of the proposal; computed from intent/region/diffText/files when omitted.'),
        diffText: z.string().optional().describe('Optional draft diff text, used only to derive proposalDigest when no digest is supplied.'),
        files: z.array(z.record(z.string(), z.unknown())).optional().describe('Optional structured file targets, used only to derive proposalDigest when no digest is supplied.'),
        k: z.number().int().positive().max(32).optional().describe('Maximum disproof walls to select. Defaults to 8.'),
        seed: z.string().optional().describe('Deterministic anti-myopia seed for distant-wall selection.'),
        corpusText: z.string().optional().describe('Inline corpus JSONL; defaults to repo .atomic/disproof-corpus.jsonl.'),
        lessons: z.array(z.record(z.string(), z.unknown())).optional().describe('Optional inline LessonRule records to include in briefing L1; verified before use.'),
        lessonsText: z.string().optional().describe('Inline LessonRule JSONL; defaults to repo .atomic/lesson-rules.jsonl when lessons is omitted.'),
        repairTraces: z.array(z.record(z.string(), z.unknown())).optional().describe('Optional disproval-to-accepted-repair traces for briefing L3.'),
      },
    },
    async (a) => {
      try {
        return ok(runShadowGate(a as Record<string, unknown>));
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error));
      }
    },
  );
}
