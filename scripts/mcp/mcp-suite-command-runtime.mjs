import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

export function createCommandRuntime({ root, maxOutput }) {
  const ROOT = root;
  const MAX_OUTPUT = maxOutput;

  function runPackageCommand(pkg, script, timeoutMs, lintCheck = false) {
    if (pkg === 'all') {
      const rootScript = script === 'typecheck' ? 'typecheck' : 'lint';
      return runCommand(['npm', 'run', rootScript], { timeoutMs: timeoutMs || 180_000 });
    }
    const actualScript = lintCheck && pkg !== 'frontend' ? 'lint:check' : script;
    return runCommand(['npm', '--prefix', pkg, 'run', actualScript], {
      timeoutMs: timeoutMs || 120_000,
    });
  }

  function runCommand(command, { timeoutMs = 120_000, env = {} } = {}) {
    return new Promise((resolvePromise) => {
      let stdout = '';
      let stderr = '';
      const child = spawn(command[0], command.slice(1), {
        cwd: ROOT,
        env: { ...process.env, ...env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        resolvePromise({
          ok: false,
          timedOut: true,
          exitCode: null,
          command: command.join(' '),
          stdout: stdout.slice(-MAX_OUTPUT),
          stderr: stderr.slice(-MAX_OUTPUT),
        });
      }, timeoutMs);
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      child.on('error', (error) => {
        clearTimeout(timer);
        resolvePromise({
          ok: false,
          exitCode: -1,
          command: command.join(' '),
          stdout: stdout.slice(-MAX_OUTPUT),
          stderr: `${stderr}\n${error.message}`.slice(-MAX_OUTPUT),
        });
      });
      child.on('exit', (code) => {
        clearTimeout(timer);
        resolvePromise({
          ok: code === 0,
          exitCode: code,
          command: command.join(' '),
          stdout: stdout.slice(-MAX_OUTPUT),
          stderr: stderr.slice(-MAX_OUTPUT),
        });
      });
    });
  }

  function affectedTests(files) {
    const stems = files
      .map((file) =>
        file
          .split('/')
          .pop()
          ?.replace(/\.(tsx?|jsx?|mjs|cjs)$/, ''),
      )
      .filter(Boolean);
    const allFiles = walk(ROOT, 16_000).filter((file) => /\.(test|spec)\.(tsx?|jsx?)$/.test(file));
    const matches = allFiles.filter((file) => stems.some((stem) => file.includes(stem)));
    return { ok: true, files, tests: matches.slice(0, 200) };
  }

  function artifactDirs() {
    return [
      join(ROOT, 'pulse-out'),
      join(ROOT, '.pulse'),
      join(ROOT, 'artifacts/pulse'),
      join(ROOT, 'scripts/pulse/artifacts'),
    ];
  }

  function listPulseArtifacts() {
    const out = [];
    for (const dir of artifactDirs()) {
      if (!existsSync(dir)) continue;
      for (const file of walk(dir, 300)) out.push(file.replace(`${ROOT}/`, ''));
    }
    return out.sort();
  }

  function pulseArtifactSummary(kind) {
    const artifacts = listPulseArtifacts();
    const hints = artifacts.filter((file) => new RegExp(kind, 'i').test(file)).slice(0, 50);
    return {
      ok: true,
      kind,
      artifactCount: artifacts.length,
      hints,
      note: hints.length ? undefined : 'No matching artifact names found; run pulse_scan first.',
    };
  }

  function commandExists(command) {
    const result = spawnSync('sh', ['-lc', `command -v ${shellQuote(command)} >/dev/null 2>&1`], {
      stdio: 'ignore',
    });
    return result.status === 0;
  }

  function walk(start, maxFiles) {
    const out = [];
    const stack = [resolve(start)];
    while (stack.length && out.length < maxFiles) {
      const dir = stack.pop();
      let entries;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.next')
          continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else out.push(full);
        if (out.length >= maxFiles) break;
      }
    }
    return out;
  }

  function shellQuote(value) {
    return `'${String(value).replace(/'/g, `'\\''`)}'`;
  }

  return {
    runPackageCommand,
    runCommand,
    affectedTests,
    artifactDirs,
    listPulseArtifacts,
    pulseArtifactSummary,
    commandExists,
  };
}
