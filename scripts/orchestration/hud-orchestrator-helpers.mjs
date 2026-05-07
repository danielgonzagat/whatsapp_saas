// Helpers extracted from hud-orchestrator
export function hashSourceTree() {
  const hash = createHash('sha256');
  const files = [];
  const stack = [REPO_ROOT];

  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (!IGNORE_SEGMENTS.has(e.name)) {
          stack.push(p);
        }
        continue;
      }
      if (e.isFile()) {
        const ext = p.slice(p.lastIndexOf('.')).toLowerCase();
        if (WATCH_FILE_EXTENSIONS.has(ext)) {
          const rel = relative(REPO_ROOT, p);
          files.push(rel);
        }
      }
    }
  }

  files.sort();

  for (const rel of files) {
    const abs = join(REPO_ROOT, rel);
    try {
      const s = statSync(abs);
      hash.update(`${rel}:${s.mtimeMs}:${s.size}\n`);
    } catch {
      hash.update(`${rel}:missing\n`);
    }
  }

  return hash.digest('hex');
}

export function writePid() {
  writeFileSync(PID_FILE, String(process.pid), 'utf8');
}

export function removePid() {
  try {
    unlinkSync(PID_FILE);
  } catch {
    // ignore
  }
}

export function handleExit() {
  removePid();
}

