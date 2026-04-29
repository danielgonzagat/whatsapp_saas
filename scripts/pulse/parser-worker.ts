import type { Break, PulseConfig, PulseParserDefinition } from './types';

const RESULT_PREFIX = '__PULSE_PARSER_RESULT__';
const PARSER_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function resolveParserFunction(mod: Record<string, unknown>): PulseParserDefinition['fn'] | null {
  if (typeof mod.default === 'function') {
    return mod.default as PulseParserDefinition['fn'];
  }
  for (const value of Object.values(mod)) {
    if (typeof value === 'function') {
      return value as PulseParserDefinition['fn'];
    }
  }
  return null;
}

function writeResult(payload: { ok: true; breaks: Break[] } | { ok: false; error: string }): void {
  process.stdout.write(`${RESULT_PREFIX}${JSON.stringify(payload)}\n`);
}

async function main(): Promise<void> {
  const parserName = process.argv[2] || '';
  const encodedConfig = process.argv[3] || '';

  if (!PARSER_NAME_RE.test(parserName)) {
    writeResult({ ok: false, error: 'Parser module name failed safe-identifier validation.' });
    process.exit(1);
  }

  const decoded = Buffer.from(encodedConfig, 'base64url').toString('utf8');
  const config = JSON.parse(decoded) as PulseConfig;
  const mod = require(`./parsers/${parserName}`) as Record<string, unknown>;
  const fn = resolveParserFunction(mod);

  if (!fn) {
    writeResult({ ok: false, error: 'Parser module did not export a callable check function.' });
    process.exit(1);
  }

  try {
    const breaks = await fn(config);
    writeResult({ ok: true, breaks });
  } catch (error: unknown) {
    writeResult({
      ok: false,
      error: error instanceof Error ? error.message : String(error || 'Unknown parser failure'),
    });
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  writeResult({
    ok: false,
    error:
      error instanceof Error ? error.message : String(error || 'Unknown parser worker failure'),
  });
  process.exit(1);
});
