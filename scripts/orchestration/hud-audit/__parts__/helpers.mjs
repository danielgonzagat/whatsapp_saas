import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { relative, join } from 'node:path';
import { execSync } from 'node:child_process';
import { REPO_ROOT, MIRROR_ROOT, SOURCE_DIR } from './constants.mjs';

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
    if (e.status === 1) return 0;
    return -1;
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

export function runCmdStderr(_label, cmd, cwd, timeoutMs = 30000) {
  try {
    execSync(cmd, {
      cwd,
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 50 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return null;
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
