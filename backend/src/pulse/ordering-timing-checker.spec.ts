import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { checkOrderingTiming } from '../../../scripts/pulse/parsers/ordering-timing-checker';
import type { PulseConfig } from '../../../scripts/pulse/types';

function writeFile(rootDir: string, relativePath: string, content: string) {
  const filePath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

describe('checkOrderingTiming webhook ordering detection', () => {
  it('flags inbound webhook handlers but skips helpers and classifiers', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-ordering-'));

    try {
      writeFile(
        rootDir,
        'backend/src/common/utils/webhook-challenge-response.util.ts',
        `
        export function sanitizeWebhookChallenge(value: string) {
          return value.trim();
        }
        `,
      );
      writeFile(
        rootDir,
        'backend/src/queue/webhook-classifier.ts',
        `
        export function classifyWebhook(webhook: string) {
          return webhook.includes('slack') ? 'slack' : 'generic';
        }
        `,
      );
      writeFile(
        rootDir,
        'backend/src/webhooks/payment-webhook.controller.ts',
        `
        import { Controller, Post, Req } from '@nestjs/common';

        @Controller('webhooks/payment')
        export class PaymentWebhookController {
          @Post()
          async handleWebhook(@Req() req: { body: { event: string } }) {
            await prisma.payment.update({
              where: { id: req.body.event },
              data: { status: 'paid' },
            });
          }
        }
        `,
      );

      const config: PulseConfig = {
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

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(
        expect.objectContaining({
          source: 'parser:weak_signal:temporal-consistency',
          surface: 'temporal-correctness',
        }),
      );
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });
});
