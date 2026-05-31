/**
 * gates/reexport-symbol-gate.ts — the exoneration-free NAMED-RE-EXPORT fact.
 *
 * THE GAP THIS CLOSES (red class #7). connection-gate.ts judges that the MODULE
 * half of every wire resolves: `export { Foo } from './m'` is GREEN today the
 * instant './m' resolves to a real FILE — even when './m' no longer EXPORTS Foo.
 * That is a half-checked wire: the file exists, but the NAME re-exported through it
 * dangles. A downstream `import { Foo } from './barrel'` then binds to `undefined`
 * (value) or fails to type-check (type), and the crivo waved it through. This gate
 * is the missing half: a NAMED re-export specifier terminates at a real exported
 * name in its target module, or it dangles.
 *
 * THE FACT (no language server at runtime, no daemon, no human):
 *   For `export { A, B as C } from './m'`, each SOURCE name (A, and for `B as C`
 *   the source name B; for `default as D` the source name `default`) must be an
 *   actual export of the resolved target module './m'. If the target's export set
 *   does not contain that name → the re-export is dangling → RED. This is exactly
 *   the LSP "does symbol X resolve in module M" fact, decided from the bytes.
 *
 * THE DECIDER — in-process ts-morph (the binding-gate.ts pattern, NOT the LSP
 * wrapper). The field map proves lsp_diagnostics does not surface these async
 * payloads here and lsp_code_actions times out, so we use the same machinery the
 * LSP itself uses, in-process:
 *   - Parse the changed file in an in-memory ts-morph Project, collect every
 *     `ExportDeclaration` that has a module specifier and named exports.
 *   - Resolve the specifier via the SHARED ctx.resolveRelImport (so "resolves"
 *     means exactly what it means for connection-gate / supply-chain).
 *   - Parse the TARGET module in the same in-memory project and enumerate its
 *     export NAME set = getExportSymbols() ∪ getExportedDeclarations().keys()
 *     (covers value AND type exports: const/function/class/enum/interface/type,
 *     plus `default`). A source name absent from that set is the dangling fact.
 *
 * NEW-only delta (mirrors binding-gate / supply-chain / the byte-write floor):
 *   only a re-export specifier present in the candidate's NEW content but NOT
 *   already dangling in its prior on-disk content is THIS write's claim. A
 *   pre-existing dangling re-export in legacy code never blocks an unrelated edit —
 *   but no write may INTRODUCE one. The prior is read via ctx.priorOf (prior disk
 *   bytes in the WRITE direction; '' in the LENS, so the lens judges absolutely).
 *
 * Mutation Firewall: this gate is a PERCEPTION — it LOCATES the dangling re-export
 * specifier (file + L<line>:<col> of the specifier) and states the fact. It never
 * splices bytes; the engine does that. It implements no proposeFixes: discharging a
 * dangling re-export needs an intention decision (delete the name? re-add the export
 * to the target? rename to a real export?), which the bytes do not determine — so it
 * proposes NOTHING rather than a guessed edit.
 *
 * Honest ceiling — UNJUDGED, never red-by-guess, never green-by-assumption (the
 * Rice line where this class stops being decidable from a single resolved target):
 *   - `export * from './m'` (namespace re-export): the re-exported set is './m''s
 *     entire dynamic export surface — and if './m' itself contains a transitive
 *     `export *`, the full set is not enumerable from './m' alone (ts-morph cannot
 *     see through an unloaded transitive star). So namespace re-exports are NOT
 *     judged, AND when the TARGET module itself contains any `export *` a source
 *     name we did not find directly is UNJUDGED (it may arrive through the star),
 *     never red.
 *   - dynamic / computed re-export targets, or a bare/aliased specifier
 *     (ctx.resolveRelImport → null): the module half is connection-gate /
 *     supply-chain's fact, not ours → skipped (not judged here).
 *   - target unresolvable to a real file, or its bytes unreadable → that specifier
 *     is undecidable → contributes to unjudged, not a red.
 *   - ts-morph unavailable / parse failure on either module → the file is
 *     undecidable → unjudged for that file, never red-by-guess.
 */
import { type GateModule, type GateContext, type GateResult, type GateRed } from './contract.js';

const TS_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

/** One dangling re-export specifier located in the re-exporting file. */
interface DanglingReexport {
  /** source name the target must export (e.g. 'Foo', or 'default' for `default as D`) */
  name: string;
  /** the resolved target module the name was not found in */
  target: string;
  line: number;
  col: number;
}

