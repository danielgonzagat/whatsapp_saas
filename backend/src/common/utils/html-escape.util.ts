/**
 * Escape HTML special characters to prevent XSS in server-rendered HTML
 * (email templates, etc.). Handles the OWASP-recommended set of characters.
 */
const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
};

const HTML_ESCAPE_RE = /[&<>"']/g;

/** Escape html. */
export function escapeHtml(value: string): string {
  return value.replace(HTML_ESCAPE_RE, (char) => HTML_ESCAPE_MAP[char] || char);
}
