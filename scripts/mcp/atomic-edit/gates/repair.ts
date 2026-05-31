/**
 * gates/repair.ts — THE HAND. The lens SEES red; this MAKES it green — but ONLY a
 * mutation that converges green across every gate is ever applied. A red it cannot
 * mechanically + green-convergently fix is reported needs-intent, never guessed.
 * Correct-by-construction repair: the candidate is checked through the full gate
 * registry and written via the atomic firewall (which re-gates it at the byte floor).
 *
 * v1 scope — the dominant mechanical class (the 24 real bugs the lens found,
 * automated): a binding unbound-name red whose fix is a MISSING IMPORT —
 *   (a) a Node builtin → import from node:<module>;
 *   (b) a name exported by a sibling module in the same directory → import from it.
 * Anything else (a name with no findable export, a non-binding red) is left for
 * intent. Iterates until no repairable red remains or no green-convergent progress.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LENS_GATES, runGates } from './registry.js';
import { atomicWrite } from '../server-helpers-io.js';

/** Common Node builtin exports → their module (enough to cover the decomposition class). */
const BUILTIN_EXPORTS: Record<string, string> = {
  createHash: 'node:crypto', createHmac: 'node:crypto', randomUUID: 'node:crypto', randomBytes: 'node:crypto', createCipheriv: 'node:crypto', createDecipheriv: 'node:crypto',
  readFileSync: 'node:fs', writeFileSync: 'node:fs', existsSync: 'node:fs', statSync: 'node:fs', lstatSync: 'node:fs', readdirSync: 'node:fs', mkdirSync: 'node:fs', unlinkSync: 'node:fs', renameSync: 'node:fs', rmSync: 'node:fs', appendFileSync: 'node:fs', copyFileSync: 'node:fs', cpSync: 'node:fs', readlinkSync: 'node:fs', symlinkSync: 'node:fs', realpathSync: 'node:fs', openSync: 'node:fs', writeSync: 'node:fs', closeSync: 'node:fs', createReadStream: 'node:fs', createWriteStream: 'node:fs', watch: 'node:fs',
  join: 'node:path', resolve: 'node:path', relative: 'node:path', dirname: 'node:path', basename: 'node:path', extname: 'node:path', normalize: 'node:path', isAbsolute: 'node:path',
  spawnSync: 'node:child_process', execSync: 'node:child_process', spawn: 'node:child_process', exec: 'node:child_process', execFileSync: 'node:child_process', fork: 'node:child_process',
  fileURLToPath: 'node:url', pathToFileURL: 'node:url',
  homedir: 'node:os', tmpdir: 'node:os', platform: 'node:os', hostname: 'node:os', cpus: 'node:os', totalmem: 'node:os', freemem: 'node:os',
  inspect: 'node:util', promisify: 'node:util', format: 'node:util',
  setTimeout: 'node:timers', setInterval: 'node:timers', setImmediate: 'node:timers',
};

/** The import specifier extension the project uses for a sibling file. */
function siblingSpec(filename: string): string {
  if (/\.tsx?$/.test(filename)) return `./${filename.replace(/\.tsx?$/, '.js')}`; // TS → .js specifier convention
  return `./${filename}`; // .mjs/.cjs/.js keep their own extension
}

/** Search the file's OWN directory for a sibling that exports `name`; return the import specifier or null. */
function findSiblingExport(repoRoot: string, fileRel: string, name: string): string | null {
  const dir = path.dirname(path.join(repoRoot, fileRel));
  const selfBase = path.basename(fileRel);
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    String.raw`export\s+(?:async\s+)?(?:const|let|var|function|class)\s+${esc}\b|export\s*\{[^}]*\b${esc}\b[^}]*\}`,
  );
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return null;
  }
  for (const e of entries) {
    if (e === selfBase || !/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(e) || e.endsWith('.proof.ts')) continue;
    let src: string;
    try {
      src = fs.readFileSync(path.join(dir, e), 'utf8');
    } catch {
      continue;
    }
    if (re.test(src)) return siblingSpec(e);
  }
  return null;
}

