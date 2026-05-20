// Helpers extracted from hud-audit.mjs for architecture-guard line budget.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import { REPO_ROOT, SOURCE_DIR } from './hud-audit.constants.mjs';

export function checkFile(label, filePath) {
  const pass = existsSync(filePath);
  return {
    label,
    pass,
    detail: pass
      ? `${relative(REPO_ROOT, filePath)} exists`
      : `${relative(REPO_ROOT, filePath)} missing`,
  };
}

export function walkFiles(root) {
  const files = [];
  if (!existsSync(root)) return files;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        stack.push(full);
      } else if (e.isFile()) {
        files.push(full);
      }
    }
  }
  return files;
}

export function countSidecars(ext) {
  let count = 0;
  const suffix = `.${ext}.json`;
  if (!existsSync(SOURCE_DIR)) return 0;
  const stack = [SOURCE_DIR];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        stack.push(full);
      } else if (e.isFile() && e.name.endsWith(suffix)) {
        count++;
      }
    }
  }
  return count;
}

export function grepTagCount(root, tagPrefix) {
  try {
    const result = execSync(`rg -l --no-heading '${tagPrefix}' .`, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
      timeout: 30000,
    });
    return result.trim().split('\n').filter(Boolean).length;
  } catch (e) {
    if (e.status === 1) return 0; // no matches
    return -1; // error
  }
}

export function checkJsonFile(label, filePath, expectedSchema) {
  if (!existsSync(filePath)) {
    return { label, pass: false, detail: `${relative(MIRROR_ROOT, filePath)} missing` };
  }
  try {
    const content = readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(content);
    if (parsed.schema !== expectedSchema) {
      return {
        label,
        pass: false,
        detail: `invalid schema: got "${parsed.schema}", expected "${expectedSchema}"`,
      };
    }
    return { label, pass: true, detail: `valid ${expectedSchema}` };
  } catch (e) {
    return { label, pass: false, detail: `parse error: ${e.message.slice(0, 80)}` };
  }
}

export function runCmd(label, cmd, cwd, timeoutMs = 30000) {
  try {
    const result = execSync(cmd, {
      cwd,
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 50 * 1024 * 1024,
    });
    return { label, pass: true, detail: 'exit 0', output: result };
  } catch (e) {
    const stderr = e.stderr || '';
    return {
      label,
      pass: false,
      detail: `exit ${e.status || '?'}: ${stderr.slice(0, 120)}`,
      output: e.stdout || '',
    };
  }
}

export function parseLastJsonObject(output) {
  const lines = output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  for (let idx = lines.length - 1; idx >= 0; idx--) {
    try {
      return JSON.parse(lines[idx]);
    } catch {
      // keep scanning for the summary line
    }
  }
  return null;
}

export function runDryEmitterSummary(scriptName) {
  const scriptPath = join(ORCHESTRATION_DIR, scriptName);
  if (!existsSync(scriptPath)) {
    return { ok: false, detail: `${scriptName} missing` };
  }
  const result = spawnSync('node', [scriptPath, '--dry'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 50 * 1024 * 1024,
    stdio: 'pipe',
  });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  if (result.status !== 0) {
    return { ok: false, detail: `${scriptName} --dry exit ${result.status}` };
  }
  const summary = parseLastJsonObject(output);
  if (!summary) {
    return { ok: false, detail: `${scriptName} --dry produced no JSON summary` };
  }
  return { ok: true, summary };
}

export function runCmdStderr(label, cmd, cwd, timeoutMs = 30000) {
  try {
    const result = execSync(cmd, {
      cwd,
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 50 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stderrResult = result.toString();
    // For extend-graph-lens --dry, it outputs JSON to stdout and stderr
    // We need to check stderr for kloel_added line
    // Actually execSync returns stdout as string, stderr goes to process.stderr
    // Let's capture both via stdio pipe
    return null; // placeholder, will handle differently
  } catch (e) {
    return null;
  }
}

export function checkExistsWithReason(label, filePath) {
  if (!existsSync(filePath)) {
    return { label, pass: false, detail: `${relative(REPO_ROOT, filePath)} missing` };
  }
  return { label, pass: true, detail: `${relative(REPO_ROOT, filePath)} exists` };
}

export function checkPending(label, reason) {
  return { label, pass: false, pending: true, detail: reason };
}

// ──────────────────────────────────────────────────────────────────────────────
// ORPHAN DETECTION & CLEANUP
// ──────────────────────────────────────────────────────────────────────────────

