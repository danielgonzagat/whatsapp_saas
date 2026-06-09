#!/usr/bin/env node
import {
  resolveBrowserUrl,
  resolveManagedBrowserUrl,
  normalizedExtraArgs,
  marshalChromeCallResult,
} from '../dist/server-tools-chrome-devtools.js';

const jsonMode = process.argv.includes('--json');
const results = [];

function record(name, ok, detail = {}) {
  results.push({ name, ok: Boolean(ok), detail });
}

function throws(fn, pattern) {
  try {
    fn();
    return false;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return pattern.test(message);
  }
}

record(
  'Chrome bridge accepts configured loopback target browserUrl',
  resolveBrowserUrl({ mode: 'browserUrl', target: 'live' }) === 'http://127.0.0.1:9223',
  {},
);
record(
  'Chrome bridge accepts explicit loopback browserUrl',
  resolveBrowserUrl({ mode: 'browserUrl', browserUrl: 'http://localhost:9222' }) === 'http://localhost:9222',
  {},
);
record(
  'Chrome bridge managed mode resolves the primary target browserUrl',
  resolveManagedBrowserUrl({ mode: 'managed', target: 'primary' }) === 'http://127.0.0.1:9222',
  {},
);
record(
  'Chrome bridge managed mode accepts an explicit loopback browserUrl override',
  resolveManagedBrowserUrl({ mode: 'managed', browserUrl: 'http://localhost:9333' }) === 'http://localhost:9333',
  {},
);
record(
  'Chrome bridge rejects remote browserUrl host',
  throws(() => resolveBrowserUrl({ mode: 'browserUrl', browserUrl: 'http://example.com:9222' }), /loopback/),
  {},
);
record(
  'Chrome bridge rejects browserUrl credentials',
  throws(() => resolveBrowserUrl({ mode: 'browserUrl', browserUrl: 'http://user@127.0.0.1:9222' }), /credentials/),
  {},
);
record(
  'Chrome bridge rejects browserUrl paths',
  throws(() => resolveBrowserUrl({ mode: 'browserUrl', browserUrl: 'http://127.0.0.1:9222/json' }), /origin/),
  {},
);
record(
  'Chrome bridge rejects non-http browserUrl protocol',
  throws(() => resolveBrowserUrl({ mode: 'browserUrl', browserUrl: 'file:///tmp/devtools' }), /protocol|port/),
  {},
);
record(
  'Chrome bridge accepts option-shaped extra args',
  JSON.stringify(normalizedExtraArgs({ extraArgs: ['--foo', '--bar=baz'] })) === JSON.stringify(['--foo', '--bar=baz']),
  {},
);
record(
  'Chrome bridge rejects positional extra args',
  throws(() => normalizedExtraArgs({ extraArgs: ['--ok', 'positional'] }), /extra arg refused/),
  {},
);
record(
  'Chrome bridge rejects control-character extra args',
  throws(() => normalizedExtraArgs({ extraArgs: ['--ok\n--bad'] }), /extra arg refused/),
  {},
);

// ── Content marshaling: the bridge MUST forward MCP block types faithfully ────
// (text stays text, image stays image) instead of burying everything as JSON
// text — the regression that made screenshots invisible and blew the token cap.
const FAKE_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const textOnly = marshalChromeCallResult({
  content: [{ type: 'text', text: 'hello world' }],
  structuredContent: { ok: true },
});
record(
  'marshal forwards a text block verbatim',
  textOnly.content.length === 1 &&
    textOnly.content[0].type === 'text' &&
    textOnly.content[0].text === 'hello world',
);
record('marshal preserves structuredContent', JSON.stringify(textOnly.structuredContent) === JSON.stringify({ ok: true }));

const withImage = marshalChromeCallResult({
  content: [
    { type: 'text', text: 'Took a screenshot of the current page.' },
    { type: 'image', data: FAKE_PNG_B64, mimeType: 'image/png' },
  ],
});
const imgBlock = withImage.content.find((b) => b.type === 'image');
record(
  'marshal forwards an image block as a real image block',
  Boolean(imgBlock) && imgBlock.data === FAKE_PNG_B64 && imgBlock.mimeType === 'image/png',
);
record(
  'marshal preserves block count and order (text then image)',
  withImage.content.length === 2 &&
    withImage.content[0].type === 'text' &&
    withImage.content[1].type === 'image',
);
record(
  'marshal NEVER buries base64 image data inside a text block (the regression)',
  withImage.content.every((b) => b.type !== 'text' || !String(b.text).includes(FAKE_PNG_B64)),
);

const imageNoMime = marshalChromeCallResult({ content: [{ type: 'image', data: FAKE_PNG_B64 }] });
record(
  'marshal defaults a missing image mimeType to image/png',
  imageNoMime.content[0].type === 'image' && imageNoMime.content[0].mimeType === 'image/png',
);

const audio = marshalChromeCallResult({ content: [{ type: 'audio', data: 'AAAA', mimeType: 'audio/wav' }] });
record(
  'marshal forwards an audio block as a real audio block',
  audio.content[0].type === 'audio' && audio.content[0].data === 'AAAA' && audio.content[0].mimeType === 'audio/wav',
);

const resource = marshalChromeCallResult({
  content: [{ type: 'resource', resource: { uri: 'file:///x', text: 'r', mimeType: 'text/plain' } }],
});
record(
  'marshal forwards a resource block verbatim',
  resource.content[0].type === 'resource' && resource.content[0].resource?.uri === 'file:///x',
);

const errorResult = marshalChromeCallResult({ content: [{ type: 'text', text: 'boom' }], isError: true });
record('marshal propagates isError', errorResult.isError === true);

const structuredOnly = marshalChromeCallResult({ structuredContent: { pages: [1, 2] } });
record(
  'marshal emits a JSON text fallback when content is empty but keeps structuredContent',
  structuredOnly.content.length === 1 &&
    structuredOnly.content[0].type === 'text' &&
    JSON.stringify(structuredOnly.structuredContent) === JSON.stringify({ pages: [1, 2] }),
);

const garbage = marshalChromeCallResult(null);
record(
  'marshal tolerates a null/garbage result without throwing',
  Array.isArray(garbage.content) && garbage.content.length >= 1 && garbage.content[0].type === 'text',
);

const payload = { ok: results.every((result) => result.ok), results };
if (jsonMode) console.log(JSON.stringify(payload, null, 2));
else for (const result of results) console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.name}`);
if (!payload.ok) process.exit(1);
