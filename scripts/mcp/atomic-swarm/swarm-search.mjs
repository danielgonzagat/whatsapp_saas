/**
 * swarm_web_search — web search with a verifiable receipt, built on swarm_fetch.
 *
 * Engine: DuckDuckGo HTML endpoint (keyless). Parsing a third-party HTML shape
 * is inherently fragile; the receipt therefore records the sha256 of the raw
 * page so any result list can be re-derived from the exact bytes and audited.
 * Parse failure returns ok:false with the fetch receipt — results are never
 * fabricated.
 */
import { appendLedger, refusal } from './swarm-core.mjs';
import { swarmFetch } from './swarm-fetch.mjs';

export async function swarmWebSearch({ query, maxResults = 10 } = {}) {
  const q = String(query ?? '').trim();
  if (!q) throw refusal('swarm_web_search refused: empty query');
  const target = new URL('https://html.duckduckgo.com/html/');
  target.searchParams.set('q', q);
  const fetched = await swarmFetch({
    url: target.href,
    headers: { 'user-agent': 'Mozilla/5.0 (atomic-swarm)', accept: 'text/html' },
  });
  const limit = Math.max(1, Math.min(25, Number(maxResults) || 10));
  const results = [];
  if (fetched.bodyText) {
    const anchorRe = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let match;
    while (results.length < limit && (match = anchorRe.exec(fetched.bodyText)) !== null) {
      const url = decodeDuckUrl(match[1]);
      const title = stripTags(match[2]);
      if (url && title) results.push({ title, url });
    }
  }
  const receipt = {
    tool: 'swarm_web_search',
    query: q,
    engine: 'duckduckgo-html',
    pageSha256: fetched.receipt.bodySha256,
    resultCount: results.length,
    status: fetched.receipt.status,
  };
  appendLedger('swarm-search-ledger.jsonl', receipt);
  return { ok: fetched.ok && results.length > 0, receipt, results, fetchReceipt: fetched.receipt };
}

function decodeDuckUrl(raw) {
  try {
    const href = raw.startsWith('//') ? `https:${raw}` : raw;
    const parsed = new URL(href, 'https://duckduckgo.com');
    const uddg = parsed.searchParams.get('uddg');
    if (uddg) return decodeURIComponent(uddg);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
    return null;
  } catch {
    return null;
  }
}

function stripTags(html) {
  return String(html)
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}
