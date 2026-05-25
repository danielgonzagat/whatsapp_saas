// Tiny ripgrep wrapper — JSON streamed output, capped buffers.

import { spawnSync } from 'node:child_process';

const DEFAULT_GLOBS = [
  '!**/node_modules/**',
  '!**/dist/**',
  '!**/.next/**',
  '!**/build/**',
  '!**/.git/**',
];

export function rg(pattern, { cwd, paths = [], globs = [], pcre2 = true, maxCount = 200 } = {}) {
  const args = ['--json', '-S', '-uu', '-n'];
  if (pcre2) args.push('--pcre2');
  if (maxCount) args.push('-m', String(maxCount));
  for (const g of [...DEFAULT_GLOBS, ...globs]) args.push('-g', g);
  args.push('-e', pattern);
  if (paths.length) args.push(...paths);
  const res = spawnSync('rg', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const stdout = res.stdout || '';
  const matches = [];
  for (const line of stdout.split('\n')) {
    if (!line) continue;
    try {
      const evt = JSON.parse(line);
      if (evt.type === 'match' && evt.data) {
        const d = evt.data;
        matches.push({
          file: d.path.text,
          line: d.line_number,
          text: (d.lines?.text || '').trimEnd(),
          submatches: (d.submatches || []).map((s) => ({ start: s.start, end: s.end, text: s.match.text })),
        });
      }
    } catch {
      // ignore non-JSON lines (rg sometimes emits begin/end summaries)
    }
  }
  return { ok: res.status === 0 || res.status === 1, matches };
}

export function rgFiles(pattern, { cwd, paths = [], globs = [] } = {}) {
  const args = ['-l', '-uu', '-S'];
  for (const g of [...DEFAULT_GLOBS, ...globs]) args.push('-g', g);
  args.push('-e', pattern);
  if (paths.length) args.push(...paths);
  const res = spawnSync('rg', args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const files = (res.stdout || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return { ok: res.status === 0 || res.status === 1, files };
}
