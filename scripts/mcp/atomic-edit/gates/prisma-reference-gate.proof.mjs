#!/usr/bin/env node
/**
 * prisma-reference-gate.proof.mjs — standalone node proof for the PRISMA reference gate.
 *
 * Run:  node scripts/mcp/atomic-edit/build.mjs \
 *    && node scripts/mcp/atomic-edit/gates/prisma-reference-gate.proof.mjs
 *
 * (node, not tsx — it imports the COMPILED gate from dist/, so it runs anywhere the
 * server runs.) Every assertion is in-memory: a tiny synthetic schema.prisma is supplied
 * through the overlay (so ctx.readFile('backend/prisma/schema.prisma') returns it), and
 * the judged source files are overlay-only too — no repo source is ever read or written.
 *
 * It proves the gate in BOTH polarities plus the honesty properties the doctrine demands:
 *
 *   RED1     prismaAny.<accessor> whose model does not exist in the schema → reddened.
 *   RED2     $queryRaw FROM "<table>" whose physical table is not a model @@map → reddened.
 *   RED3     prismaAny.<accessor> inside executable template interpolation remains code
 *            and still reddens when unknown.
 *   GREEN1   prismaAny.<accessor> for a real model + $queryRaw FROM a real @@map → green.
 *   DELTA    a PRE-EXISTING dangling prismaAny ref (unchanged) is tolerated; a NEW one
 *            introduced alongside it still reddens (NEW-reference-only semantics).
 *   UNJUDGED-1  a literal table sitting in a runtime-built ($-interpolated) SQL region is
 *               NOT reddened, and (when it is the only thing seen) the gate returns
 *               unjudged — the Rice line: a column in a runtime-built SQL string is
 *               undecidable.
 *   UNJUDGED-2  no schema.prisma readable at all → unjudged (no dictionary → never
 *               red-by-guess).
 *   OUT-OF-SCOPE a computed member prismaAny[var] (dynamic accessor), a commented-out
 *                ref, prismaAny text inside string/template literal text, and an
 *                unquoted FROM identifier are never extracted → green.
 */
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const { makeContext } = await import(path.join(dir, '..', 'dist', 'gates', 'contract.js'));
const gate = (await import(path.join(dir, '..', 'dist', 'gates', 'prisma-reference-gate.js'))).default;

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) {
    pass += 1;
    console.log('  PASS ', name);
  } else {
    fail += 1;
    console.log('  FAIL ', name);
  }
}

const SCHEMA_REL = 'backend/prisma/schema.prisma';

// A minimal but faithful synthetic schema: two models, one mapped to a physical table
// name distinct from the model name (the @@map case the real schema uses everywhere).
const SCHEMA = [
  'model Workspace {',
  '  id   String @id',
  '  name String',
  '  @@map("RAC_Workspace")',
  '}',
  '',
  'model Message {',
  '  id        String @id',
  '  body      String',
  '  @@map("RAC_Message")',
  '}',
  '',
  '// model GhostInComment {  <- commented-out: must NOT enter the dictionary',
  '//   @@map("RAC_GhostInComment")',
  '// }',
].join('\n');

// repoRoot is irrelevant: every readFile is satisfied from the overlay (schema + src),
// and priorOf is supplied via a fresh overlay key — but the gate's priorOf reads DISK,
// so for the DELTA case we point repoRoot at a temp dir and write the prior there.
const REPO = dir; // any existing dir; only the DELTA case reads prior bytes from disk

function judge(overlaySrc, changed) {
  const overlay = new Map(Object.entries({ [SCHEMA_REL]: SCHEMA, ...overlaySrc }));
  return gate.run(makeContext(REPO, overlay, changed));
}

// 1) RED1 — prismaAny accessor with no matching model.
{
  const res = judge({ 'a.ts': 'this.prismaAny.memberAreaUpdate.updateMany({});' }, ['a.ts']);
  check('RED1: unknown prismaAny.memberAreaUpdate reddens', res.green === false && !res.unjudged);
  check('RED1: red names the accessor + cites schema.prisma', res.reds.some((r) => r.fact.includes('memberAreaUpdate') && r.fact.includes('schema.prisma')));
  check('RED1: red carries an L<line> locus', !!res.reds[0] && /^L\d+$/.test(res.reds[0].locus || ''));
}

// 2) RED2 — $queryRaw FROM a physical table that is no @@map.
{
  const res = judge({ 'b.ts': 'const q = this.prisma.$queryRaw`SELECT * FROM "RAC_Mesage" WHERE id = 1`;' }, ['b.ts']);
  check('RED2: unknown $queryRaw table "RAC_Mesage" reddens', res.green === false && !res.unjudged);
  check('RED2: red names the bad physical table', res.reds.some((r) => r.fact.includes('RAC_Mesage')));
}

