import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { escapeHtml } from './html-escape.util';

const TEMPLATE_DIR = join(__dirname, '..', '..', 'auth', 'email-templates');
const ESCAPED_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
const RAW_RE = /\{\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}\}/g;

const TEMPLATE_CACHE = new Map<string, string>();

function loadTemplate(name: string): string {
  const cached = TEMPLATE_CACHE.get(name);
  if (cached) return cached;
  const source = readFileSync(join(TEMPLATE_DIR, `${name}.html`), 'utf8');
  TEMPLATE_CACHE.set(name, source);
  return source;
}

function resolveVariable(vars: Record<string, string>, key: string): string {
  return vars[key] ?? '';
}

export function renderEmailTemplate(name: string, vars: Record<string, string>): string {
  const source = loadTemplate(name);
  const withRaw = source.replace(RAW_RE, (_match, key: string) => resolveVariable(vars, key));
  return withRaw.replace(ESCAPED_RE, (_match, key: string) =>
    escapeHtml(resolveVariable(vars, key)),
  );
}
