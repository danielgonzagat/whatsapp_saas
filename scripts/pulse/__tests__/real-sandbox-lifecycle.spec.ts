import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { buildRealSandboxPlan, executeRealSandbox, type ProcessRunner } from '../real-sandbox';

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-real-sandbox-lifecycle-'));
  tempRoots.push(rootDir);
  return rootDir;
}

function writeFile(rootDir: string, relativePath: string, content: string): void {
  const targetPath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content);
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const rootDir = tempRoots.pop();
    if (rootDir) {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  }
});

describe('real sandbox lifecycle evidence', () => {
  it('plans and executes patch check, patch apply, and validation inside the isolated workspace', async () => {
    const rootDir = makeTempRoot();
    writeFile(rootDir, 'scripts/pulse/owned.ts', 'export const value = 1;\n');
    writeFile(
      rootDir,
      '.pulse/worker.patch',
      [
        'diff --git a/scripts/pulse/owned.ts b/scripts/pulse/owned.ts',
        '--- a/scripts/pulse/owned.ts',
        '+++ b/scripts/pulse/owned.ts',
        '@@ -1 +1 @@',
        '-export const value = 1;',
        '+export const value = 2;',
      ].join('\n'),
    );

    const calls: Array<{ command: string; commandKind: string; cwd: string }> = [];
    const runner: ProcessRunner = (command, options) => {
      calls.push({ command, commandKind: options.commandKind, cwd: options.cwd });
      return { exitCode: 0 };
    };
    const plan = buildRealSandboxPlan({
      rootDir,
      patchPath: '.pulse/worker.patch',
      commands: ['npx vitest run scripts/pulse/__tests__/real-sandbox-lifecycle.spec.ts'],
      workspaceId: 'worker-lifecycle',
    });

    const result = await executeRealSandbox({ plan, runner });

    expect(plan.status).toBe('ready');
    expect(plan.patch).toEqual(
      expect.objectContaining({
        status: 'ready',
        changedFiles: ['scripts/pulse/owned.ts'],
      }),
    );
    expect(plan.touchedPaths).toEqual(['scripts/pulse/owned.ts']);
    expect(result.evidenceStatus).toBe('passed');
    expect(result.lifecycle).toEqual({
      workspaceCreated: 'passed',
      workspaceMaterialized: 'passed',
      patchChecked: 'passed',
      patchApplied: 'passed',
      validationPassed: 'passed',
    });
    expect(fs.readFileSync(path.join(plan.workspacePath, 'scripts/pulse/owned.ts'), 'utf8')).toBe(
      'export const value = 1;\n',
    );
    expect(calls.map((call) => call.commandKind)).toEqual([
      'patch_check',
      'patch_apply',
      'validation',
    ]);
    expect(calls.every((call) => call.cwd === plan.workspacePath)).toBe(true);
  });

  it('blocks patches that would alter governance files before runner execution', async () => {
    const rootDir = makeTempRoot();
    writeFile(
      rootDir,
      '.pulse/governance.patch',
      [
        'diff --git a/AGENTS.md b/AGENTS.md',
        '--- a/AGENTS.md',
        '+++ b/AGENTS.md',
        '@@ -1 +1 @@',
        '-old',
        '+new',
      ].join('\n'),
    );
    const plan = buildRealSandboxPlan({
      rootDir,
      patchPath: '.pulse/governance.patch',
      commands: ['npx vitest run scripts/pulse/__tests__/real-sandbox-lifecycle.spec.ts'],
    });
    let runnerCalled = false;
    const result = await executeRealSandbox({
      plan,
      runner: () => {
        runnerCalled = true;
        return { exitCode: 0 };
      },
    });

    expect(plan.status).toBe('blocked');
    expect(plan.patch.status).toBe('blocked');
    expect(plan.blockedReasons.map((entry) => entry.code)).toEqual(['protected_path']);
    expect(result.evidenceStatus).toBe('blocked');
    expect(result.lifecycle.patchChecked).toBe('blocked');
    expect(runnerCalled).toBe(false);
  });
});
