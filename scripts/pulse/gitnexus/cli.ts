/**
 * PULSE gitnexus CLI — invoked via `node scripts/pulse/run.js gitnexus ...`
 *
 * Exports a handler that is called from index-cli.ts when the subcommand
 * is 'gitnexus'. Does NOT modify the main PULSE entry point directly.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { GitNexusCodeGraphProvider } from './provider';

const LOG_TAG = '[PULSE:gitnexus]';
const DEFAULT_CONTEXT_TIMEOUT_MS = 120_000;
const BYTES_PER_KILOBYTE = 1024;
const KILOBYTES_PER_MEGABYTE = 1024;
const DEFAULT_BUFFER_MEGABYTES = 10;
const DEFAULT_MAX_BUFFER_BYTES =
  DEFAULT_BUFFER_MEGABYTES * KILOBYTES_PER_MEGABYTE * BYTES_PER_KILOBYTE;
const DEFAULT_QUERY_LIMIT = 10;
const STDERR_TRUNCATE_BYTES = 1000;
const WARNINGS_PREVIEW_COUNT = 5;
const JSON_INDENT_SPACES = 2;

/**
 * Writes a single line to stdout, prefixed with the PULSE gitnexus log tag.
 */
function logCli(message: string): void {
  process.stdout.write(`${LOG_TAG} ${message}\n`);
}

/**
 * Writes a raw line to stdout (no tag).
 */
function writeStdout(message: string): void {
  process.stdout.write(`${message}\n`);
}

/**
 * Writes an error line to stderr.
 */
function writeStderr(message: string): void {
  process.stderr.write(`${message}\n`);
}

/**
 * Returns the repository root, defaulting to the current working directory.
 */
function repoRoot(cwd?: string): string {
  return cwd ?? process.cwd();
}

/**
 * Persists a JSON document under the repository root, creating the parent
 * directory if necessary.
 */
function writeJson(filename: string, data: unknown, cwd?: string): void {
  const target = path.join(repoRoot(cwd), filename);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(data, null, JSON_INDENT_SPACES), 'utf8');
}

/**
 * Returns a stable JSON dump used by every CLI command for human-readable
 * output.
 */
function formatJson(value: unknown): string {
  return JSON.stringify(value, null, JSON_INDENT_SPACES);
}

/**
 * Returns the value of `--changed` if present in the argument list, otherwise
 * `null`.
 */
function parseChangedArg(args: string[]): string | null {
  const idx = args.indexOf('--changed');
  if (idx === -1) {
    return null;
  }
  return args[idx + 1] ?? null;
}

/**
 * Returns the list of staged + unstaged files reported by git in `cwd`.
 * Returns an empty list if git fails for any reason.
 */
