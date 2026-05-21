# Wave M — LiqSlice-ConvergencePlan

## Mission

Reduce `hardcoded_replacement_cheat_risk` findings in `scripts/pulse/convergence-plan.ts` by replacing static literals with dynamic derivation from runtime/AST/filesystem/type-contract evidence.

**Target**: netDelta < 0 in this single file. Do not increase debt elsewhere.

## Mandatory pre-read (FULL READ, no skim)

1. `scripts/decomp/opencode-subagent-delegation-rules.md`
2. `docs/ai/PULSE_NO_HARDCODED_REALITY_DEBT_GUIDE.md` (this is operational law; read every line)
3. `CLAUDE.md` + `AGENTS.md`
4. `scripts/pulse/no-hardcoded-reality-audit.ts` (the auditor — DO NOT EDIT)
5. `scripts/pulse/convergence-plan.ts` (the target file, every line)
6. Any helper this file imports

## ABSOLUTE FORBIDDEN

- DO NOT edit `scripts/pulse/no-hardcoded-reality-audit.ts`
- DO NOT use suppression comments / skip tags / @ts-ignore / @ts-expect-error / eslint-disable / biome-ignore / nosemgrep / nosonar / noqa / codacy-(disable|ignore) / PULSE_VISUAL_OK / VISUAL_BYPASS
- DO NOT replace hardcode with cosmetic/fake derivations (the auditor catches "if(x) { x = 'literal' }")
- DO NOT move literals to other files
- DO NOT delete companions or `__parts__` files
- DO NOT use `as any` or escape hatches
- DO NOT run `git restore`, `git reset --hard`, `git clean`, `git checkout --` on anything

## Valid dynamic evidence sources

1. TypeScript AST extraction of real source files (ts-morph, typescript-eslint)
2. Type-contract unions from declaration files
3. Runtime catalogs (require ts-node + module resolution)
4. Filesystem evidence (directory contents, file mtime)
5. Package.json declarations + lockfile

## Method

1. Measure beforeModuleTotal via focused auditor invocation
2. Read the target file in full
3. For each `replacement_cheat_risk` finding, identify the literal and find a real dynamic source
4. Replace with dynamic derivation
5. Re-measure; success requires `netDelta < 0` AND TypeScript compile passes AND existing PULSE tests pass

## Measure with focused auditor

```bash
cd /Users/danielpenin/whatsapp_saas
backend/node_modules/.bin/ts-node --project scripts/pulse/tsconfig.json -e "
  import { auditPulseNoHardcodedReality } from './scripts/pulse/no-hardcoded-reality-audit';
  const r = auditPulseNoHardcodedReality(process.cwd());
  const f = r.findings.filter(x => x.file === 'scripts/pulse/convergence-plan.ts');
  console.log(JSON.stringify({
    total: f.length,
    cheatRisk: f.filter(x => x.kind === 'hardcoded_replacement_cheat_risk').length,
  }, null, 2));
"
```

## Ownership

Edit ONLY `scripts/pulse/convergence-plan.ts` and any new helper files YOU create inside `scripts/pulse/` for this slice.

## Validation

```bash
cd /Users/danielpenin/whatsapp_saas/backend
npx tsc --project ../scripts/pulse/tsconfig.json --noEmit
```

## Definition of Done

- before / after file total measured, recorded in subagent output
- netDelta < 0
- TypeScript compile of scripts/pulse/* passes
- No bypass tokens introduced
