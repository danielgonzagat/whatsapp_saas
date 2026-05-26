#!/usr/bin/env node
// extractors/nestjs.mjs
//
// Determinístico — sem LLM. Lê backend/src/** e extrai:
//   • @Module({ imports, providers, controllers })
//   • @Injectable() / @Controller(...)
//   • Constructor parameter injection (private readonly foo: FooService)
//   • @Inject('TOKEN') named-token injection
//
// Resolve o grafo DI real do NestJS — relações que o AST puro não vê porque
// o Nest injeta por type-resolution em runtime.

import { argv } from 'node:process';
import { basename } from 'node:path';
import { collect, readCapped, rel } from '../lib/scan.mjs';
import { makeShard, addNode, addEdge, writeShard, nid } from '../lib/graph.mjs';

const ROOT = argv[2] || process.cwd();
const OUT = argv[3] || `${ROOT}/graphify-out/shards/nestjs.json`;

// Capture @Module decorator + its argument body (best-effort, regex-balanced).
const MODULE_RE = /@Module\s*\(\s*\{([\s\S]*?)\}\s*\)\s*export\s+class\s+([A-Z][\w]*)/g;
const CONTROLLER_RE = /@Controller\s*\(([\s\S]*?)\)\s*export\s+class\s+([A-Z][\w]*)/g;
const INJECTABLE_RE = /@Injectable\s*\(\s*[^)]*\)\s*export\s+class\s+([A-Z][\w]*)/g;
const SERVICE_CLASS_RE = /^\s*export\s+class\s+([A-Z]\w*(?:Service|Repository|Strategy|Guard|Interceptor|Filter|Pipe))\b/gm;

// constructor(private readonly foo: FooService, @Inject('X') private readonly bar: BarService) {}
const CTOR_RE = /constructor\s*\(([^)]*)\)/;
const PARAM_RE = /(?:@Inject\(\s*['"`]?([\w$.\-]+)['"`]?\s*\)\s*)?(?:private\s+|public\s+|protected\s+)?(?:readonly\s+)?(\w+)\s*:\s*([A-Z][\w<>,\s]+)/g;

const LIST_RE = /\[([^\]]*)\]/g;

async function main() {
  const shard = makeShard();
  const files = await collect(`${ROOT}/backend/src`, (_p, n) => /\.(ts|mts)$/.test(n) && !n.endsWith('.spec.ts') && !n.endsWith('.spec.tsx'));

  for (const file of files) {
    const src = await readCapped(file);
    if (!src) continue;
    const relPath = rel(file, ROOT);

    // @Module classes — emit module node + parse imports/providers/controllers.
    for (const m of src.matchAll(MODULE_RE)) {
      const [, body, className] = m;
      const modId = nid('nest-module', className);
      addNode(shard, {
        id: modId,
        label: `@Module ${className}`,
        type: 'nest-module',
        file: relPath,
        line: lineOf(src, m.index),
      });
      extractListField(body, 'imports').forEach((dep) =>
        addEdge(shard, modId, nid('nest-module', dep), 'imports-module'),
      );
      extractListField(body, 'providers').forEach((p) =>
        addEdge(shard, modId, nid('nest-provider', p), 'provides'),
      );
      extractListField(body, 'controllers').forEach((c) =>
        addEdge(shard, modId, nid('nest-controller', c), 'mounts'),
      );
      extractListField(body, 'exports').forEach((e) =>
        addEdge(shard, modId, nid('nest-provider', e), 'exports-provider'),
      );
    }

    // @Controller classes — endpoints will be picked up by the routing extractor.
    for (const m of src.matchAll(CONTROLLER_RE)) {
      const [, , className] = m;
      addNode(shard, {
        id: nid('nest-controller', className),
        label: `@Controller ${className}`,
        type: 'nest-controller',
        file: relPath,
        line: lineOf(src, m.index),
      });
      attachCtorDeps(shard, src, m.index, nid('nest-controller', className));
    }

    // @Injectable providers.
    for (const m of src.matchAll(INJECTABLE_RE)) {
      const [, className] = m;
      const id = nid('nest-provider', className);
      addNode(shard, {
        id,
        label: `@Injectable ${className}`,
        type: 'nest-provider',
        file: relPath,
        line: lineOf(src, m.index),
      });
      attachCtorDeps(shard, src, m.index, id);
    }

    // Bare exported services that *look* like a NestJS provider but lack the decorator.
    for (const m of src.matchAll(SERVICE_CLASS_RE)) {
      const [, className] = m;
      const id = nid('nest-provider', className);
      if (shard.nodes.some((n) => n.id === id)) continue;
      addNode(shard, {
        id,
        label: `class ${className}`,
        type: 'nest-provider',
        file: relPath,
        line: lineOf(src, m.index),
        meta: { undecorated: true },
      });
    }
  }

  await writeShard(shard, OUT);
  console.log(`[nestjs] wrote ${OUT} — ${shard.nodes.length} nodes, ${shard.edges.length} edges`);
  console.log(`[nestjs] stats: ${JSON.stringify(shard.stats)}`);
}

function extractListField(body, field) {
  // Find `field: [a, b, c]` and return the comma-separated identifiers.
  const re = new RegExp(`${field}\\s*:\\s*\\[([\\s\\S]*?)\\]`);
  const m = body.match(re);
  if (!m) return [];
  return m[1]
    .split(',')
    .map((x) => x.trim().replace(/\/\/.*$/m, '').trim())
    .filter((x) => x && /^[A-Z][\w]*/.test(x))
    .map((x) => x.match(/^[A-Z]\w*/)[0]);
}

function attachCtorDeps(shard, src, decoratorIdx, ownerId) {
  // Find first `constructor(...)` after the decorator (within 4000 chars).
  const slice = src.slice(decoratorIdx, decoratorIdx + 4000);
  const ctorMatch = slice.match(CTOR_RE);
  if (!ctorMatch) return;
  const params = ctorMatch[1];
  for (const p of params.matchAll(PARAM_RE)) {
    const [, injectToken, , type] = p;
    const typeClean = type.split(/[<,\s]/)[0];
    const depId = injectToken
      ? nid('nest-token', injectToken)
      : nid('nest-provider', typeClean);
    addEdge(shard, ownerId, depId, 'injects', injectToken ? { token: injectToken } : undefined);
  }
}

function lineOf(src, idx) {
  return src.slice(0, idx).split('\n').length;
}

await main();
