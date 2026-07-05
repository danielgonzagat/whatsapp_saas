import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFounderBlock } from "./founder.js";
import { buildTrace, levelFor, shapePayload } from "./trace.js";
import { check } from "./smoke-state.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function partG(): void {
  const fb = buildFounderBlock({
    file: 'backend/src/x.service.ts',
    operator: 'atomic_replace_literal',
    language: 'ts',
    syntaxBefore: 0,
    syntaxAfter: 0,
    changedChars: 4,
    expansionFactor: 1,
  });
  check(
    'founder: ts edit = structurally-validated',
    fb.promiseClass === 'structurally-validated',
    fb.promiseClass,
  );
  // honesty ceiling: a tool edit can NEVER claim behaviour proof → < 75
  check(
    'founder: zeroCodeTrust ceilinged < 75 (anti-fachada)',
    fb.zeroCodeTrust < 75 && fb.zeroCodeTrust > 0,
    String(fb.zeroCodeTrust),
  );
  check(
    'founder: notProven states behaviour unproven',
    /behaviou?r is NOT proven|NOT proven by this tool/i.test(fb.notProven),
    fb.notProven,
  );
  check(
    'founder: nonTouched does not claim protected status without governance gate',
    !/\bprotected files\b/i.test(fb.nonTouched) && /governance gate/i.test(fb.nonTouched),
    fb.nonTouched,
  );
  // structural-only language is honestly a weaker promise class
  const fbS = buildFounderBlock({
    file: 'main.py',
    operator: 'atomic_replace_range',
    language: 'structural',
    syntaxBefore: 0,
    syntaxAfter: 0,
    changedChars: 3,
    expansionFactor: 1,
  });
  check(
    'founder: structural lang = balance-validated',
    fbS.promiseClass === 'balance-validated' && fbS.zeroCodeTrust <= fb.zeroCodeTrust,
    JSON.stringify(fbS),
  );

  // founder block rides even at L0 (must never be trimmed away)
  const tr = buildTrace({
    file: 'a.ts',
    operator: 'atomic_replace_literal',
    before: 'const a=1;',
    newText: 'const a=2;',
    inlinePreview: 'const a=[-1-]{+2+};',
    validation: { language: 'ts', before: 0, after: 0 },
    metrics: { changedChars: 1, lineRewriteSurfaceChars: 1, expansionFactorAvoided: 1 },
  });
  const l0 = shapePayload(levelFor(false, 'L0'), { ok: true }, { inlinePreview: 'x', trace: tr });
  check(
    'founder: present at L0 (not trimmed)',
    typeof l0.founder === 'object' &&
      (l0.founder as { promiseClass?: string }).promiseClass === 'structurally-validated' &&
      l0.atomicDiff === undefined, // L0 still trims the diff, but NOT founder
    JSON.stringify(Object.keys(l0)),
  );

  const traceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-trace-root-'));
  try {
    const worktreeTrace = buildTrace({
      file: 'worker/example.ts',
      repoRoot: traceRoot,
      operator: 'atomic_replace_text',
      before: 'const a=1;',
      newText: 'const a=2;',
      inlinePreview: 'const a=[-1-]{+2+};',
      validation: { language: 'ts', before: 0, after: 0 },
      metrics: { changedChars: 1, lineRewriteSurfaceChars: 1, expansionFactorAvoided: 1 },
    });
    const shaped = shapePayload(
      levelFor(false, 'L0'),
      { ok: true },
      { inlinePreview: 'x', trace: worktreeTrace },
    );
    const tracePath = typeof shaped.tracePath === 'string' ? shaped.tracePath : '';
    check(
      'trace: writes under selected repo root',
      tracePath.startsWith('.atomic/traces/') && fs.existsSync(path.join(traceRoot, tracePath)),
      JSON.stringify(shaped),
    );
  } finally {
    fs.rmSync(traceRoot, { recursive: true, force: true });
  }
}

