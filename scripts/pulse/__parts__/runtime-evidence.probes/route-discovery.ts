import * as fs from 'fs';
import * as path from 'path';

export interface DiscoveredHttpRoute {
  method: string;
  path: string;
  file: string;
  guarded: boolean;
}

export function normalizeRoutePath(routePath: string): string {
  const normalized = routePath
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('/');
  return `/${normalized}`;
}

export function listTypeScriptFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' || entry.name === 'dist'
        ? []
        : listTypeScriptFiles(fullPath);
    }
    return entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')
      ? [fullPath]
      : [];
  });
}

export function readOptionalText(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

export function parseDecoratorPath(source: string, decoratorName: string): string | null {
  const decoratorIndex = source.indexOf(`@${decoratorName}`);
  if (decoratorIndex === -1) {
    return null;
  }
  const openParen = source.indexOf('(', decoratorIndex);
  const closeParen = openParen === -1 ? -1 : source.indexOf(')', openParen);
  if (openParen === -1 || closeParen === -1) {
    return '';
  }
  const rawArgument = source.slice(openParen + 1, closeParen).trim();
  const quoted = /^['"`]([^'"`]*)['"`]$/.exec(rawArgument);
  return quoted?.[1] ?? '';
}

export function discoverBackendRoutes(rootDir: string = process.cwd()): DiscoveredHttpRoute[] {
  const backendSourceDir = path.join(rootDir, 'backend', 'src');
  const methodDecorators = new Map([
    ['Get', 'GET'],
    ['Post', 'POST'],
    ['Put', 'PUT'],
    ['Patch', 'PATCH'],
    ['Delete', 'DELETE'],
  ]);
  const routes: DiscoveredHttpRoute[] = [];

  for (const file of listTypeScriptFiles(backendSourceDir)) {
    const source = readOptionalText(file);
    const controllerBase = parseDecoratorPath(source, 'Controller');
    if (controllerBase === null) {
      continue;
    }
    const guarded = source.includes('@UseGuards') || source.includes('Guard)');
    const lines = source.split('\n');
    for (const line of lines) {
      for (const [decoratorName, method] of methodDecorators) {
        const routePart = parseDecoratorPath(line, decoratorName);
        if (routePart === null) {
          continue;
        }
        routes.push({
          method,
          path: normalizeRoutePath([controllerBase, routePart].filter(Boolean).join('/')),
          file,
          guarded,
        });
      }
    }
  }

  return routes;
}

export function routeLooksLikeHealthCapability(route: DiscoveredHttpRoute): boolean {
  const evidence = `${route.path} ${path.basename(route.file)}`.toLowerCase();
  return route.method === 'GET' && (evidence.includes('health') || evidence.includes('ping'));
}

export function routeLooksUsableAfterAuth(route: DiscoveredHttpRoute): boolean {
  return route.method === 'GET' && route.guarded && !routeLooksLikeHealthCapability(route);
}

export function selectHealthProbePaths(): string[] {
  return discoverBackendRoutes()
    .filter(routeLooksLikeHealthCapability)
    .map((route) => route.path)
    .sort((left, right) => left.length - right.length);
}

export function selectAuthenticatedReadPaths(): string[] {
  const routes = discoverBackendRoutes()
    .filter(routeLooksUsableAfterAuth)
    .map((route) => route.path)
    .filter((routePath) => !routePath.includes(':'))
    .sort((left, right) => left.length - right.length);
  return [...new Set(routes)];
}
