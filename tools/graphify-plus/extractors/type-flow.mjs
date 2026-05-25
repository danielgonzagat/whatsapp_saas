#!/usr/bin/env node
// extractors/type-flow.mjs — Wave 4: Prisma type-flow tracker.
//
// Para cada model em backend/prisma/schema.prisma:
//   • Emite node `prisma-model:<Name>` com seus campos
//   • Conecta com edges `consumes-prisma-model` a cada arquivo backend que importa
//     o tipo (via regex sobre Prisma.<Model> e <Model>CreateInput, etc).
//
// Se um campo for renomeado / removido no schema, fica trivial enxergar quais
// consumidores precisam ser atualizados.

import { argv } from 'node:process';
import { readFile } from 'node:fs/promises';
import { collect, readCapped, rel } from '../lib/scan.mjs';
import { makeShard, addNode, addEdge, writeShard, nid } from '../lib/graph.mjs';

const ROOT = argv[2] || process.cwd();
const OUT = argv[3] || `${ROOT}/graphify-out/shards/type-flow.json`;

const MODEL_RE = /^model\s+(\w+)\s*\{([\s\S]*?)\n\}/gm;
const FIELD_RE = /^\s*(\w+)\s+(\w+)(\??|\[\])?\s*(.*)$/gm;
const ENUM_RE = /^enum\s+(\w+)\s*\{([\s\S]*?)\n\}/gm;

async function main() {
  const shard = makeShard();
  let schema = '';
  try {
    schema = await readFile(`${ROOT}/backend/prisma/schema.prisma`, 'utf8');
  } catch (err) {
    console.log(`[type-flow] no schema.prisma (${err.code}) — emitting empty shard`);
    await writeShard(shard, OUT);
    return;
  }

  // 1) Models
  const models = [];
  for (const m of schema.matchAll(MODEL_RE)) {
    const [, name, body] = m;
    const fields = [];
    for (const f of body.matchAll(FIELD_RE)) {
      const [, fname, ftype, opt = ''] = f;
      if (fname.startsWith('@') || fname.startsWith('//')) continue;
      fields.push({ name: fname, type: ftype, optional: opt === '?', array: opt === '[]' });
    }
    models.push({ name, fields });
    addNode(shard, {
      id: nid('prisma-model', name),
      label: `Prisma model ${name}`,
      type: 'prisma-model',
      file: 'backend/prisma/schema.prisma',
      line: 1,
      meta: { fieldCount: fields.length, fields: fields.slice(0, 30) },
    });
  }

  // 2) Enums
  for (const m of schema.matchAll(ENUM_RE)) {
    const [, name, body] = m;
    const values = body
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('//') && !l.startsWith('@'));
    addNode(shard, {
      id: nid('prisma-enum', name),
      label: `Prisma enum ${name}`,
      type: 'prisma-enum',
      file: 'backend/prisma/schema.prisma',
      line: 1,
      meta: { values },
    });
  }

  // 3) Find consumers in backend/src.
  const modelNames = models.map((m) => m.name);
  const modelSet = new Set(modelNames);
  const consumerRe = new RegExp(
    `\\b(?:Prisma\\.)?(${modelNames.join('|')})(?:CreateInput|UpdateInput|WhereInput|WhereUniqueInput|UncheckedCreateInput|UncheckedUpdateInput|OrderByInput|Select|Include)?\\b`,
    'g',
  );

  let consumerHits = 0;
  for (const file of await collect(`${ROOT}/backend/src`, (_p, n) => /\.(ts|mts|cts)$/.test(n) && !n.endsWith('.spec.ts'))) {
    const src = await readCapped(file);
    if (!src) continue;
    const seen = new Set();
    for (const m of src.matchAll(consumerRe)) {
      const model = m[1];
      if (!modelSet.has(model) || seen.has(model)) continue;
      seen.add(model);
      const fileRel = rel(file, ROOT);
      addEdge(shard, nid('file', fileRel), nid('prisma-model', model), 'consumes-prisma-model');
      consumerHits++;
    }
  }

  shard.stats['stats:models'] = models.length;
  shard.stats['stats:consumer_edges'] = consumerHits;

  await writeShard(shard, OUT);
  console.log(`[type-flow] wrote ${OUT} — ${shard.nodes.length} nodes, ${shard.edges.length} edges`);
  console.log(`[type-flow] stats: ${JSON.stringify(shard.stats)}`);
}

await main();
