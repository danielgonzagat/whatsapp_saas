const HTML_ESCAPE_BY_CHARACTER: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeEmailHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPE_BY_CHARACTER[char] ?? char);
}

export function renderEmailLine(line: string): string {
  const trimmed = line.trim();
  return trimmed ? '<p>' + escapeEmailHtml(trimmed) + '</p>' : '<br/>';
}
