import type { Break, PulseConfig, PulseParserDefinition } from './types';

const RESULT_PREFIX = '__PULSE_PARSER_RESULT__';
const PARSER_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function normalizeName(value: string): string {
  return value.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

export function resolveParserFunction(
  parserName: string,
  mod: Record<string, unknown>,
): PulseParserDefinition['fn'] | null {
  const callableEntries = Object.entries(mod).filter(
    (entry): entry is [string, PulseParserDefinition['fn']] => typeof entry[1] === 'function',
  );
  const checkEntries = callableEntries.filter(([name]) => name.startsWith('check'));
  const normalizedParserName = normalizeName(parserName);
  const parserWords = parserName
    .split(/[^a-z0-9]+/i)
    .map(normalizeName)
    .filter(Boolean);
  const matchingCheckEntries = checkEntries.filter(([name]) => {
    const normalizedExportName = normalizeName(name);
    return (
      normalizedExportName.includes(normalizedParserName) ||
      parserWords.every((word) => normalizedExportName.includes(word))
    );
  });

  if (matchingCheckEntries.length === 1) {
    return matchingCheckEntries[0][1];
  }
  if (checkEntries.length === 1) {
    return checkEntries[0][1];
  }
  if (typeof mod.default === 'function') {
    return mod.default as PulseParserDefinition['fn'];
  }
  if (matchingCheckEntries.length > 1) {
    return matchingCheckEntries[0][1];
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
  const fn = resolveParserFunction(parserName, mod);

  if (!fn) {
    writeResult({ ok: false, error: 'Parser module did not export a callable check function.' });
    process.exit(1);
  }

  try {
    const breaks = await fn(config);
    if (!Array.isArray(breaks)) {
      throw new Error(
        `Parser ${parserName} returned ${typeof breaks}; expected an array of Break records.`,
      );
    }
    writeResult({ ok: true, breaks });
  } catch (error: unknown) {
    writeResult({
      ok: false,
      error: error instanceof Error ? error.message : String(error || 'Unknown parser failure'),
    });
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    writeResult({
      ok: false,
      error:
        error instanceof Error ? error.message : String(error || 'Unknown parser worker failure'),
    });
    process.exit(1);
  });
}