async function collectChangedFilesFromGit(cwd: string): Promise<string[]> {
  const { execFileSync } = await import('node:child_process');
  try {
    const staged = execFileSync('git', ['diff', '--cached', '--name-only'], {
      cwd,
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .filter(Boolean);
    const unstaged = execFileSync('git', ['diff', '--name-only'], {
      cwd,
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .filter(Boolean);
    return [...new Set([...staged, ...unstaged])];
  } catch {
    return [];
  }
}

/**
 * Handles the `--status` subcommand: prints provider status and persists
 * evidence to PULSE_GITNEXUS_EVIDENCE.json.
 */
async function runStatusCommand(provider: GitNexusCodeGraphProvider, root: string): Promise<void> {
  logCli('Checking GitNexus status...');
  const status = await provider.getStatus({ repoRoot: root });
  writeStdout(
    formatJson({
      availability: status.availability,
      available: status.available,
      currentCommit: status.currentCommit,
      errors: status.errors,
      indexExists: status.indexExists,
      indexState: status.indexState,
      lastIndexedCommit: status.lastIndexedCommit,
      registryDetected: status.registryDetected,
      warnings: status.warnings,
    }),
  );

  const evidence = await provider.collectEvidence({ repoRoot: root });
  writeJson('PULSE_GITNEXUS_EVIDENCE.json', evidence);
  logCli('Evidence written to PULSE_GITNEXUS_EVIDENCE.json');
}

/**
 * Handles the `--index` subcommand: invokes provider.analyzeRepo and reports
 * the outcome.
 */
async function runIndexCommand(
  provider: GitNexusCodeGraphProvider,
  root: string,
  args: string[],
): Promise<void> {
  const force = args.includes('--force');
  const skills = args.includes('--skills');
  const flags = `${force ? ' (force)' : ''}${skills ? ' (skills)' : ''}`;
  logCli(`Indexing repo at ${root}${flags}...`);
  const result = await provider.analyzeRepo({ repoRoot: root, force, skills });
  const verdict = result.indexed ? 'SUCCEEDED' : 'FAILED';
  logCli(`Index ${verdict} in ${result.commandResult.durationMs}ms`);
  if (!result.indexed) {
    writeStderr(result.commandResult.stderr.slice(0, STDERR_TRUNCATE_BYTES));
  }
}

/**
 * Handles the `--impact` subcommand: collects changed files (CLI-provided or
 * via git), runs an impact analysis, and persists/prints the report.
 */
async function runImpactCommand(
  provider: GitNexusCodeGraphProvider,
  root: string,
  changedArg: string | null,
): Promise<void> {
  let changedFiles: string[] = [];
  if (changedArg) {
    changedFiles = changedArg.split(',').map((f) => f.trim());
  } else {
    changedFiles = await collectChangedFilesFromGit(root);
  }

  logCli(`Analyzing impact for ${changedFiles.length} changed file(s)...`);
  const impact = await provider.getImpact({
    changedFiles,
    mode: 'pre-refactor',
    repoRoot: root,
  });

  writeJson('PULSE_GITNEXUS_IMPACT.json', impact);
  writeStdout(
    formatJson({
      changedFiles: impact.changedFiles.length,
      impactedCapabilities: impact.impactedCapabilities,
      impactedFlows: impact.impactedFlows,
      impactedSymbols: impact.impactedSymbols.length,
      riskLevel: impact.riskLevel,
      warnings: impact.warnings.slice(0, WARNINGS_PREVIEW_COUNT),
    }),
  );
  logCli('Impact report written to PULSE_GITNEXUS_IMPACT.json');
}

/**
 * Handles the `--context` subcommand: queries gitnexus for symbol context
 * and prints the raw output.
 */
async function runContextCommand(root: string, args: string[]): Promise<void> {
  const symbolName = args[1] ?? '';
  if (!symbolName) {
    logCli('Usage: pulse gitnexus --context <symbol>');
    return;
  }
  logCli(`Querying context for "${symbolName}"...`);
  const { execFileSync } = await import('node:child_process');
  try {
    const result = execFileSync('npx', ['-y', 'gitnexus@latest', 'context', symbolName], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: DEFAULT_MAX_BUFFER_BYTES,
      timeout: DEFAULT_CONTEXT_TIMEOUT_MS,
    });
    writeStdout(result);
  } catch (err: unknown) {
    writeStderr(`Context query failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Handles the `--query` subcommand: forwards the search to gitnexus query
 * and prints the raw output.
 */
async function runQueryCommand(root: string, args: string[]): Promise<void> {
  const query = args.slice(1).join(' ');
  if (!query) {
    logCli('Usage: pulse gitnexus --query <search>');
    return;
  }
  logCli(`Searching: "${query}"...`);
  const { execFileSync } = await import('node:child_process');
  try {
    const result = execFileSync(
      'npx',
      ['-y', 'gitnexus@latest', 'query', '--limit', String(DEFAULT_QUERY_LIMIT), query],
      {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: DEFAULT_MAX_BUFFER_BYTES,
        timeout: DEFAULT_CONTEXT_TIMEOUT_MS,
      },
    );
    writeStdout(result);
  } catch (err: unknown) {
    writeStderr(`Query failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Appends the status section (availability + diagnostics) to the report
 * lines.
 */
function appendStatusSection(
  lines: string[],
  status: Awaited<ReturnType<GitNexusCodeGraphProvider['getStatus']>>,
): void {
  lines.push('## Status');
  lines.push(`- Available: ${status.available}`);
  lines.push(`- Index exists: ${status.indexExists}`);
  lines.push(`- Index state: ${status.indexState}`);
  lines.push(`- Current commit: ${status.currentCommit ?? 'unknown'}`);
  lines.push(`- Last indexed: ${status.lastIndexedCommit ?? 'unknown'}`);
  if (status.warnings.length) {
    lines.push('### Warnings');
    for (const w of status.warnings) {
      lines.push(`- ${w}`);
    }
  }
  if (status.errors.length) {
    lines.push('### Errors');
    for (const e of status.errors) {
      lines.push(`- ${e}`);
    }
  }
}

/**
 * Appends the impact analysis section to the report lines, when an impact
 * report is available.
 */
function appendImpactSection(
  lines: string[],
  impact: Awaited<ReturnType<GitNexusCodeGraphProvider['getImpact']>>,
): void {
  lines.push('');
  lines.push('## Impact Analysis');
  lines.push(`- Risk level: ${impact.riskLevel}`);
  lines.push(`- Changed files: ${impact.changedFiles.length}`);
  lines.push(`- Impacted capabilities: ${impact.impactedCapabilities.join(', ') || 'none'}`);
  lines.push(`- Impacted flows: ${impact.impactedFlows.join(', ') || 'none'}`);
}

/**
 * Appends the trailing usage section to the report lines.
 */
function appendUsageSection(lines: string[]): void {
  lines.push('');
  lines.push('## Usage');
  lines.push('- `npm run pulse:gitnexus:status` — check index state');
  lines.push('- `npm run pulse:gitnexus:index` — index repo');
  lines.push('- `npm run pulse:gitnexus:impact` — analyze impact of current changes');
  lines.push('- `npm run gitnexus:mcp` — start MCP server');
  lines.push('');
}

/**
 * Handles the `--report` subcommand: produces a Markdown summary, writes it
 * to PULSE_GITNEXUS_IMPACT.md, and prints it to stdout.
 */
async function runReportCommand(
  provider: GitNexusCodeGraphProvider,
  root: string,
  changedArg: string | null,
): Promise<void> {
  const status = await provider.getStatus({ repoRoot: root });
  const impact = changedArg
    ? await provider.getImpact({
        changedFiles: changedArg.split(','),
        mode: 'manual',
        repoRoot: root,
      })
    : undefined;

  const lines: string[] = [];
  lines.push('# PULSE Code Cortex — GitNexus Report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  appendStatusSection(lines, status);
  if (impact) {
    appendImpactSection(lines, impact);
  }
  appendUsageSection(lines);

  const reportText = lines.join('\n');
  fs.writeFileSync(path.join(root, 'PULSE_GITNEXUS_IMPACT.md'), reportText, 'utf8');
  writeStdout(reportText);
  logCli('Report written to PULSE_GITNEXUS_IMPACT.md');
}

/**
 * Prints the usage banner for unknown flags and exits the handler.
 */
function printUnknownFlag(flag: string): void {
  logCli(`Unknown flag: ${flag}`);
  writeStdout('Usage: pulse gitnexus [--status|--index|--impact|--report]');
}

/**
 * Entry point for `pulse gitnexus ...` invocations. Dispatches to the
 * concrete subcommand handler based on the first positional argument.
 */
export async function gitnexusCli(args: string[]): Promise<void> {
  const provider = new GitNexusCodeGraphProvider();
  const root = repoRoot();
  const flag = args[0] ?? '--status';
  const changedArg = parseChangedArg(args);

  if (flag === '--status' || flag === 'status') {
    await runStatusCommand(provider, root);
    return;
  }
  if (flag === '--index' || flag === 'index') {
    await runIndexCommand(provider, root, args);
    return;
  }
  if (flag === '--impact' || flag === 'impact') {
    await runImpactCommand(provider, root, changedArg);
    return;
  }
  if (flag === '--context' || flag === 'context') {
    await runContextCommand(root, args);
    return;
  }
  if (flag === '--query' || flag === 'query') {
    await runQueryCommand(root, args);
    return;
  }
  if (flag === '--report' || flag === 'report') {
    await runReportCommand(provider, root, changedArg);
    return;
  }

  printUnknownFlag(flag);
}
