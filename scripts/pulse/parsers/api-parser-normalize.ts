/** Normalize a raw endpoint string to a canonical path. */
export function normalizeEndpoint(raw: string): string {
  let p = raw;

  // Strip query string builders with nested braces: ${buildQuery({ workspaceId })}
  // These use nested {} so we can't just match [^}]* — strip from ${ to end if it's buildQuery/qs/query
  // Use [\s\S]* instead of .* to handle multiline template literals
  p = p.replace(/\$\{buildQuery\b[\s\S]*$/g, '');
  p = p.replace(/\$\{(?:qs|query|q|search|queryString|params)\b[^}]*\}?/gi, '');
  // Also handle incomplete template literals where backtick was split: /sales${q
  p = p.replace(/\$\{\w+$/g, '');

  // Replace ${encodeURIComponent(varName)} with :varName
  p = p.replace(/\$\{encodeURIComponent\((\w+)\)\}/g, ':$1');

  // Replace remaining ${varName} with :varName (path params)
  p = p.replace(/\$\{(\w+)\}/g, ':$1');

  // Replace complex expressions ${...} with :param
  p = p.replace(/\$\{[^}]+\}/g, ':param');

  // Strip query string (anything after ?)
  p = p.split('?')[0];

  // Clean trailing junk from template literal artifacts: ), }, etc.
  p = p.replace(/[\)\}\]]+$/, '');

  // Clean up trailing/double slashes
  p = p.replace(/\/+$/, '');
  if (!p.startsWith('/')) {
    p = '/' + p;
  }
  return p.replace(/\/+/g, '/');
}
