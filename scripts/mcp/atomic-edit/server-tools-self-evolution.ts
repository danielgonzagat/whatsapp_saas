import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ok, fail } from './server-helpers-result.js';

type SelfEvolutionMode =
  | 'self-test'
  | 'decide'
  | 'receipt'
  | 'verify-receipt'
  | 'archive-entry'
  | 'verify-archive-entry'
  | 'verify-archive-chain'
  | 'verify-archive-jsonl'
  | 'append-archive-jsonl';

const MODE_TO_CLI: Record<SelfEvolutionMode, string> = {
  'self-test': '--self-test',
  decide: '--decide',
  receipt: '--receipt',
  'verify-receipt': '--verify-receipt',
  'archive-entry': '--archive-entry',
  'verify-archive-entry': '--verify-archive-entry',
  'verify-archive-chain': '--verify-archive-chain',
  'verify-archive-jsonl': '--verify-archive-jsonl',
  'append-archive-jsonl': '--append-archive-jsonl',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredRecord(value: unknown, name: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${name} must be an object`);
  return value;
}

function optionalRecord(value: unknown, name: string): Record<string, unknown> | undefined {
  if (value === undefined || value === null) return undefined;
  return requiredRecord(value, name);
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string') throw new Error(`${name} must be a string`);
  return value;
}

function atomicSourceRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.basename(here) === 'dist' ? path.resolve(here, '..') : here;
}

function harnessPath(): string {
  return path.join(atomicSourceRoot(), 'self-evolution-harness.mjs');
}

function harnessInput(mode: SelfEvolutionMode, args: Record<string, unknown>): Record<string, unknown> {
  switch (mode) {
    case 'self-test':
      return {};
    case 'decide':
    case 'receipt':
      return {
        parent: requiredRecord(args.parent, 'parent'),
        candidate: requiredRecord(args.candidate, 'candidate'),
        policy: requiredRecord(args.policy, 'policy'),
      };
    case 'verify-receipt':
      return { receipt: requiredRecord(args.receipt, 'receipt') };
    case 'archive-entry':
      return {
        archiveId: typeof args.archiveId === 'string' && args.archiveId.length > 0 ? args.archiveId : undefined,
        previousEntry: optionalRecord(args.previousEntry, 'previousEntry') ?? null,
        receipt: requiredRecord(args.receipt, 'receipt'),
      };
    case 'verify-archive-entry':
      return {
        entry: requiredRecord(args.entry, 'entry'),
        previousEntry: optionalRecord(args.previousEntry, 'previousEntry') ?? null,
      };
    case 'verify-archive-chain':
      if (!Array.isArray(args.entries)) throw new Error('entries must be an array');
      return { entries: args.entries };
    case 'verify-archive-jsonl':
      return { archiveText: requiredString(args.archiveText, 'archiveText') };
    case 'append-archive-jsonl':
      return {
        archiveText: requiredString(args.archiveText, 'archiveText'),
        archiveId: typeof args.archiveId === 'string' && args.archiveId.length > 0 ? args.archiveId : undefined,
        receipt: requiredRecord(args.receipt, 'receipt'),
      };
  }
}

function parseHarnessJson(stdout: string): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(stdout.trim() || '{}');
    if (!isRecord(parsed)) return { ok: false, error: 'self-evolution harness returned non-object JSON' };
    return { ok: true, value: parsed };
  } catch (error) {
    return { ok: false, error: `self-evolution harness returned invalid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function runHarness(mode: SelfEvolutionMode, input: Record<string, unknown>): {
  status: number | null;
  signal: NodeJS.Signals | null;
  stderr: string;
  parsed: { ok: true; value: Record<string, unknown> } | { ok: false; error: string };
} {
  const script = harnessPath();
  if (!fs.existsSync(script)) throw new Error(`self-evolution harness not found: ${script}`);
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

export function registerToolsSelfEvolution(server: McpServer): void {
  server.registerTool(
    'atomic_self_evolution',
    {
      title: 'Atomic self-evolution - deterministic promotion and archive verifier',
      description:
        'Runs the Atomic self-evolution harness as a first-class MCP capability. It computes promotion decisions, ' +
        'proof-carrying promotion receipts, tamper-evident archive entries, archive-chain verification, portable JSONL ' +
        'archive verification/append planning, and independent receipt/archive verification. Rejected candidates and forged ' +
        'receipts are returned as deterministic verification results, not hidden tool failures.',
      inputSchema: {
        mode: z
          .enum([
            'self-test',
            'decide',
            'receipt',
            'verify-receipt',
            'archive-entry',
            'verify-archive-entry',
            'verify-archive-chain',
            'verify-archive-jsonl',
            'append-archive-jsonl',
          ])
          .optional()
          .describe('Harness operation. Defaults to self-test.'),
        parent: z.record(z.string(), z.unknown()).optional().describe('Parent Atomic variant facts for decide/receipt.'),
        candidate: z.record(z.string(), z.unknown()).optional().describe('Candidate Atomic variant facts for decide/receipt.'),
        policy: z.record(z.string(), z.unknown()).optional().describe('Promotion policy facts for decide/receipt.'),
        receipt: z.record(z.string(), z.unknown()).optional().describe('Promotion receipt for verify-receipt/archive-entry/append-archive-jsonl.'),
        entry: z.record(z.string(), z.unknown()).optional().describe('Archive entry for verify-archive-entry.'),
        entries: z.array(z.record(z.string(), z.unknown())).optional().describe('Archive entries for verify-archive-chain.'),
        archiveText: z.string().optional().describe('Portable JSONL archive text for verify-archive-jsonl/append-archive-jsonl.'),
        previousEntry: z.record(z.string(), z.unknown()).optional().describe('Previous archive entry when verifying/appending a chain.'),
        archiveId: z.string().optional().describe('Archive id for archive-entry/append-archive-jsonl mode.'),
      },
    },
    async (a) => {
      try {
        const mode = (a.mode ?? 'self-test') as SelfEvolutionMode;
        const input = harnessInput(mode, a as Record<string, unknown>);
        const result = runHarness(mode, input);
        if (result.parsed.ok !== true) return fail(result.parsed.error);
        const harness = result.parsed.value;
        return ok({
          ok: true,
          changed: false,
          mode,
          accepted: harness.ok === true,
          harnessExitCode: result.status,
          harnessSignal: result.signal,
          harness,
          stderr: result.stderr.trim().length > 0 ? result.stderr.trim() : undefined,
          proofLimits: [
            'Tool proves deterministic self-evolution decisions over caller-supplied benchmark/gate facts only.',
            'Rejected candidates and forged receipts are expected verifier outputs and do not mutate the workspace.',
            'No candidate is generated or promoted by this tool; it is the admission kernel for measured variants.',
          ],
        });
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error));
      }
    },
  );
}
