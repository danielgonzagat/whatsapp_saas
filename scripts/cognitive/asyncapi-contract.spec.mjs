#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { strictEqual, ok } from 'node:assert';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const specPath = resolve(root, 'tools/asyncapi/asyncapi-spec.json');
const spec = JSON.parse(readFileSync(specPath, 'utf8'));

const requiredEvents = [
  'commerce.product.published',
  'commerce.product.deleted',
  'commerce.checkout.updated',
  'commerce.coupon.created',
  'commerce.coupon.updated',
  'commerce.coupon.deleted',
];

for (const requiredEvent of requiredEvents) {
  const requiredMessage = requiredEvent.replace(/[.:]/g, '_');

  ok(spec.channels?.[requiredEvent], `${requiredEvent} channel must be exposed to Cognitive Hub`);
  strictEqual(spec.channels[requiredEvent].parameters?.domain, 'commerce');
  strictEqual(spec.channels[requiredEvent].publish?.summary, requiredEvent);
  strictEqual(
    spec.channels[requiredEvent].publish?.message?.$ref,
    `#/components/messages/${requiredMessage}`,
  );

  ok(spec.components?.messages?.[requiredMessage], `${requiredMessage} message must exist`);
  strictEqual(spec.components.messages[requiredMessage].name, requiredEvent);
  strictEqual(
    spec.components.messages[requiredMessage].payload?.properties?.eventName?.const,
    requiredEvent,
  );
}

process.stderr.write(`PASS asyncapi contract exposes ${requiredEvents.join(', ')}\n`);
