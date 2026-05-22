// Helpers extracted from hubs-generator for size budget
export function formatISO() {
  return new Date().toISOString();
}

export function writeAtomic(path, content) {
  const tmp = path + '.tmp';
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, path);
}

export function checkAutoGen(path) {
  if (!existsSync(path)) {return 'new';}
  const content = readFileSync(path, 'utf8');
  if (content.includes('<!-- AUTO-GENERATED')) {return 'overwrite';}
  return 'human';
}

export function escapeMdTable(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

export function loadJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    process.stderr.write(`hubs-generator: cannot read ${label} at ${path}: ${err.message}\n`);
    return null;
  }
}

// ─── Hub content generators ─────────────────────────────────────────────

