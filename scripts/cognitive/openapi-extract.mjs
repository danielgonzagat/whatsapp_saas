#!/usr/bin/env node
/**
 * Kloel OpenAPI Extractor — extracts the NestJS Swagger spec.
 *
 * Modes:
 *   extract  (default) — try fetching the live backend at OPENAPI_BASE_URL.
 *                        If unreachable, fall back to static AST scan so
 *                        session-from-zero still produces a usable spec.
 *   static            — force static AST scan only (no backend required).
 *   validate          — sanity-check the on-disk spec.
 *   routes            — print one line per route (METHOD path).
 *
 * Output: tools/openapi/openapi-spec.json (consumed by tools/cognitive-hub/protocol-hub.mjs).
 */
import { execSync } from 'child_process';
import {
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const OUT_DIR = resolve(REPO_ROOT, 'tools', 'openapi');
const OUT = resolve(OUT_DIR, 'openapi-spec.json');
const BACKEND_SRC = resolve(REPO_ROOT, 'backend', 'src');

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const BASE_URL = process.env.OPENAPI_BASE_URL || 'http://localhost:3001';
const SPEC_URL = `${BASE_URL}/api-json`;

// -------------------------------------------------------------------------
// Static AST scan (no backend required)
// -------------------------------------------------------------------------

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '__test-support__') continue;
      walk(p, files);
    } else if (entry.endsWith('.controller.ts') && !entry.endsWith('.spec.ts')) {
      files.push(p);
    }
  }
  return files;
}

