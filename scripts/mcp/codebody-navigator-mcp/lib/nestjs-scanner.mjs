// NestJS scanner — finds @Controller / @Get / @Post / @Put / @Patch / @Delete
// declarations and resolves the HTTP route prefix per file.

import { rg } from './ripgrep.mjs';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const HTTP_METHODS = ['Get', 'Post', 'Put', 'Patch', 'Delete', 'Options', 'Head', 'All'];

function extractFirstArg(text) {
  // Expects substring after '(' — returns the literal between the first matched
  // quotes or empty string if none.
  const m = text.match(/['"`]([^'"`]*)['"`]/);
  return m ? m[1] : '';
}

function joinRoute(prefix, sub) {
  const cleanPrefix = (prefix || '').replace(/^\/+|\/+$/g, '');
  const cleanSub = (sub || '').replace(/^\/+|\/+$/g, '');
  if (!cleanPrefix && !cleanSub) return '/';
  if (!cleanPrefix) return `/${cleanSub}`;
  if (!cleanSub) return `/${cleanPrefix}`;
  return `/${cleanPrefix}/${cleanSub}`;
}

export function createNestJsScanner({ workspaceRoot }) {
  const backendDir = join(workspaceRoot, 'backend', 'src');

  function listControllers() {
    const r = rg(String.raw`@Controller\s*\(`, { cwd: backendDir, paths: ['.'], globs: ['*.ts'] });
    const controllers = [];
    for (const m of r.matches) {
      const prefix = extractFirstArg(m.text.slice(m.text.indexOf('(')));
      controllers.push({ file: join('backend/src', m.file), line: m.line, prefix, raw: m.text.trim() });
    }
    return { ok: true, controllers };
  }

  function listEndpoints({ method = null } = {}) {
    const normalize = (v) => (v ? v[0].toUpperCase() + v.slice(1).toLowerCase() : v);
    const methods = method ? [normalize(method)] : HTTP_METHODS;
    const endpoints = [];
    for (const m of methods) {
      const r = rg(String.raw`@${m}\s*\(`, { cwd: backendDir, paths: ['.'], globs: ['*.ts'] });
      for (const hit of r.matches) {
        endpoints.push({
          method: m.toUpperCase(),
          file: join('backend/src', hit.file),
          line: hit.line,
          raw: hit.text.trim(),
          path: extractFirstArg(hit.text.slice(hit.text.indexOf('('))),
        });
      }
    }
    return { ok: true, endpoints };
  }

  /** Resolve `METHOD /path` to the file:line where the handler lives. */
  function resolveRoute(method, path) {
    const targetMethod = (method || 'GET').toUpperCase();
    const wanted = `/${(path || '').replace(/^\/+/, '')}`;
    const controllers = listControllers().controllers;
    const endpoints = listEndpoints({ method: targetMethod }).endpoints;

    const fileToPrefix = new Map();
    for (const c of controllers) fileToPrefix.set(c.file, c.prefix || '');

    const matches = [];
    for (const ep of endpoints) {
      const prefix = fileToPrefix.get(ep.file) || '';
      const full = joinRoute(prefix, ep.path);
      // Normalize :params to allow path matching with parameters.
      const fullNorm = full.replace(/\/:[^/]+/g, '/:p');
      const wantedNorm = wanted.replace(/\/:[^/]+/g, '/:p');
      if (fullNorm === wantedNorm || full === wanted) {
        matches.push({ ...ep, prefix, fullPath: full });
      } else if (full.toLowerCase().includes(wanted.toLowerCase())) {
        matches.push({ ...ep, prefix, fullPath: full, partial: true });
      }
    }
    return { ok: true, matches };
  }

  /**
   * For a controller file, read the source and pair @httpMethod() decorators
   * with the next non-decorator method declaration.
   */
  function readControllerEndpoints(controllerFile) {
    const abs = resolve(workspaceRoot, controllerFile);
    let text;
    try {
      text = readFileSync(abs, 'utf8');
    } catch (err) {
      return { ok: false, error: err.message };
    }
    const lines = text.split(/\r?\n/);
    const prefix = (() => {
      const m = text.match(/@Controller\s*\(\s*['"`]([^'"`]*)['"`]/);
      return m ? m[1] : '';
    })();
    const endpoints = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const verb of HTTP_METHODS) {
        const re = new RegExp(`@${verb}\\s*\\(`);
        if (re.test(line)) {
          const sub = extractFirstArg(line.slice(line.indexOf('(')));
          // Find the next method-looking line.
          let handlerName = null;
          for (let j = i + 1; j < Math.min(lines.length, i + 8); j++) {
            const candidate = lines[j].trim();
            if (!candidate || candidate.startsWith('@')) continue;
            const mn = candidate.match(/(?:public\s+|private\s+|protected\s+|async\s+)*([A-Za-z_$][\w$]*)\s*\(/);
            if (mn) {
              handlerName = mn[1];
              break;
            }
          }
          endpoints.push({
            method: verb.toUpperCase(),
            sub,
            line: i + 1,
            fullPath: joinRoute(prefix, sub),
            handlerName,
          });
        }
      }
    }
    return { ok: true, prefix, endpoints };
  }

  return { listControllers, listEndpoints, resolveRoute, readControllerEndpoints };
}