/**
 * ts-morph module-export enumeration, scoped to ONE resolved target module's bytes.
 * Returns { names, hasStar } where:
 *   - names = the directly-enumerable export NAME set (value + type + default).
 *   - hasStar = the target itself contains a namespace re-export (`export *`), so
 *     names is INCOMPLETE (a transitive export is not enumerable from these bytes).
 * Returns null when ts-morph is unavailable or the target cannot be parsed →
 * caller treats every specifier against this target as undecidable (unjudged).
 *
 * This is the same in-process ts-morph machinery binding-gate.ts uses (noLib /
 * noResolve in-memory project): we ask ts-morph "what does this module export",
 * which is exactly the LSP fact, without a language server.
 */
async function targetExportNames(
  rel: string,
  text: string,
): Promise<{ names: Set<string>; hasStar: boolean } | null> {
  let tsMorph: typeof import('ts-morph');
  try {
    tsMorph = await import('ts-morph');
  } catch {
    return null; // ts-morph not installed → undecidable for this target
  }
  const { Project, SyntaxKind } = tsMorph;
  try {
    const proj = new Project({
      useInMemoryFileSystem: true,
      skipAddingFilesFromTsConfig: true,
      // noLib/noResolve: we only need THIS module's own export surface, not the
      // whole lib graph; matches binding-gate's project shape exactly.
      compilerOptions: { allowJs: true, noLib: true, noResolve: true },
    });
    const ext = TS_RE.exec(rel)?.[1] ?? 'ts';
    const sf = proj.createSourceFile(`/__reexport_target__.${ext}`, text, { overwrite: true });
    const names = new Set<string>();
    for (const s of sf.getExportSymbols()) names.add(s.getName());
    for (const k of sf.getExportedDeclarations().keys()) names.add(k);
    // A target with its OWN namespace re-export has an export surface that is NOT
    // fully enumerable from these bytes (the transitive star's names live in an
    // unloaded module). Record that so the caller stays honest on a miss.
    const hasStar = sf
      .getDescendantsOfKind(SyntaxKind.ExportDeclaration)
      .some((e) => e.isNamespaceExport());
    return { names, hasStar };
  } catch {
    return null; // could not parse the target → undecidable
  }
}

/**
 * Extract the named re-export specifiers of ONE source file via ts-morph, resolving
 * each target through the shared ctx.resolveRelImport and checking each source name
 * against the target's enumerated exports. Returns:
 *   - reds: the dangling re-export specifiers DECIDED in this file.
 *   - undecided: true if any specifier could not be decided (ts-morph/target
 *     unreadable, or a miss against a star-bearing target) — folds into unjudged.
 *   - decided: true if at least one specifier was conclusively judged.
 * Returns null when ts-morph is unavailable or the re-exporting file cannot be
 * parsed → the whole file is undecidable (unjudged), never red-by-guess.
 */