// ── Part H — worker-scope-check CLI ───────────────────────────────────────
export function partH(): void {
  process.stdout.write('Part H — worker-scope-check CLI\n');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wsc-smoke-'));
  const wsc = path.join(__dirname, 'worker-scope-check.mjs');

  function runWsc(repoPath: string, extraArgs: string[]) {
    return childProcess.spawnSync(process.execPath, [wsc, '--repo', repoPath, ...extraArgs], {
      cwd: repoPath,
      encoding: 'utf8',
    });
  }

  try {
    childProcess.execFileSync('git', ['init'], { cwd: tempDir, stdio: 'ignore' });
    childProcess.execFileSync('git', ['config', 'user.email', 'smoke@test.com'], {
      cwd: tempDir,
      stdio: 'ignore',
    });
    childProcess.execFileSync('git', ['config', 'user.name', 'Smoke Test'], {
      cwd: tempDir,
      stdio: 'ignore',
    });

    fs.writeFileSync(path.join(tempDir, 'a.ts'), 'export const A = 1;\n');
    fs.writeFileSync(path.join(tempDir, 'b.ts'), 'export const B = 2;\n');
    fs.writeFileSync(path.join(tempDir, 'c.ts'), 'export const C = 3;\n');
    fs.mkdirSync(path.join(tempDir, 'sub'));
    fs.writeFileSync(path.join(tempDir, 'sub', 'd.ts'), 'export const D = 4;\n');

    childProcess.execFileSync('git', ['add', 'a.ts', 'b.ts'], { cwd: tempDir, stdio: 'ignore' });
    childProcess.execFileSync('git', ['commit', '-m', 'initial'], {
      cwd: tempDir,
      stdio: 'ignore',
    });

    fs.writeFileSync(path.join(tempDir, 'a.ts'), 'export const A = 99;\n');
    childProcess.execFileSync('git', ['add', 'c.ts'], { cwd: tempDir, stdio: 'ignore' });

    // Test 1: all changed files within precise allowlist → exit 0
    {
      const r = runWsc(tempDir, ['--allow', 'a.ts', '--allow', 'c.ts', '--allow', 'sub/d.ts']);
      check(
        'wsc: all files allowed exits 0',
        r.status === 0 && r.stdout.includes('\u2713 All changed files within allowlist'),
        `exit=${r.status} stdout=${r.stdout.substring(0, 200)}`,
      );
      check('wsc: marks allowed files with check', r.stdout.includes('\u2713 a.ts'), r.stdout);
    }

    // Test 2: file outside allowlist → exit 1
    {
      const r = runWsc(tempDir, ['--allow', 'c.ts']);
      check(
        'wsc: outsider detected exits 1',
        r.status === 1 && r.stdout.includes('VIOLATIONS'),
        `exit=${r.status} stdout=${r.stdout.substring(0, 200)}`,
      );
      check('wsc: marks violating file with cross', r.stdout.includes('\u2717 a.ts'), r.stdout);
    }

    // Test 3: required file present → exit 0
    {
      const r = runWsc(tempDir, [
        '--allow',
        'a.ts',
        '--allow',
        'c.ts',
        '--allow',
        'sub',
        '--require',
        'a.ts',
      ]);
      check(
        'wsc: required file present exits 0',
        r.status === 0,
        `exit=${r.status} stderr=${r.stderr}`,
      );
    }

    // Test 4: required file missing → exit 1
    {
      const r = runWsc(tempDir, ['--allow', 'a.ts', '--require', 'nonexistent.ts']);
      check(
        'wsc: missing required exits 1',
        r.status === 1 && r.stdout.includes('MISSING REQUIRED'),
        `exit=${r.status} stdout=${r.stdout.substring(0, 200)}`,
      );
      check('wsc: missing required names the file', r.stdout.includes('nonexistent.ts'), r.stdout);
    }

    // Test 5: --json output
    {
      const r = runWsc(tempDir, ['--allow', 'a.ts', '--allow', 'c.ts', '--allow', 'sub', '--json']);
      check('wsc: --json exits 0 when ok', r.status === 0, `exit=${r.status}`);
      let parsed = null;
      try {
        parsed = JSON.parse(r.stdout.trim());
      } catch {
        // fail below
      }
      check(
        'wsc: --json produces valid JSON',
        parsed !== null && typeof parsed.ok === 'boolean',
        r.stdout.substring(0, 200),
      );
      check('wsc: --json has changedFiles array', Array.isArray(parsed?.changedFiles), r.stdout);
      check('wsc: --json has violations array', Array.isArray(parsed?.violations), r.stdout);
      check(
        'wsc: --json has missingRequired array',
        Array.isArray(parsed?.missingRequired),
        r.stdout,
      );
    }

    // Test 5b: --json with violations → exit 1, violations filled
    {
      const r = runWsc(tempDir, ['--allow', 'b.ts', '--json']);
      check('wsc: --json with violations exits 1', r.status === 1, `exit=${r.status}`);
      const parsed = JSON.parse(r.stdout.trim());
      check('wsc: --json ok=false on violations', parsed.ok === false, r.stdout);
      check('wsc: --json violations lists outsiders', parsed.violations.length > 0, r.stdout);
    }

    // Test 6: directory-level allow path covers child files
    {
      const r = runWsc(tempDir, ['--allow', 'a.ts', '--allow', 'c.ts', '--allow', 'sub']);
      check(
        'wsc: dir allow covers child files',
        r.status === 0,
        `exit=${r.status} stdout=${r.stdout.substring(0, 200)}`,
      );
    }

    // Test 7: --allow . allows everything
    {
      const r = runWsc(tempDir, ['--allow', '.']);
      check(
        'wsc: --allow . permits all files',
        r.status === 0,
        `exit=${r.status} stdout=${r.stdout.substring(0, 200)}`,
      );
    }

    // Test 7b: .atomic traces are generated proof artifacts, not source-scope violations
    {
      fs.mkdirSync(path.join(tempDir, '.atomic', 'traces'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, '.atomic', 'traces', 'trace.json'), '{}\n');
      const r = runWsc(tempDir, ['--allow', 'a.ts', '--allow', 'c.ts', '--allow', 'sub', '--json']);
      const parsed = JSON.parse(r.stdout.trim());
      check(
        'wsc: ignores .atomic proof traces',
        r.status === 0 && !parsed.changedFiles.some((f: string) => f.startsWith('.atomic')),
        r.stdout,
      );
    }

    // Test 8: no --allow flag (empty allowlist) → everything allowed
    {
      const r = runWsc(tempDir, []);
      check(
        'wsc: empty allowlist allows all',
        r.status === 0,
        `exit=${r.status} stdout=${r.stdout.substring(0, 200)}`,
      );
    }

    // Test 9: absolute --allow path rejected
    {
      const r = runWsc(tempDir, ['--allow', '/absolute/path.ts']);
      check(
        'wsc: absolute --allow rejected',
        r.status === 2 && r.stderr.includes('absolute'),
        `exit=${r.status} stderr=${r.stderr}`,
      );
    }

    // Test 10: relative path that escapes repo rejected
    {
      const r = runWsc(tempDir, ['--allow', '../outside.ts']);
      check(
        'wsc: outside-repo path rejected',
        r.status === 2,
        `exit=${r.status} stderr=${r.stderr}`,
      );
    }

    // Test 11: multiple --allow and --require flags work together
    {
      const r = runWsc(tempDir, [
        '--allow',
        'a.ts',
        '--allow',
        'c.ts',
        '--allow',
        'sub/d.ts',
        '--require',
        'a.ts',
        '--json',
      ]);
      check(
        'wsc: multi-flag combo exits 0',
        r.status === 0,
        `exit=${r.status} stdout=${r.stdout.substring(0, 200)}`,
      );
    }

    // Test 12: --repo flag targets the right directory
    {
      const r = runWsc(tempDir, ['--allow', 'a.ts', '--allow', 'c.ts', '--allow', 'sub']);
      check('wsc: --repo flag resolves cwd correctly', r.status === 0, `exit=${r.status}`);
    }

    // Test 13: CLI is truly read-only — repo untouched
    {
      const before = childProcess
        .execFileSync('git', ['status', '--porcelain=v1'], {
          cwd: tempDir,
          encoding: 'utf8',
        })
        .trim();
      runWsc(tempDir, ['--allow', 'a.ts']);
      runWsc(tempDir, ['--allow', 'nonexistent.ts', '--json']);
      const after = childProcess
        .execFileSync('git', ['status', '--porcelain=v1'], {
          cwd: tempDir,
          encoding: 'utf8',
        })
        .trim();
      check(
        'wsc: repo unchanged after invocations (read-only)',
        before === after,
        `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`,
      );
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
