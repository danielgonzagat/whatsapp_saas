/**
 * PULSE gitnexus CLI — invoked via `node scripts/pulse/run.js gitnexus ...`
 *
 * Exports a handler that is called from index-cli.ts when the subcommand
 * is 'gitnexus'. Does NOT modify the main PULSE entry point directly.
 */
import * as path from 'node:path';
import * as fs from 'node:fs';

import { GitNexusCodeGraphProvider } from './provider';
import type { GitNexusEvidence, GitNexusImpactReport } from './types';

function repoRoot(cwd?: string): string {
  return cwd ?? process.cwd();
}

function writeJson(filename: string, data: unknown, cwd?: string): void {
  const target = path.join(repoRoot(cwd), filename);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(data, null, 2), 'utf8');
}

export async function gitnexusCli(args: string[]): Promise<void> {
  const provider = new GitNexusCodeGraphProvider();
  const root = repoRoot();

  const flag = args[0] ?? '--status';
  const changedArg = args.find((a) => a === '--changed')
    ? args[args.indexOf('--changed') + 1]
    : null;

  if (flag === '--status' || flag === 'status') {
    console.log('[PULSE:gitnexus] Checking GitNexus status...');
    const status = await provider.getStatus({ repoRoot: root });
    console.log(
      JSON.stringify(
        {
          available: status.available,
          availability: status.availability,
          indexExists: status.indexExists,
          indexState: status.indexState,
          currentCommit: status.currentCommit,
          lastIndexedCommit: status.lastIndexedCommit,
          registryDetected: status.registryDetected,
          warnings: status.warnings,
          errors: status.errors,
        },
        null,
        2,
      ),
    );

    const evidence = await provider.collectEvidence({ repoRoot: root });
    writeJson('PULSE_GITNEXUS_EVIDENCE.json', evidence);
    console.log('[PULSE:gitnexus] Evidence written to PULSE_GITNEXUS_EVIDENCE.json');
    return;
  }

  if (flag === '--index' || flag === 'index') {
    const force = args.includes('--force');
    const skills = args.includes('--skills');
    console.log(
      `[PULSE:gitnexus] Indexing repo at ${root}${force ? ' (force)' : ''}${skills ? ' (skills)' : ''}...`,
    );
    const result = await provider.analyzeRepo({ repoRoot: root, force, skills });
    console.log(
      `[PULSE:gitnexus] Index ${result.indexed ? 'SUCCEEDED' : 'FAILED'} in ${result.commandResult.durationMs}ms`,
    );
    if (!result.indexed) {
      console.error(result.commandResult.stderr.slice(0, 1000));
    }
    return;
  }

  if (flag === '--impact' || flag === 'impact') {
    let changedFiles: string[] = [];
    if (changedArg) {
      changedFiles = changedArg.split(',').map((f) => f.trim());
    } else {
      // Collect from git
      const { execFileSync } = await import('node:child_process');
      try {
        const staged = execFileSync('git', ['diff', '--cached', '--name-only'], {
          cwd: root,
          encoding: 'utf8',
        })
          .trim()
          .split('\n')
          .filter(Boolean);
        const unstaged = execFileSync('git', ['diff', '--name-only'], {
          cwd: root,
          encoding: 'utf8',
        })
          .trim()
          .split('\n')
          .filter(Boolean);
        changedFiles = [...new Set([...staged, ...unstaged])];
      } catch {
        changedFiles = [];
      }
    }

    console.log(`[PULSE:gitnexus] Analyzing impact for ${changedFiles.length} changed file(s)...`);
    const impact = await provider.getImpact({
      repoRoot: root,
      changedFiles,
      mode: 'pre-refactor',
    });

    writeJson('PULSE_GITNEXUS_IMPACT.json', impact);
    console.log(
      JSON.stringify(
        {
          riskLevel: impact.riskLevel,
          changedFiles: impact.changedFiles.length,
          impactedCapabilities: impact.impactedCapabilities,
          impactedFlows: impact.impactedFlows,
          impactedSymbols: impact.impactedSymbols.length,
          warnings: impact.warnings.slice(0, 5),
        },
        null,
        2,
      ),
    );
    console.log('[PULSE:gitnexus] Impact report written to PULSE_GITNEXUS_IMPACT.json');
    return;
  }

  if (flag === '--context' || flag === 'context') {
    const symbolName = args[1] ?? '';
    if (!symbolName) {
      console.log('[PULSE:gitnexus] Usage: pulse gitnexus --context <symbol>');
      return;
    }
    console.log(`[PULSE:gitnexus] Querying context for "${symbolName}"...`);
    const { execFileSync } = await import('node:child_process');
    try {
      const result = execFileSync('npx', ['-y', 'gitnexus@latest', 'context', symbolName], {
        cwd: root,
        encoding: 'utf8',
        timeout: 120_000,
        maxBuffer: 10 * 1024 * 1024,
      });
      console.log(result);
    } catch (err: any) {
      console.error(`Context query failed: ${err.message}`);
    }
    return;
  }

  if (flag === '--query' || flag === 'query') {
    const query = args.slice(1).join(' ');
    if (!query) {
      console.log('[PULSE:gitnexus] Usage: pulse gitnexus --query <search>');
      return;
    }
    console.log(`[PULSE:gitnexus] Searching: "${query}"...`);
    const { execFileSync } = await import('node:child_process');
    try {
      const result = execFileSync(
        'npx',
        ['-y', 'gitnexus@latest', 'query', '--limit', '10', query],
        {
          cwd: root,
          encoding: 'utf8',
          timeout: 120_000,
          maxBuffer: 10 * 1024 * 1024,
        },
      );
      console.log(result);
    } catch (err: any) {
      console.error(`Query failed: ${err.message}`);
    }
    return;
  }

  if (flag === '--report' || flag === 'report') {
    const status = await provider.getStatus({ repoRoot: root });
    const impact = changedArg
      ? await provider.getImpact({
          repoRoot: root,
          changedFiles: changedArg.split(','),
          mode: 'manual',
        })
      : undefined;

    const lines: string[] = [];
    lines.push('# PULSE Code Cortex — GitNexus Report');
    lines.push('');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push('');
    lines.push('## Status');
    lines.push(`- Available: ${status.available}`);
    lines.push(`- Index exists: ${status.indexExists}`);
    lines.push(`- Index state: ${status.indexState}`);
    lines.push(`- Current commit: ${status.currentCommit ?? 'unknown'}`);
    lines.push(`- Last indexed: ${status.lastIndexedCommit ?? 'unknown'}`);
    if (status.warnings.length) {
      lines.push('### Warnings');
      for (const w of status.warnings) lines.push(`- ${w}`);
    }
    if (status.errors.length) {
      lines.push('### Errors');
      for (const e of status.errors) lines.push(`- ${e}`);
    }
    if (impact) {
      lines.push('');
      lines.push('## Impact Analysis');
      lines.push(`- Risk level: ${impact.riskLevel}`);
      lines.push(`- Changed files: ${impact.changedFiles.length}`);
      lines.push(`- Impacted capabilities: ${impact.impactedCapabilities.join(', ') || 'none'}`);
      lines.push(`- Impacted flows: ${impact.impactedFlows.join(', ') || 'none'}`);
    }
    lines.push('');
    lines.push('## Usage');
    lines.push('- `npm run pulse:gitnexus:status` — check index state');
    lines.push('- `npm run pulse:gitnexus:index` — index repo');
    lines.push('- `npm run pulse:gitnexus:impact` — analyze impact of current changes');
    lines.push('- `npm run gitnexus:mcp` — start MCP server');
    lines.push('');

    const reportText = lines.join('\n');
    fs.writeFileSync(path.join(root, 'PULSE_GITNEXUS_IMPACT.md'), reportText, 'utf8');
    console.log(reportText);
    console.log('[PULSE:gitnexus] Report written to PULSE_GITNEXUS_IMPACT.md');
    return;
  }

  console.log(`[PULSE:gitnexus] Unknown flag: ${flag}`);
  console.log('Usage: pulse gitnexus [--status|--index|--impact|--report]');
}