async function danglingReexportsOf(
  ctx: GateContext,
  fromRel: string,
  text: string,
): Promise<{ reds: DanglingReexport[]; decided: boolean; undecided: boolean } | null> {
  let tsMorph: typeof import('ts-morph');
  try {
    tsMorph = await import('ts-morph');
  } catch {
    return null;
  }
  const { Project, SyntaxKind } = tsMorph;
  let sf: import('ts-morph').SourceFile;
  try {
    const proj = new Project({
      useInMemoryFileSystem: true,
      skipAddingFilesFromTsConfig: true,
      compilerOptions: { allowJs: true, noLib: true, noResolve: true },
    });
    const ext = TS_RE.exec(fromRel)?.[1] ?? 'ts';
    sf = proj.createSourceFile(`/__reexporter__.${ext}`, text, { overwrite: true });
  } catch {
    return null;
  }

  const reds: DanglingReexport[] = [];
  let decided = false;
  let undecided = false;
  // Cache target enumeration per resolved target so N specifiers from one barrel
  // re-parse the target once.
  const targetCache = new Map<string, { names: Set<string>; hasStar: boolean } | null>();

  for (const ed of sf.getDescendantsOfKind(SyntaxKind.ExportDeclaration)) {
    const spec = ed.getModuleSpecifierValue();
    if (!spec) continue; // `export { x }` (local re-export, no `from`) — binding/no module half here
    // `export * from './m'` — namespace re-export: the re-exported set is the
    // target's entire dynamic surface (and may be transitively starred). Not a
    // decidable single-name fact → honest unjudged contribution, never red.
    if (ed.isNamespaceExport()) {
      undecided = true;
      continue;
    }
    const named = ed.getNamedExports();
    if (named.length === 0) continue; // nothing named to judge on this declaration

    // Resolve the target through the SHARED resolver — same meaning of "resolves"
    // as connection-gate / supply-chain. null splits two honest ways:
    //   - a BARE specifier (`from 'pkg'`, no leading '.') is a different fact
    //     entirely (supply-chain's) — there is no per-symbol re-export claim to
    //     judge against a package barrel here, so skip cleanly (no undecided flag).
    //   - a RELATIVE specifier (`./x`) that does NOT resolve to a real file: the
    //     module half dangles (connection-gate reds it), but WE could not reach the
    //     target to enumerate its exports → this name is UNDECIDABLE for us, so we
    //     record undecided (→ unjudged), never green-by-assumption, never red-by-guess.
    const target = ctx.resolveRelImport(fromRel, spec);
    if (target === null) {
      if (spec.startsWith('.')) undecided = true; // relative-but-unresolvable → undecidable
      continue; // bare specifier → supply-chain's fact, nothing to judge here
    }

    let enumerated = targetCache.get(target);
    if (enumerated === undefined) {
      const targetText = ctx.readFile(target);
      enumerated = targetText === null ? null : await targetExportNames(target, targetText);
      targetCache.set(target, enumerated);
    }
    if (enumerated === null) {
      undecided = true; // target unreadable / unparseable → undecidable for these names
      continue;
    }

    for (const ne of named) {
      // getName() is the SOURCE name the target must export: `Foo` for `Foo`,
      // `Foo` for `Foo as Bar`, and `default` for `default as D`.
      const sourceName = ne.getName();
      const start = ne.getStart();
      const lc = sf.getLineAndColumnAtPos(start);
      if (enumerated.names.has(sourceName)) {
        decided = true;
        continue; // re-exported name is a real export of the target — green
      }
      // Not found directly. If the target carries its OWN `export *`, the name may
      // arrive through that transitive star, which we cannot enumerate from one
      // module's bytes → UNJUDGED, never red.
      if (enumerated.hasStar) {
        undecided = true;
        continue;
      }
      decided = true;
      reds.push({ name: sourceName, target, line: lc.line, col: lc.column });
    }
  }
  return { reds, decided, undecided };
}

const NOTE =
  'every NEW named re-export `export { name } from "./m"` resolves to a real export of "./m" (NEW-only)';

const reexportSymbolGate: GateModule = {
  name: 'reexport-symbol',
  kind: 'static',
  appliesTo(rel: string): boolean {
    return TS_RE.test(rel);
  },
  async run(ctx: GateContext): Promise<GateResult> {
    const reds: GateRed[] = [];
    let anyDecided = false;
    let anyUndecided = false;

    for (const rel of ctx.changedFiles) {
      if (!this.appliesTo(rel)) continue;
      const now = ctx.readFile(rel);
      if (now === null) continue;

      const nowRes = await danglingReexportsOf(ctx, rel, now);
      if (nowRes === null) {
        anyUndecided = true; // ts-morph unavailable / unparseable re-exporter → honest
        continue;
      }
      if (nowRes.decided) anyDecided = true;
      if (nowRes.undecided) anyUndecided = true;

      // NEW-only delta: subtract the specifiers ALREADY dangling in the prior bytes.
      // ctx.priorOf = prior disk bytes (WRITE) or '' (LENS → judge absolutely).
      const beforeRaw = ctx.priorOf(rel);
      let priorKeys: Set<string> = new Set();
      if (beforeRaw !== '') {
        const beforeRes = await danglingReexportsOf(ctx, rel, beforeRaw);
        if (beforeRes !== null) {
          priorKeys = new Set(beforeRes.reds.map((r) => `${r.name} ${r.target}`));
        }
      }

      for (const d of nowRes.reds) {
        if (priorKeys.has(`${d.name} ${d.target}`)) continue; // already dangling before → not this write's claim
        reds.push({
          file: rel,
          locus: `L${d.line}:${d.col}`,
          fact: `re-exports '${d.name}' not exported by '${d.target}' (dangling named re-export)`,
        });
      }
    }

    if (reds.length > 0) {
      return { gate: this.name, green: false, reds, note: NOTE };
    }
    // No reds. A real green requires that we decided at least one specifier. If the
    // only thing we saw was undecidable (ts-morph absent, or solely star/unresolved
    // re-exports), be honest: unjudged, not green-by-assumption.
    if (!anyDecided && anyUndecided) {
      return { gate: this.name, green: true, reds: [], note: NOTE, unjudged: true };
    }
    return { gate: this.name, green: true, reds: [], note: NOTE };
  },
};

export default reexportSymbolGate;
