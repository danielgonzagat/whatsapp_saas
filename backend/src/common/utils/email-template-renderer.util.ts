import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { escapeHtml } from './html-escape.util';

const TEMPLATE_DIR = join(__dirname, '..', '..', 'auth', 'email-templates');
const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

const TEMPLATE_CACHE = new Map<string, string>();

function loadTemplate(name: string): string {
  const cached = TEMPLATE_CACHE.get(name);
  if (cached) return cached;
  const source = readFileSync(join(TEMPLATE_DIR, `${name}.html`), 'utf8');
  TEMPLATE_CACHE.set(name, source);
  return source;
}

export function renderEmailTemplate(name: string, vars: Record<string, string>): string {
  const source = loadTemplate(name);
  return source.replace(PLACEHOLDER_RE, (_match, key: string) => {
    if (key in vars) return escapeHtml(vars[key]);
    return '';
  });
}
