import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildAPIFuzzCatalog } from '../api-fuzzer';
import { scanForExistingPropertyTests } from '../property-tester';

const previousFuzzBaseUrl = process.env.PULSE_API_FUZZ_BASE_URL;
const previousPath = process.env.PATH;

afterEach(() => {
  if (previousFuzzBaseUrl === undefined) {
    delete process.env.PULSE_API_FUZZ_BASE_URL;
  } else {
    process.env.PULSE_API_FUZZ_BASE_URL = previousFuzzBaseUrl;
  }
  process.env.PATH = previousPath;
});

function makeTempRoot(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(root: string, relativePath: string, content: string): void {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function writeExecutable(root: string, relativePath: string, content: string): void {
  writeFile(root, relativePath, content);
  fs.chmodSync(path.join(root, relativePath), 0o755);
}

describe('PULSE property/fuzz observed evidence', () => {
  it('marks discovered property tests as passed only after a local runner exits cleanly', () => {
    const root = makeTempRoot('pulse-property-observed-');
    writeExecutable(
      root,
      'node_modules/.bin/vitest',
      '#!/bin/sh\nprintf "property suite passed\\n"\nexit 0\n',
    );
    writeFile(
      root,
      'src/math.property.ts',
      `
        import fc from 'fast-check';
        fc.assert(fc.property(fc.integer(), (value) => Number.isInteger(value)));
      `,
    );

    const scanned = scanForExistingPropertyTests(root);

    expect(scanned).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: 'src/math.property.ts',
          status: 'passed',
          failures: 0,
        }),
      ]),
    );
  });

  it('records failed property runner output as observed failure evidence', () => {
    const root = makeTempRoot('pulse-property-failed-');
    writeExecutable(
      root,
      'node_modules/.bin/vitest',
      '#!/bin/sh\nprintf "counterexample found\\n" >&2\nexit 1\n',
    );
    writeFile(
      root,
      'src/math.property.ts',
      `
        import fc from 'fast-check';
        fc.assert(fc.property(fc.integer(), (value) => value > 0));
      `,
    );

    const scanned = scanForExistingPropertyTests(root);

    expect(scanned[0]).toEqual(
      expect.objectContaining({
        status: 'failed',
        failures: 1,
      }),
    );
    expect(JSON.stringify(scanned[0]?.counterexamples)).toContain('counterexample found');
  });

  it('marks local API fuzz auth probes as observed when a local curl probe runs', () => {
    const root = makeTempRoot('pulse-fuzz-observed-');
    writeExecutable(
      root,
      'bin/curl',
      [
        '#!/bin/sh',
        'if [ "$1" = "--version" ]; then',
        '  printf "curl 8.0.0\\n"',
        '  exit 0',
        'fi',
        'printf "403"',
        'exit 0',
        '',
      ].join('\n'),
    );
    writeFile(
      root,
      'backend/src/widget.controller.ts',
      `
        @Controller('widgets')
        export class WidgetController {
          @UseGuards(AuthGuard)
          @Get(':id')
          show() {
            return {};
          }
        }
      `,
    );

    process.env.PATH = `${path.join(root, 'bin')}:${previousPath}`;
    process.env.PULSE_API_FUZZ_BASE_URL = 'http://127.0.0.1:1';

    const evidence = buildAPIFuzzCatalog(root);
    const authStatuses = evidence.probes.flatMap((probe) =>
      probe.authTests.map((test) => test.status),
    );

    expect(evidence.summary.probedEndpoints).toBe(1);
    expect(evidence.summary.authTestedEndpoints).toBe(1);
    expect(authStatuses).toEqual(['passed', 'passed', 'passed']);
  });
});
