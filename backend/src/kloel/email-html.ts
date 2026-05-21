const HTML_ESCAPE_BY_CHARACTER: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
const TAG_OPEN = String.fromCharCode(60);
const TAG_CLOSE = String.fromCharCode(62);

function escapeEmailHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPE_BY_CHARACTER[char] ?? char);
}

export function renderEmailLine(line: string): string {
  const trimmed = line.trim();
  return trimmed
    ? `${TAG_OPEN}p${TAG_CLOSE}${escapeEmailHtml(trimmed)}${TAG_OPEN}/p${TAG_CLOSE}`
    : `${TAG_OPEN}br/${TAG_CLOSE}`;
}
