import { spawnSync } from 'child_process';
import * as path from 'path';

interface OrderingTimingFixtureResult {
  readonly count: number;
  readonly first: {
    readonly source: string;
    readonly surface: string;
  };
}

function runOrderingTimingFixture(): OrderingTimingFixtureResult {
  const repoRoot = path.resolve(__dirname, '../../..');
  const script = String.raw`
const fs = require('fs');
const os = require('os');
const path = require('path');
const ts = require('typescript');

const repoRoot = process.cwd();
require.extensions['.ts'] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const { checkOrderingTiming } = require(path.join(
  repoRoot,
  'scripts/pulse/parsers/ordering-timing-checker.ts',
));

function writeFile(rootDir, relativePath, content) {
  const filePath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-ordering-'));
try {
  writeFile(
    rootDir,
    'backend/src/common/utils/webhook-challenge-response.util.ts',
    "\nexport function sanitizeWebhookChallenge(value: string) {\n  return value.trim();\n}\n",
  );
  writeFile(
    rootDir,
    'backend/src/queue/webhook-classifier.ts',
    "\nexport function classifyWebhook(webhook: string) {\n  return webhook.includes('slack') ? 'slack' : 'generic';\n}\n",
  );
  writeFile(
    rootDir,
    'backend/src/webhooks/payment-webhook.controller.ts',
    "\nimport { Controller, Post, Req } from '@nestjs/common';\n\n@Controller('webhooks/payment')\nexport class PaymentWebhookController {\n  @Post()\n  async handleWebhook(@Req() req: { body: { event: string } }) {\n    await prisma.payment.update({\n      where: { id: req.body.event },\n      data: { status: 'paid' },\n    });\n  }\n}\n",
  );

  const config = {
    rootDir,
    frontendDir: path.join(rootDir, 'frontend/src'),
    backendDir: path.join(rootDir, 'backend/src'),
    workerDir: path.join(rootDir, 'worker/src'),
    schemaPath: path.join(rootDir, 'backend/prisma/schema.prisma'),
    globalPrefix: '',
  };

  const results = checkOrderingTiming(config).filter(
    (item) =>
      item.type === 'temporal-consistency-evidence-gap' &&
      item.file === 'backend/src/webhooks/payment-webhook.controller.ts',
  );

  process.stdout.write(
    JSON.stringify({
      count: results.length,
      first: {
        source: results[0]?.source ?? null,
        surface: results[0]?.surface ?? null,
      },
    }),
  );
} finally {
  fs.rmSync(rootDir, { recursive: true, force: true });
}
`;

  const result = spawnSync(process.execPath, ['--max-old-space-size=8192', '-e', script], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'test' },
    maxBuffer: 1024 * 1024,
  });

  if (result.status !== 0) {
    throw new Error(`ordering timing fixture failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }

  return JSON.parse(result.stdout) as OrderingTimingFixtureResult;
}

describe('checkOrderingTiming webhook ordering detection', () => {
  it('flags inbound webhook handlers but skips helpers and classifiers', () => {
    const results = runOrderingTimingFixture();

    expect(results.count).toBe(1);
    expect(results.first).toEqual(
      expect.objectContaining({
        source: 'parser:weak_signal:temporal-consistency',
        surface: 'temporal-correctness',
      }),
    );
  });
});
