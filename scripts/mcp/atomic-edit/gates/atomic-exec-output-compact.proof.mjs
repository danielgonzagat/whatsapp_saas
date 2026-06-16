#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function record(results, name, ok, detail = {}) {
  results.push({ name, ok: Boolean(ok), detail });
}

function main() {
  const results = [];
  const execSource = fs.readFileSync(path.join(sourceDir, 'server-tools-exec.ts'), 'utf8');

  record(
    results,
    'atomic_exec uses a compact default return limit with cryptographic output receipts',
    execSource.includes("import * as crypto from 'node:crypto';") &&
      execSource.includes('const EXEC_OUTPUT_RETURN_LIMIT = 12000') &&
      execSource.includes('function digestText(s: string): string') &&
      execSource.includes("crypto.createHash('sha256').update(s).digest('hex')") &&
      execSource.includes("function byteLength(s: string): number") &&
      execSource.includes("Buffer.byteLength(s, 'utf8')") &&
      execSource.includes('function capText(s: string, max = EXEC_OUTPUT_RETURN_LIMIT)') &&
      !execSource.includes('max = 60000'),
    {
      hasCryptoImport: execSource.includes("import * as crypto from 'node:crypto';"),
      hasReturnLimit: execSource.includes('const EXEC_OUTPUT_RETURN_LIMIT = 12000'),
      hasDigest: execSource.includes('function digestText(s: string): string'),
      hasByteLength: execSource.includes("Buffer.byteLength(s, 'utf8')"),
      removedOldLimit: !execSource.includes('max = 60000'),
    },
  );

  record(
    results,
    'atomic_exec hashes full redacted stdout/stderr before returning capped or compacted text',
    execSource.includes("const stdoutFull = redactAll(res.stdout ?? '')") &&
      execSource.includes("const stderrFull = redactAll(res.stderr ?? '')") &&
      execSource.includes('const outputSummary = summarizeTestOutput(a.command, exitCode, stdoutFull, stderrFull)') &&
      execSource.includes('const stdout = capText(outputSummary.stdout)') &&
      execSource.includes('const stderr = capText(outputSummary.stderr)') &&
      execSource.includes('const stdoutSha256 = digestText(stdoutFull)') &&
      execSource.includes('const stderrSha256 = digestText(stderrFull)') &&
      execSource.includes('stdoutBytes: byteLength(stdoutFull)') &&
      execSource.includes('stderrBytes: byteLength(stderrFull)') &&
      execSource.includes('outputReturnLimit: EXEC_OUTPUT_RETURN_LIMIT'),
    {
      hasStdoutFull: execSource.includes("const stdoutFull = redactAll(res.stdout ?? '')"),
      hasStderrFull: execSource.includes("const stderrFull = redactAll(res.stderr ?? '')"),
      hasSummaryBeforeReturnCap: execSource.includes('const outputSummary = summarizeTestOutput(a.command, exitCode, stdoutFull, stderrFull)'),
      hasStdoutHash: execSource.includes('const stdoutSha256 = digestText(stdoutFull)'),
      hasStderrHash: execSource.includes('const stderrSha256 = digestText(stderrFull)'),
      hasReturnLimitReceipt: execSource.includes('outputReturnLimit: EXEC_OUTPUT_RETURN_LIMIT'),
    },
  );

  record(
    results,
    'exec trace stores output size/hash/truncation metadata rather than relying on returned text',
    execSource.includes('output: {') &&
      execSource.includes('returnLimit: EXEC_OUTPUT_RETURN_LIMIT') &&
      execSource.includes('stdoutSha256') &&
      execSource.includes('stdoutTruncated: stdout.truncated') &&
      execSource.includes('stderrSha256') &&
      execSource.includes('stderrTruncated: stderr.truncated'),
    {
      hasOutputTrace: execSource.includes('output: {'),
      hasTraceLimit: execSource.includes('returnLimit: EXEC_OUTPUT_RETURN_LIMIT'),
      hasTraceStdoutHash: execSource.includes('stdoutSha256'),
      hasTraceStderrHash: execSource.includes('stderrSha256'),
    },
  );

  record(
    results,
    'atomic_exec caps atomicDiff while preserving diff byte counts and sha256',
    execSource.includes('const atomicDiffFull = redactAll(e.atomicDiff)') &&
      execSource.includes('const atomicDiff = capText(atomicDiffFull)') &&
      execSource.includes('atomicDiff: atomicDiff.text') &&
      execSource.includes('atomicDiffBytes: byteLength(atomicDiffFull)') &&
      execSource.includes('atomicDiffSha256: digestText(atomicDiffFull)') &&
      execSource.includes('atomicDiffTruncated: atomicDiff.truncated') &&
      !execSource.includes('...(e.atomicDiff ? { atomicDiff: redactAll(e.atomicDiff) } : {})'),
    {
      hasDiffFull: execSource.includes('const atomicDiffFull = redactAll(e.atomicDiff)'),
      hasDiffCap: execSource.includes('const atomicDiff = capText(atomicDiffFull)'),
      hasDiffHash: execSource.includes('atomicDiffSha256: digestText(atomicDiffFull)'),
      removedFullDiffReturn: !execSource.includes('...(e.atomicDiff ? { atomicDiff: redactAll(e.atomicDiff) } : {})'),
    },
  );

  record(
    results,
    'atomic_exec refuses package-runner commands as external package effects',
    execSource.includes('npx|bunx') &&
      execSource.includes('pnpm') &&
      execSource.includes('yarn') &&
      execSource.includes('package runner can download and execute registry code') &&
      execSource.includes('external-or-host-effect command refused under Y admission'),
    {
      hasNpxBunx: execSource.includes('npx|bunx'),
      hasPnpm: execSource.includes('pnpm'),
      hasYarn: execSource.includes('yarn'),
      hasPackageRunnerReason: execSource.includes('package runner can download and execute registry code'),
      keepsExternalAdmissionRefusal: execSource.includes('external-or-host-effect command refused under Y admission'),
    },
  );

  record(
    results,
    'atomic_exec summarizes green TAP stdout while preserving full output receipt',
    execSource.includes("readonly kind: 'tap-green' | 'tap-red'") &&
      execSource.includes('function summarizeTestOutput') &&
      execSource.includes('TAP version 13') &&
      execSource.includes('[atomic_exec:test-summary]') &&
      execSource.includes('full_stdout_sha256=') &&
      execSource.includes('const outputSummary = summarizeTestOutput') &&
      execSource.includes('const stdout = capText(outputSummary.stdout)') &&
      execSource.includes('stdoutSha256 = digestText(stdoutFull)') &&
      execSource.includes('stdoutSummary: outputSummary.summary'),
    {
      hasSummaryKindUnion: execSource.includes("readonly kind: 'tap-green' | 'tap-red'"),
      hasSummaryFunction: execSource.includes('function summarizeTestOutput'),
      detectsTap: execSource.includes('TAP version 13'),
      hasCompactMarker: execSource.includes('[atomic_exec:test-summary]'),
      hasFullOutputHashMarker: execSource.includes('full_stdout_sha256='),
      preservesFullHash: execSource.includes('stdoutSha256 = digestText(stdoutFull)'),
      exposesSummary: execSource.includes('stdoutSummary: outputSummary.summary'),
    },
  );

  record(
    results,
    'atomic_exec summarizes failing TAP stdout instead of returning raw red logs',
    execSource.includes("readonly kind: 'tap-green' | 'tap-red'") &&
      execSource.includes('function compactFailingTapLines') &&
      execSource.includes('TAP_FAILURE_LINE_LIMIT = 80') &&
      execSource.includes('TAP test command exited non-zero; returning compact failure stdout') &&
      execSource.includes("const kind: ExecOutputSummary['kind']") &&
      execSource.includes("kind === 'tap-red' ? compactFailingTapLines") &&
      execSource.includes('failing TAP excerpts') &&
      execSource.includes("failureLines: kind === 'tap-red' ? failureLines : undefined") &&
      !execSource.includes('exitCode !== 0 ||\n    !isLikelyTestCommand(command)'),
    {
      hasKindUnion: execSource.includes("readonly kind: 'tap-green' | 'tap-red'"),
      hasFailureCompactor: execSource.includes('function compactFailingTapLines'),
      hasFailureLimit: execSource.includes('TAP_FAILURE_LINE_LIMIT = 80'),
      hasRedHeadline: execSource.includes('TAP test command exited non-zero; returning compact failure stdout'),
      selectsRedKind: execSource.includes("const kind: ExecOutputSummary['kind']"),
      callsFailureCompactor: execSource.includes("kind === 'tap-red' ? compactFailingTapLines"),
      exposesFailureLines: execSource.includes("failureLines: kind === 'tap-red' ? failureLines : undefined"),
      removedRawRedReturn: !execSource.includes('exitCode !== 0 ||\n    !isLikelyTestCommand(command)'),
    },
  );

  return { ok: results.every((entry) => entry.ok), results };
}

const payload = main();
if (jsonMode) process.stdout.write(JSON.stringify(payload) + '\n');
else for (const entry of payload.results) process.stdout.write(`${entry.ok ? 'PASS' : 'FAIL'} ${entry.name}\n`);
process.exit(payload.ok ? 0 : 1);
