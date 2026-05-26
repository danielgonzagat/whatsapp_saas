// Next.js (App Router + Pages Router) scanner — maps URL routes to source
// files. Best-effort, regex-based, repo-aware.

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const APP_ENTRY_NAMES = ['page.tsx', 'page.ts', 'page.jsx', 'page.js'];
const PAGES_DIR_NAMES = ['pages'];

function walk(root) {
  const out = [];
  function recurse(dir) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      if (e.name === 'node_modules') continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) recurse(p);
      else if (e.isFile()) out.push(p);
    }
  }
  recurse(root);
  return out;
}

function appRouterRouteFromFile(file, appRoot) {
  const rel = relative(appRoot, file).split(sep).join('/');
  const base = rel.replace(/\/page\.(tsx|ts|jsx|js)$/, '');
  if (!base) return '/';
  const parts = base
    .split('/')
    .filter((seg) => !seg.startsWith('(') && seg !== '');
  return '/' + parts.join('/');
}

function pagesRouterRouteFromFile(file, pagesRoot) {
  const rel = relative(pagesRoot, file).split(sep).join('/');
  const base = rel.replace(/\.(tsx|ts|jsx|js)$/, '');
  if (base === 'index') return '/';
  return '/' + base.replace(/\/index$/, '');
}

export function createReactScanner({ workspaceRoot }) {
  const frontendDir = join(workspaceRoot, 'frontend');
  const appDir = join(frontendDir, 'src', 'app');
  const pagesDir = join(frontendDir, 'src', 'pages');

  function listRoutes() {
    const routes = [];
    if (existsSync(appDir) && statSync(appDir).isDirectory()) {
      for (const file of walk(appDir)) {
        const base = file.split(sep).pop();
        if (APP_ENTRY_NAMES.includes(base)) {
          const route = appRouterRouteFromFile(file, appDir);
          routes.push({ kind: 'app', route, file: relative(workspaceRoot, file).split(sep).join('/') });
        }
      }
    }
    if (existsSync(pagesDir) && statSync(pagesDir).isDirectory()) {
      for (const file of walk(pagesDir)) {
        if (!/\.(tsx|ts|jsx|js)$/.test(file)) continue;
        if (file.includes('/api/')) continue;
        const route = pagesRouterRouteFromFile(file, pagesDir);
        routes.push({ kind: 'pages', route, file: relative(workspaceRoot, file).split(sep).join('/') });
      }
    }
    return { ok: true, routes };
  }

  function findRoute(route) {
    const norm = '/' + (route || '').replace(/^\/+/, '');
    const { routes } = listRoutes();
    const exact = routes.filter((r) => r.route === norm);
    if (exact.length) return { ok: true, matches: exact };
    const partial = routes.filter((r) => r.route.toLowerCase().includes(norm.toLowerCase()));
    return { ok: true, matches: partial };
  }

  function listApiProxies() {
    // Frontend route handlers under app/api/** that proxy to backend.
    const apiRoot = join(frontendDir, 'src', 'app', 'api');
    if (!existsSync(apiRoot)) return { ok: true, proxies: [] };
    const proxies = [];
    for (const file of walk(apiRoot)) {
      const base = file.split(sep).pop();
      if (!/^route\.(ts|js|tsx|jsx)$/.test(base)) continue;
      const rel = relative(apiRoot, file).replace(/\/route\.(ts|js|tsx|jsx)$/, '');
      const path = '/api/' + rel.split(sep).join('/');
      proxies.push({ file: relative(workspaceRoot, file).split(sep).join('/'), path });
    }
    return { ok: true, proxies };
  }

  return { listRoutes, findRoute, listApiProxies };
}