// 3) RED3 — template interpolation is executable code, not string text.
{
  const src = 'const rendered = `${this.prismaAny.ghostInInterpolation.findMany({})}`;';
  const res = judge({ 'h.ts': src }, ['h.ts']);
  check('RED3: prismaAny inside template interpolation remains judged code', res.green === false && res.reds.some((r) => r.fact.includes('ghostInInterpolation')));
}

// 4) GREEN1 — real model accessor + real @@map table both resolve.
{
  const src =
    'this.prismaAny.workspace.findMany({});\n' +
    'const q = this.prisma.$queryRaw`SELECT id FROM "RAC_Message" JOIN "RAC_Workspace" ON 1=1`;';
  const res = judge({ 'c.ts': src }, ['c.ts']);
  check('GREEN1: known accessor (workspace) + known tables resolve', res.green === true && res.reds.length === 0 && !res.unjudged);
}

// 5) DELTA — pre-existing dangling ref tolerated; a NEW one alongside it still reddens.
{
  // Write a prior on disk so ctx.priorOf reads it (DELTA semantics need real prior bytes).
  const fs = await import('node:fs');
  const os = await import('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prisma-gate-delta-'));
  const rel = 'd.ts';
  const prior = 'this.prismaAny.legacyGhost.findMany({});\n';
  fs.writeFileSync(path.join(tmp, rel), prior, 'utf8');
  const overlay = new Map(Object.entries({
    [SCHEMA_REL]: SCHEMA,
    [rel]: prior + 'this.prismaAny.brandNewGhost.create({});\n',
  }));
  const res = gate.run(makeContext(tmp, overlay, [rel]));
  check('DELTA: pre-existing legacyGhost dangle is tolerated (NEW-ref-only)', !res.reds.some((r) => r.fact.includes('legacyGhost')));
  check('DELTA: a NEW brandNewGhost dangle introduced this write still reddens', res.green === false && res.reds.some((r) => r.fact.includes('brandNewGhost')));
  fs.rmSync(tmp, { recursive: true, force: true });
}

// 6) UNJUDGED-1 — a literal table inside a runtime-built ($-interpolated) SQL region.
{
  const res = judge({ 'e.ts': 'const q = this.prisma.$queryRaw`SELECT * FROM "RAC_DoesNotExist" WHERE id = ${id}`;' }, ['e.ts']);
  check('UNJUDGED-1: literal table in an interpolated region is NOT reddened (Rice line)', !res.reds.some((r) => r.fact.includes('RAC_DoesNotExist')));
  check('UNJUDGED-1: gate is unjudged when only a dynamic SQL region was seen', res.unjudged === true && res.green === true && res.reds.length === 0);
}

// 7) UNJUDGED-2 — no schema readable → no dictionary → unjudged.
{
  // overlay WITHOUT the schema key, and a repoRoot with no schema on disk.
  const fs = await import('node:fs');
  const os = await import('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prisma-gate-noschema-'));
  const overlay = new Map(Object.entries({ 'f.ts': 'this.prismaAny.ghost.x();' }));
  const res = gate.run(makeContext(tmp, overlay, ['f.ts']));
  check('UNJUDGED-2: no schema.prisma → unjudged (never red-by-guess)', res.unjudged === true && res.green === true && res.reds.length === 0);
  fs.rmSync(tmp, { recursive: true, force: true });
}

// 8) OUT-OF-SCOPE — computed member, comment, string/template text, and unquoted FROM are never extracted.
{
  const src =
    'const m = "ghost";\n' +
    'const note = "this.prismaAny.ghostInString.findMany({})";\n' +
    'const template = `this.prismaAny.ghostInTemplate.create({})`;\n' +
    'this.prismaAny[m].findMany({});           // computed member — dynamic accessor\n' +
    '// this.prismaAny.ghostInComment.find();  -- commented-out, must not extract\n' +
    'const q = this.prisma.$queryRaw`WITH inbound AS (SELECT 1) SELECT * FROM inbound`;\n' +
    'this.prismaAny.message.count({});         // a REAL accessor → keeps it honest';
  const res = judge({ 'g.ts': src }, ['g.ts']);
  check('OUT-OF-SCOPE: computed prismaAny[m] is not extracted', !res.reds.some((r) => r.fact.includes('ghost') && !r.fact.includes('ghostInComment') && !r.fact.includes('ghostInString') && !r.fact.includes('ghostInTemplate')));
  check('OUT-OF-SCOPE: commented ghostInComment is not extracted', !res.reds.some((r) => r.fact.includes('ghostInComment')));
  check('OUT-OF-SCOPE: string-literal ghostInString is not extracted', !res.reds.some((r) => r.fact.includes('ghostInString')));
  check('OUT-OF-SCOPE: template text ghostInTemplate is not extracted', !res.reds.some((r) => r.fact.includes('ghostInTemplate')));
  check('OUT-OF-SCOPE: unquoted CTE "inbound" is out of scope (not red-by-guess)', !res.reds.some((r) => r.fact.includes('inbound')));
  check('OUT-OF-SCOPE: gate is GREEN (only the real prismaAny.message remains)', res.green === true && res.reds.length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