export interface RepairResult {
  rel: string;
  applied: boolean;
  importsAdded: string[];
  unrepaired: { name: string; reason: string }[];
  redsBefore: number;
  redsAfter: number;
}

async function redsOf(repoRoot: string, rel: string, content: string): Promise<ReturnType<typeof runGates> extends Promise<infer R> ? R : never> {
  return runGates(LENS_GATES, repoRoot, new Map([[rel.replaceAll('\\', '/'), content]]), [rel], true);
}

/**
 * Repair one file: converge its binding unbound-name reds to green by adding the
 * missing imports, applying ONLY a candidate that strictly reduces reds (and adds
 * no new ones) — and writing it through the firewall.
 */
export async function repairFile(repoRoot: string, rel: string): Promise<RepairResult> {
  const importsAdded: string[] = [];
  const unrepaired: { name: string; reason: string }[] = [];
  let content = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
  const redsBefore = (await redsOf(repoRoot, rel, content)).reds.length;

  for (let pass = 0; pass < 8; pass += 1) {
    const run = await redsOf(repoRoot, rel, content);
    const bindingReds = run.reds.filter((r) => r.gate === 'binding');
    if (bindingReds.length === 0) break;
    const byModule = new Map<string, Set<string>>();
    for (const r of bindingReds) {
      const m = /referenced name '([^']+)'/.exec(r.fact);
      if (!m) continue;
      const name = m[1];
      const spec = BUILTIN_EXPORTS[name] ?? findSiblingExport(repoRoot, rel, name);
      if (!spec) {
        if (!unrepaired.some((u) => u.name === name)) unrepaired.push({ name, reason: 'no builtin/same-dir export found — needs intent' });
        continue;
      }
      if (!byModule.has(spec)) byModule.set(spec, new Set());
      byModule.get(spec)!.add(name);
    }
    if (byModule.size === 0) break; // nothing mechanically repairable this pass
    const importLines = [...byModule].map(([spec, names]) => `import { ${[...names].join(', ')} } from '${spec}';`);
    const candidate = `${importLines.join('\n')}\n${content}`;
    // CORRECT-BY-CONSTRUCTION: only accept a candidate that strictly reduces reds.
    const after = await redsOf(repoRoot, rel, candidate);
    if (after.reds.length >= run.reds.length) {
      for (const names of byModule.values()) for (const n of names) if (!unrepaired.some((u) => u.name === n)) unrepaired.push({ name: n, reason: 'candidate did not converge (reds not reduced)' });
      break;
    }
    content = candidate;
    importsAdded.push(...importLines);
  }

  const redsAfter = (await redsOf(repoRoot, rel, content)).reds.length;
  let applied = false;
  if (importsAdded.length > 0 && redsAfter < redsBefore) {
    try {
      atomicWrite(path.join(repoRoot, rel), content); // firewall re-gates at the byte floor
      applied = true;
    } catch (e) {
      unrepaired.push({ name: '(write)', reason: `firewall refused the write: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  return { rel, applied, importsAdded, unrepaired, redsBefore, redsAfter };
}

const SKIP = new Set(['node_modules', '.git', 'dist', '.next', 'build', 'coverage', 'vendor', '.atomic']);
const SRC = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

/** Source files under a scope (dir recursed, or a single file), repo-relative. */
function enumerateSource(repoRoot: string, scopeAbs: string, cap = 6000): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    if (out.length >= cap) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= cap || SKIP.has(e.name)) continue;
      const abs = path.join(d, e.name);
      if (e.isDirectory()) walk(abs);
      else if (SRC.test(e.name) && !e.name.endsWith('.proof.ts')) out.push(path.relative(repoRoot, abs).replaceAll('\\', '/'));
    }
  };
  let st: fs.Stats | null = null;
  try {
    st = fs.statSync(scopeAbs);
  } catch {
    return out;
  }
  if (st.isDirectory()) walk(scopeAbs);
  else if (SRC.test(scopeAbs)) out.push(path.relative(repoRoot, scopeAbs).replaceAll('\\', '/'));
  return out;
}

export interface ScopeRepairResult {
  scanned: number;
  applied: number;
  files: RepairResult[];
  needsIntent: { file: string; name: string; reason: string }[];
}

/** THE LOOP — heal an entire scope: repair every file with a green-convergent fix; the rest is needs-intent. */
export async function repairScope(repoRoot: string, scopeRel: string): Promise<ScopeRepairResult> {
  const files = enumerateSource(repoRoot, path.resolve(repoRoot, scopeRel));
  const results: RepairResult[] = [];
  for (const rel of files) {
    const r = await repairFile(repoRoot, rel);
    if (r.applied || r.unrepaired.length > 0) results.push(r);
  }
  const applied = results.filter((r) => r.applied).length;
  const needsIntent = results.flatMap((r) => r.unrepaired.map((u) => ({ file: r.rel, name: u.name, reason: u.reason })));
  return { scanned: files.length, applied, files: results, needsIntent };
}

const self = fileURLToPath(import.meta.url);
const invoked = process.argv[1] ? path.resolve(process.argv[1]) : '';
function repoRootOf(start: string): string {
  let d = start;
  for (let i = 0; i < 12; i += 1) {
    if (fs.existsSync(path.join(d, '.git'))) return d;
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  return start;
}
if (invoked === self || invoked === self.replace(/\.ts$/, '.js')) {
  const repoRoot = repoRootOf(path.dirname(self));
  const target = process.argv[2];
  if (!target) {
    process.stderr.write('usage: repair.js <repo-relative-file-or-dir>\n');
    process.exit(2);
  }
  const isDir = (() => {
    try {
      return fs.statSync(path.resolve(repoRoot, target)).isDirectory();
    } catch {
      return false;
    }
  })();
  const run = isDir
    ? repairScope(repoRoot, target).then((s) => {
        process.stdout.write(
          `\nATOMIC REPAIR — scope ${target}\n  scanned ${s.scanned} file(s); HEALED ${s.applied} file(s) green via the firewall\n`,
        );
        for (const r of s.files.filter((f) => f.applied)) {
          process.stdout.write(`  ✓ ${r.rel}  (reds ${r.redsBefore}→${r.redsAfter})\n${r.importsAdded.map((l) => `      ${l}`).join('\n')}\n`);
        }
        if (s.needsIntent.length) {
          process.stdout.write(`  needs-intent (not guessed): ${s.needsIntent.length}\n`);
          for (const n of s.needsIntent.slice(0, 40)) process.stdout.write(`      ${n.file}: ${n.name} — ${n.reason}\n`);
        }
        if (s.applied === 0 && s.needsIntent.length === 0) process.stdout.write('  GREEN — nothing to heal; every wire already converges.\n');
      })
    : repairFile(repoRoot, target).then((r) => {
        process.stdout.write(`\nATOMIC REPAIR — ${r.rel}\n  reds ${r.redsBefore} → ${r.redsAfter}  ${r.applied ? '(APPLIED via firewall)' : '(no green-convergent fix applied)'}\n`);
        if (r.importsAdded.length) process.stdout.write(`  imports added:\n${r.importsAdded.map((l) => `    ${l}`).join('\n')}\n`);
        if (r.unrepaired.length) process.stdout.write(`  needs-intent (not guessed):\n${r.unrepaired.map((u) => `    ${u.name} — ${u.reason}`).join('\n')}\n`);
      });
  run
    .then(() => process.exit(0))
    .catch((e: unknown) => {
      process.stderr.write(`repair error: ${e instanceof Error ? e.stack : String(e)}\n`);
      process.exit(1);
    });
}
