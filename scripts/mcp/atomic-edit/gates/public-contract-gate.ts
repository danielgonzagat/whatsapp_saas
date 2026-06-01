/**
 * gates/public-contract-gate.ts — the exoneration-free PUBLIC-CONTRACT fact
 * (proof #3's named-but-missing "public contract / breaking-change" layer).
 *
 * A module's EXPORT SET is its public contract. A write that REMOVES an exported
 * name (delete it, or rename it away) is a BREAKING change to every file that
 * imports that name from this module — those importers now bind to `undefined`.
 * The fact: a removed export whose name is STILL imported (from this module) by
 * another file in the changed set dangles — unless that importer co-drops the
 * import in the same atomic set.
 *
 * This is the dual of reexport-symbol-gate: that gate proves a re-export resolves
 * to a real export of its target; this gate proves a REMOVED export does not
 * orphan a live consumer. Same in-process ts-morph machinery (binding-gate's
 * noLib/noResolve in-memory Project) — no language server, no daemon.
 *
 * Semantics (NEW-only, exoneration-free):
 *  - For each changed source module, removedExports = priorExports \ newExports
 *    (a name in the PRIOR bytes' export set but ABSENT from the NEW one). Only
 *    these are this write's claim.
 *  - For each removed name, scan the OTHER changed files: if one still imports
 *    that name FROM this module, the contract break orphans a live consumer → RED.
 *  - Co-change exoneration: if every importer in the changed set has ALSO dropped
 *    the import, there is no orphan → green.
 *
 * Honest ceiling (UNJUDGED, never red-by-guess): ts-morph unavailable / a module
 * unparseable; `export *` on the module (surface not fully enumerable); WHOLE-REPO
 * reverse-import scan is OUT OF SCOPE (the reachability-gate / lens's orphan fact)
 * — this gate judges only the decidable changed-set slice a single write can break.
 *
 * Mutation Firewall: PERCEPTION only — it LOCATES the break; it never writes.
 */
import { type GateModule, type GateContext, type GateResult, type GateRed } from './contract.js';

const TS_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

async function moduleExportSurface(
  rel: string,
  text: string,
): Promise<{ names: Set<string>; hasStar: boolean } | null> {
  let tsMorph: typeof import('ts-morph');
  try {
    tsMorph = await import('ts-morph');
  } catch {
    return null;
  }
  const { Project, SyntaxKind } = tsMorph;
  try {
    const proj = new Project({
      useInMemoryFileSystem: true,
      skipAddingFilesFromTsConfig: true,
      compilerOptions: { allowJs: true, noLib: true, noResolve: true },
    });
    const ext = TS_RE.exec(rel)?.[1] ?? 'ts';
    const sf = proj.createSourceFile(`/__module__.${ext}`, text, { overwrite: true });
    const names = new Set<string>();
    for (const s of sf.getExportSymbols()) names.add(s.getName());
    for (const k of sf.getExportedDeclarations().keys()) names.add(k);
    const hasStar = sf
      .getDescendantsOfKind(SyntaxKind.ExportDeclaration)
      .some((e) => e.isNamespaceExport());
    return { names, hasStar };
  } catch {
    return null;
  }
}

async function namedImportsFrom(
  ctx: GateContext,
  importerRel: string,
  importerText: string,
  targetRel: string,
): Promise<Set<string> | null> {
  let tsMorph: typeof import('ts-morph');
  try {
    tsMorph = await import('ts-morph');
  } catch {
    return null;
  }
  const { Project } = tsMorph;
  try {
    const proj = new Project({
      useInMemoryFileSystem: true,
      skipAddingFilesFromTsConfig: true,
      compilerOptions: { allowJs: true, noLib: true, noResolve: true },
    });
    const ext = TS_RE.exec(importerRel)?.[1] ?? 'ts';
    const sf = proj.createSourceFile(`/__importer__.${ext}`, importerText, { overwrite: true });
    const out = new Set<string>();
    for (const id of sf.getImportDeclarations()) {
      const spec = id.getModuleSpecifierValue();
      if (!spec || !spec.startsWith('.')) continue;
      const resolved = ctx.resolveRelImport(importerRel, spec);
      if (resolved !== targetRel) continue;
      for (const ni of id.getNamedImports()) out.add(ni.getName());
    }
    return out;
  } catch {
    return null;
  }
}

function lineOf(text: string, name: string): number {
  const re = new RegExp(`\\bexport\\b[\\s\\S]*?\\b${name}\\b`);
  const m = re.exec(text);
  const idx = m ? m.index : text.indexOf(name);
  if (idx < 0) return 1;
  let line = 1;
  for (let i = 0; i < idx; i += 1) if (text[i] === '\n') line += 1;
  return line;
}

const NOTE =
  'a write must not REMOVE an exported name still imported (from this module) by another file in the changed set (breaking public contract); NEW-only vs prior, co-change exonerated';

const publicContractGate: GateModule = {
  name: 'public-contract',
  kind: 'static',
  appliesTo(rel: string): boolean {
    return TS_RE.test(rel);
  },
  async run(ctx: GateContext): Promise<GateResult> {
    const reds: GateRed[] = [];
    let anyDecided = false;
    let anyUndecided = false;

    const sources = ctx.changedFiles.filter((f) => TS_RE.test(f));
    for (const rel of sources) {
      const now = ctx.readFile(rel);
      if (now === null) continue;
      const prior = ctx.priorOf(rel);
      if (prior === '') continue; // brand-new module — no prior surface → no removal claim

      const newSurface = await moduleExportSurface(rel, now);
      const priorSurface = await moduleExportSurface(rel, prior);
      if (newSurface === null || priorSurface === null) {
        anyUndecided = true;
        continue;
      }
      if (newSurface.hasStar || priorSurface.hasStar) {
        anyUndecided = true;
        continue;
      }
      const removed = [...priorSurface.names].filter((n) => !newSurface.names.has(n));
      if (removed.length === 0) {
        anyDecided = true;
        continue;
      }

      for (const importerRel of sources) {
        if (importerRel === rel) continue;
        const importerText = ctx.readFile(importerRel);
        if (importerText === null) continue;
        const imported = await namedImportsFrom(ctx, importerRel, importerText, rel);
        if (imported === null) {
          anyUndecided = true;
          continue;
        }
        for (const name of removed) {
          if (imported.has(name)) {
            reds.push({
              file: rel,
              locus: `L${lineOf(prior, name)}`,
              fact: `removes exported '${name}' still imported by '${importerRel}' — breaking public contract; re-add the export or co-update the importer in this set`,
            });
          }
        }
      }
      anyDecided = true;
    }

    if (reds.length > 0) return { gate: this.name, green: false, reds, note: NOTE };
    if (!anyDecided && anyUndecided) return { gate: this.name, green: true, reds: [], note: NOTE, unjudged: true };
    return { gate: this.name, green: true, reds: [], note: NOTE };
  },
};

export default publicContractGate;
