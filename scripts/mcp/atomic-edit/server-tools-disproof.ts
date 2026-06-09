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

function isDisproofBriefingMode(value: unknown): value is DisproofBriefingMode {
  return typeof value === 'string' && (DISPROOF_BRIEFING_MODES as readonly string[]).includes(value);
}

const MODE_TO_CLI: Record<Exclude<DisproofBriefingMode, 'briefing'>, string> = {
  'self-test': '--self-test',
  'verify-corpus': '--verify-corpus-jsonl',
  'select-disproofs': '--select-disproofs',
  'build-briefing': '--build-briefing',
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

function readCorpusText(args: Record<string, unknown>): { corpusText: string; corpusPath: string; source: 'inline' | 'disk' } {
  if (typeof args.corpusText === 'string') {
    return { corpusText: args.corpusText, corpusPath: '<inline>', source: 'inline' };
  }
  const corpusPath = defaultCorpusPath();
  const corpusText = fs.existsSync(corpusPath) ? fs.readFileSync(corpusPath, 'utf8') : '';
  return { corpusText, corpusPath, source: 'disk' };
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

function requireHarnessOk(result: ReturnType<typeof runDisproofHarness>, label: string): Record<string, unknown> {
  if (result.parsed.ok !== true) throw new Error(`${label}: ${result.parsed.error}`);
  const value = result.parsed.value;
  if (value.ok !== true) throw new Error(`${label}: ${typeof value.error === 'string' ? value.error : 'harness returned ok=false'}`);
  return value;
}

function runBriefing(args: Record<string, unknown>): Record<string, unknown> {
  const { corpusText, corpusPath, source } = readCorpusText(args);
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
      lessons: optionalRecordArray(args.lessons, 'lessons'),
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
      lessons: optionalRecordArray(args.lessons, 'lessons'),
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
    case 'build-briefing':
      return {
        selected: optionalRecordArray(args.selected, 'selected'),
        lessons: optionalRecordArray(args.lessons, 'lessons'),
        repairTraces: optionalRecordArray(args.repairTraces, 'repairTraces'),
      };
  }
}

export function registerToolsDisproof(server: McpServer): void {
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
        lessons: z.array(z.record(z.string(), z.unknown())).optional().describe('Optional validated LessonRule records to include in briefing L1.'),
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
        lessons: z.array(z.record(z.string(), z.unknown())).optional().describe('Optional validated LessonRule records to include in briefing L1.'),
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