const RE_CONTROLLER = /@Controller\(\s*(['"`])(?<path>[^'"`]*)\1\s*\)/;
const RE_HTTP_METHOD = /@(Get|Post|Put|Patch|Delete|Options|Head)\(\s*(?:(['"`])(?<path>[^'"`]*)\2)?[^)]*\)\s*\n\s*(?:@[\w()'":,\s]*\n\s*)*\s*(?:async\s+)?(?<method>\w+)\s*\(/g;
const RE_API_TAG = /@ApiTags\(\s*(['"`])(?<tag>[^'"`]*)\1\s*\)/;

function relPath(file) {
  return file.replace(REPO_ROOT + '/', '');
}

function extractController(file) {
  const src = readFileSync(file, 'utf8');
  const ctrlMatch = src.match(RE_CONTROLLER);
  if (!ctrlMatch) return null;
  const basePath = '/' + ctrlMatch.groups.path.replace(/^\//, '');
  const tagMatch = src.match(RE_API_TAG);
  const tag = tagMatch?.groups?.tag || basePath.split('/').filter(Boolean)[0] || 'default';
  const routes = [];
  let m;
  RE_HTTP_METHOD.lastIndex = 0;
  while ((m = RE_HTTP_METHOD.exec(src))) {
    const verb = m[1].toLowerCase();
    const subPath = (m.groups.path || '').replace(/^\//, '');
    const methodName = m.groups.method;
    const fullPath = (basePath === '/' ? '/' + subPath : (subPath ? basePath + '/' + subPath : basePath))
      .replace(/\/\//g, '/')
      .replace(/\/+$/, '') || '/';
    routes.push({ verb, path: fullPath, methodName, tag, file: relPath(file) });
  }
  return { basePath, tag, routes };
}

function buildOpenApiStatic() {
  const files = walk(BACKEND_SRC);
  const controllers = files.map(extractController).filter(Boolean);
  const paths = {};
  let total = 0;
  for (const c of controllers) {
    for (const r of c.routes) {
      const oasPath = r.path.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, '{$1}');
      if (!paths[oasPath]) paths[oasPath] = {};
      const pathParams = (oasPath.match(/{([^}]+)}/g) || []).map((p) => p.slice(1, -1));
      paths[oasPath][r.verb] = {
        tags: [r.tag],
        operationId: `${r.tag}_${r.methodName}`,
        summary: `${r.verb.toUpperCase()} ${oasPath}`,
        parameters: pathParams.map((name) => ({
          name,
          in: 'path',
          required: true,
          schema: { type: 'string' },
        })),
        responses: { 200: { description: 'OK' } },
        'x-controller-file': r.file,
        'x-method-name': r.methodName,
      };
      total++;
    }
  }
  return {
    openapi: '3.0.3',
    info: {
      title: 'Kloel Backend API (static AST extraction)',
      version: '1.0.0',
      description:
        `Auto-extracted from ${controllers.length} NestJS controllers (${total} routes). ` +
        'Static AST scan, no runtime boot required. For full schema introspection (DTO bodies, ' +
        'response shapes, auth, request validation) start backend and re-run in `extract` mode.',
      'x-extraction': {
        generator: 'scripts/cognitive/openapi-extract.mjs',
        mode: 'static',
        controllers: controllers.length,
        routes: total,
        generatedAt: new Date().toISOString(),
      },
    },
    servers: [
      { url: 'http://localhost:3001', description: 'local backend' },
      { url: 'https://api.kloel.com', description: 'production' },
    ],
    paths,
    components: { schemas: {} },
  };
}

// -------------------------------------------------------------------------
// Modes
// -------------------------------------------------------------------------

function tryNetworkExtract() {
  console.error(`[openapi-extract] fetching live spec from ${SPEC_URL}…`);
  try {
    const result = execSync(`curl -s --max-time 8 "${SPEC_URL}"`, { encoding: 'utf8' });
    const spec = JSON.parse(result);
    if (!spec.paths || Object.keys(spec.paths).length === 0) throw new Error('empty paths');
    spec.info = spec.info || {};
    spec.info['x-extraction'] = {
      generator: 'scripts/cognitive/openapi-extract.mjs',
      mode: 'network',
      source: SPEC_URL,
      generatedAt: new Date().toISOString(),
    };
    return spec;
  } catch (e) {
    console.error(`[openapi-extract] live fetch failed (${e.message}) — falling back to static AST scan`);
    return null;
  }
}

function main() {
  const mode = process.argv[2] || 'extract';

  if (mode === 'extract' || mode === 'static') {
    let spec = mode === 'static' ? null : tryNetworkExtract();
    if (!spec) spec = buildOpenApiStatic();
    writeFileSync(OUT, JSON.stringify(spec, null, 2));
    console.error(
      `[openapi-extract] ${spec.info?.['x-extraction']?.mode || 'unknown'} mode → ${
        Object.keys(spec.paths || {}).length
      } paths → ${OUT.replace(REPO_ROOT + '/', '')}`,
    );
    return;
  }

  if (mode === 'validate') {
    if (!existsSync(OUT)) {
      console.error('No spec found. Run `node scripts/cognitive/openapi-extract.mjs` first.');
      process.exit(1);
    }
    const spec = JSON.parse(readFileSync(OUT, 'utf8'));
    const issues = [];
    for (const [path, methods] of Object.entries(spec.paths || {})) {
      for (const [method, op] of Object.entries(methods)) {
        if (!op.responses) issues.push(`${method.toUpperCase()} ${path}: no responses`);
        if (!op.tags?.length) issues.push(`${method.toUpperCase()} ${path}: no tags`);
      }
    }
    console.log(`Validation: ${issues.length} issues found`);
    issues.slice(0, 20).forEach((i) => console.log(`  - ${i}`));
    return;
  }

  if (mode === 'routes') {
    if (!existsSync(OUT)) {
      console.error('No spec found. Run `node scripts/cognitive/openapi-extract.mjs` first.');
      process.exit(1);
    }
    const spec = JSON.parse(readFileSync(OUT, 'utf8'));
    for (const [path, methods] of Object.entries(spec.paths || {})) {
      for (const method of Object.keys(methods)) {
        console.log(`${method.toUpperCase().padEnd(7)} ${path}`);
      }
    }
    return;
  }

  console.error(`Unknown mode: ${mode}. Valid modes: extract | static | validate | routes`);
  process.exit(2);
}

main();
