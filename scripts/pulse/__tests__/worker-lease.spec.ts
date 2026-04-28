import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  applyWorkerPatchToRoot,
  validateChangedFilesAgainstLease,
  type PulseWorkerLeaseValidationInput,
} from '../autonomy-loop.workspace';
import { getContextFabricBlocker } from '../autonomy-loop.parallel';

function makeGitRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-lease-'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'PULSE Test'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'pulse-test@local'], { cwd: root });
  fs.mkdirSync(path.join(root, 'scripts', 'pulse'), { recursive: true });
  fs.writeFileSync(path.join(root, 'scripts', 'pulse', 'owned.ts'), 'export const value = 1;\n');
  fs.writeFileSync(path.join(root, 'scripts', 'pulse', 'other.ts'), 'export const other = 1;\n');
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# protected\n');
  execFileSync('git', ['add', '-A'], { cwd: root });
  execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'baseline'], {
    cwd: root,
  });
  return root;
}

function makePatch(root: string, relativePath: string, nextContent: string): string {
  fs.writeFileSync(path.join(root, relativePath), nextContent);
  const patch = execFileSync('git', ['diff', '--binary', 'HEAD', '--'], {
    cwd: root,
    encoding: 'utf8',
  });
  execFileSync('git', ['checkout', '--', relativePath], { cwd: root });
  const patchPath = path.join(root, `${relativePath.replace(/\W+/g, '-')}.patch`);
  fs.writeFileSync(patchPath, patch);
  return patchPath;
}

function futureLease(overrides: Partial<PulseWorkerLeaseValidationInput> = {}): PulseWorkerLeaseValidationInput {
  return {
    leaseId: 'lease-test',
    leaseStatus: 'active',
    leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    ownedFiles: ['scripts/pulse/owned.ts'],
    forbiddenFiles: ['AGENTS.md', 'ops/', 'scripts/ops/'],
    ...overrides,
  };
}

describe('PULSE worker lease enforcement', () => {
  it('blocks worker batches with stale context digests', () => {
    const blocker = getContextFabricBlocker(
      {
        generatedAt: new Date().toISOString(),
        autonomyVerdict: 'SIM',
        nextExecutableUnits: [],
        nextAutonomousUnits: [],
        contextFabric: {
          contextDigest: 'digest-current',
          contextBroadcastPass: true,
          ownershipConflictPass: true,
          protectedFilesForbiddenPass: true,
          workerContextCompletenessPass: true,
          staleContextBlocksExecution: false,
          blockers: [],
        },
      },
      [{ leaseId: 'lease-1', contextDigest: 'digest-old' }],
    );

    expect(blocker).toContain('fresh contextDigest');
  });

  it('rejects expired leases before patch application', () => {
    const violation = validateChangedFilesAgainstLease(['scripts/pulse/owned.ts'], {
      ...futureLease(),
      leaseExpiresAt: new Date(Date.now() - 60_000).toISOString(),
    });

    expect(violation).toContain('expired');
  });

  it('rejects patches outside ownedFiles', () => {
    const root = makeGitRoot();
    const patchPath = makePatch(root, 'scripts/pulse/other.ts', 'export const other = 2;\n');

    const result = applyWorkerPatchToRoot(root, patchPath, 'worker-1', futureLease());

    expect(result.status).toBe('failed');
    expect(result.summary).toContain('outside ownedFiles');
    expect(fs.readFileSync(path.join(root, 'scripts', 'pulse', 'other.ts'), 'utf8')).toContain(
      'other = 1',
    );
  });

  it('rejects patches touching forbiddenFiles', () => {
    const root = makeGitRoot();
    const patchPath = makePatch(root, 'AGENTS.md', '# protected changed\n');

    const result = applyWorkerPatchToRoot(root, patchPath, 'worker-1', futureLease());

    expect(result.status).toBe('failed');
    expect(result.summary).toContain('forbidden');
    expect(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8')).toBe('# protected\n');
  });

  it('normalizes root-absolute ownedFiles and rejects invalid lease ownership', () => {
    const root = makeGitRoot();
    const valid = validateChangedFilesAgainstLease(
      ['scripts/pulse/owned.ts'],
      futureLease({ ownedFiles: [path.join(root, 'scripts', 'pulse', 'owned.ts')] }),
      root,
    );
    const outside = validateChangedFilesAgainstLease(
      ['scripts/pulse/owned.ts'],
      futureLease({ ownedFiles: ['/tmp/outside.ts'] }),
      root,
    );
    const protectedOwned = validateChangedFilesAgainstLease(
      ['AGENTS.md'],
      futureLease({ ownedFiles: [path.join(root, 'AGENTS.md')] }),
      root,
    );

    expect(valid).toBeNull();
    expect(outside).toContain('invalid ownedFiles');
    expect(protectedOwned).toContain('forbidden');
  });

  it('strips duplicate suffixes in ownedFiles before validating changes', () => {
    const violation = validateChangedFilesAgainstLease(
      ['scripts/pulse/owned.ts'],
      futureLease({ ownedFiles: ['scripts/pulse/owned.ts (3)'] }),
    );

    expect(violation).toBeNull();
  });

  it('applies patches that stay within an active lease', () => {
    const root = makeGitRoot();
    const patchPath = makePatch(root, 'scripts/pulse/owned.ts', 'export const value = 2;\n');

    const result = applyWorkerPatchToRoot(root, patchPath, 'worker-1', futureLease());

    expect(result.status).toBe('applied');
    expect(fs.readFileSync(path.join(root, 'scripts', 'pulse', 'owned.ts'), 'utf8')).toContain(
      'value = 2',
    );
  });
});
