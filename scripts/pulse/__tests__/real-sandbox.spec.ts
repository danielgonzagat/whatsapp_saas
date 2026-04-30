import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { evaluateExecutorCycleMateriality } from '../autonomous-executor-policy';
import {
  buildRealSandboxPlan,
  executeRealSandbox,
  type ProcessRunner,
  type RealSandboxExecutionResult,
} from '../real-sandbox';

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-real-sandbox-'));
  tempRoots.push(rootDir);
  return rootDir;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const rootDir = tempRoots.pop();
    if (rootDir) {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  }
});

describe('real sandbox planner/executor', () => {
  it('creates an isolated workspace path plan and executes validation commands through an injected runner', async () => {
    const rootDir = makeTempRoot();
    const calls: Array<{ command: string; cwd: string }> = [];
    const runner: ProcessRunner = (command, options) => {
      calls.push({ command, cwd: options.cwd });
      return { exitCode: 0, stdout: 'ok' };
    };
    const plan = buildRealSandboxPlan({
      rootDir,
      touchedPaths: ['scripts/pulse/real-sandbox.ts'],
      commands: ['npx vitest run scripts/pulse/__tests__/real-sandbox.spec.ts'],
      workspaceId: 'worker-a',
      generatedAt: '2026-04-29T20:00:00.000Z',
    });

    const result = await executeRealSandbox({ plan, runner });

    expect(plan.status).toBe('ready');
    expect(plan.workspacePath).toBe(path.join(rootDir, '.pulse/real-sandboxes/worker-a'));
    expect(plan.isolatedWorkspacePathPlan).toEqual({
      strategy: 'directory_workspace',
      sourceRoot: rootDir,
      workspacePath: plan.workspacePath,
    });
    expect(result).toEqual(
      expect.objectContaining({
        executed: true,
        isolatedWorktree: true,
        workspacePath: plan.workspacePath,
        exitCode: 0,
        planStatus: 'ready',
      }),
    );
    expect(fs.existsSync(plan.workspacePath)).toBe(true);
    expect(calls).toEqual([
      {
        command: 'npx vitest run scripts/pulse/__tests__/real-sandbox.spec.ts',
        cwd: plan.workspacePath,
      },
    ]);
  });

  it('returns a sandbox result accepted by autonomous executor policy when paired with validation and metric evidence', async () => {
    const rootDir = makeTempRoot();
    const plan = buildRealSandboxPlan({
      rootDir,
      touchedPaths: ['scripts/pulse/real-sandbox.ts'],
      commands: ['npm run pulse:test-parsers'],
    });
    const result: RealSandboxExecutionResult = await executeRealSandbox({
      plan,
      runner: () => ({ exitCode: 0 }),
    });
    const decision = evaluateExecutorCycleMateriality({
      daemonMode: 'executor',
      sandboxResult: result,
      validationResult: {
        executed: true,
        passed: true,
        commands: result.commands.map((entry) => ({
          command: entry.command,
          exitCode: entry.exitCode ?? 1,
        })),
      },
      beforeAfterMetric: {
        name: 'criticalUnobservedPaths',
        before: 10,
        after: 9,
        improved: true,
      },
    });

    expect(result.executed).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(decision.acceptedMaterial).toBe(true);
    expect(decision.status).toBe('accepted_material');
  });

  it('blocks protected governance paths before the injected runner is called', async () => {
    const rootDir = makeTempRoot();
    const plan = buildRealSandboxPlan({
      rootDir,
      touchedPaths: [
        'ops/protected-governance-files.json',
        'scripts/ops/check-governance-boundary.mjs',
      ],
      commands: ['npx vitest run scripts/pulse/__tests__/real-sandbox.spec.ts'],
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
    expect(plan.blockedReasons.map((entry) => entry.code)).toEqual([
      'protected_path',
      'protected_path',
    ]);
    expect(result.executed).toBe(false);
    expect(result.exitCode).toBeNull();
    expect(runnerCalled).toBe(false);
  });

  it('loads protected path rules from the sandbox root when available', () => {
    const rootDir = makeTempRoot();
    fs.mkdirSync(path.join(rootDir, 'ops'), { recursive: true });
    fs.writeFileSync(
      path.join(rootDir, 'ops/protected-governance-files.json'),
      JSON.stringify({
        protectedExact: ['CUSTOM_LOCK.md'],
        protectedPrefixes: ['custom-governance/'],
      }),
    );

    const plan = buildRealSandboxPlan({
      rootDir,
      touchedPaths: ['CUSTOM_LOCK.md', 'custom-governance/rule.json'],
      commands: ['git status --short'],
    });

    expect(plan.status).toBe('blocked');
    expect(plan.blockedReasons.map((entry) => entry.target)).toEqual([
      'CUSTOM_LOCK.md',
      'custom-governance/rule.json',
    ]);
  });

  it('blocks env files, migration paths, and paths outside the repository root', () => {
    const rootDir = makeTempRoot();
    const plan = buildRealSandboxPlan({
      rootDir,
      touchedPaths: [
        '.env.local',
        'backend/prisma/migrations/20260429_init/migration.sql',
        '../outside.ts',
      ],
      commands: ['git status --short'],
    });

    expect(plan.status).toBe('blocked');
    expect(plan.blockedReasons.map((entry) => entry.code)).toEqual([
      'secret_path',
      'migration_path',
      'path_outside_root',
    ]);
  });

  it('blocks destructive and unapproved commands before execution', async () => {
    const rootDir = makeTempRoot();
    const plan = buildRealSandboxPlan({
      rootDir,
      touchedPaths: ['scripts/pulse/real-sandbox.ts'],
      commands: [
        'git restore scripts/pulse/real-sandbox.ts',
        'npx prisma migrate deploy',
        'rm -rf .pulse/real-sandboxes',
        'curl https://example.invalid',
      ],
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
    expect(plan.blockedReasons.map((entry) => entry.code)).toEqual([
      'destructive_command',
      'destructive_command',
      'destructive_command',
      'unapproved_command',
    ]);
    expect(result.executed).toBe(false);
    expect(runnerCalled).toBe(false);
  });

  it('stops on the first non-zero runner result and reports the failing exit code', async () => {
    const rootDir = makeTempRoot();
    const plan = buildRealSandboxPlan({
      rootDir,
      touchedPaths: ['scripts/pulse/real-sandbox.ts'],
      commands: [
        'git status --short',
        'npx vitest run scripts/pulse/__tests__/real-sandbox.spec.ts',
      ],
    });
    const runner: ProcessRunner = (command) => ({
      exitCode: command.startsWith('git status') ? 0 : 1,
    });
    const result = await executeRealSandbox({ plan, runner });

    expect(result.executed).toBe(true);
    expect(result.exitCode).toBe(1);
    expect(result.commands).toHaveLength(2);
    expect(result.summary).toContain('Sandbox command failed');
  });
});
