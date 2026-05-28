#!/usr/bin/env node
/**
 * Kloel AsyncAPI Extractor — preserves the enriched event spine catalog and
 * folds in production EventEmitter2 lifecycle events discovered in code.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const OUT = resolve(ROOT, 'tools/asyncapi/asyncapi-spec.json');

const DOMAIN_EVENT_BRIDGES = new Map([
  ['product.created', 'commerce.product.created'],
  ['product.updated', 'commerce.product.updated'],
  ['product.published', 'commerce.product.published'],
  ['product.deleted', 'commerce.product.deleted'],
  ['checkout.updated', 'commerce.checkout.updated'],
  ['coupon.created', 'commerce.coupon.created'],
  ['coupon.updated', 'commerce.coupon.updated'],
  ['coupon.deleted', 'commerce.coupon.deleted'],
]);

function readExistingEvents() {
  if (!existsSync(OUT)) return new Set();

  try {
    const spec = JSON.parse(readFileSync(OUT, 'utf8'));
    return new Set(Object.keys(spec.channels || {}));
  } catch {
    return new Set();
  }
}

function canonicalEventName(eventName) {
  return DOMAIN_EVENT_BRIDGES.get(eventName) || eventName;
}

function eventDomain(eventName) {
  return eventName.split('.')[0] || 'runtime';
}

function eventTitle(eventName) {
  return eventName.split('.').at(-1) || eventName;
}

function messageKey(eventName) {
  return eventName.replace(/[.:]/g, '_');
}

function buildChannel(eventName) {
  const domain = eventDomain(eventName);

  return {
    description: `${domain} domain event`,
    parameters: {
      domain,
    },
    publish: {
      summary: eventName,
      message: {
        $ref: `#/components/messages/${messageKey(eventName)}`,
      },
    },
  };
}

function buildMessage(eventName) {
  const domain = eventDomain(eventName);

  return {
    name: eventName,
    title: eventTitle(eventName),
    summary: `${domain} event`,
    payload: {
      type: 'object',
      properties: {
        eventName: {
          type: 'string',
          const: eventName,
        },
        workspaceId: {
          type: 'string',
        },
        timestamp: {
          type: 'string',
          format: 'date-time',
        },
        payload: {
          type: 'object',
          description: 'Event-specific payload (see spine-event.types.ts)',
        },
      },
    },
  };
}

function collectEmitterEvents(files) {
  const eventNames = new Set();

  for (const file of files) {
    try {
      const content = readFileSync(file, 'utf8');
      const onEventMatches = content.matchAll(/@OnEvent\(['"]([^'"]+)['"]\)/g);
      for (const match of onEventMatches) eventNames.add(canonicalEventName(match[1]));

      const emitMatches = content.matchAll(/\.emit\(['"]([^'"]+)['"]/g);
      for (const match of emitMatches) eventNames.add(canonicalEventName(match[1]));
    } catch {
      // Keep extraction best-effort; contract validation catches missing events.
    }
  }

  return eventNames;
}

function collectCapabilityRegistryEvents(files) {
  const eventNames = new Set();

  for (const file of files) {
    try {
      const content = readFileSync(file, 'utf8');
      const emitsBlocks = content.matchAll(/emits:\s*\[([\s\S]*?)\]/g);
      for (const blockMatch of emitsBlocks) {
        const emitMatches = blockMatch[1].matchAll(/['\"]([^'\"]+)['\"]/g);
        for (const match of emitMatches) eventNames.add(canonicalEventName(match[1]));
      }
    } catch {
      // Registry emit declarations are contract input; validation catches missing output.
    }
  }

  return eventNames;
}

function buildSpec(eventNames) {
  const events = [...eventNames].sort();
  const domains = new Set(events.map(eventDomain));
  const channels = {};
  const messages = {};

  for (const eventName of events) {
    channels[eventName] = buildChannel(eventName);
    messages[messageKey(eventName)] = buildMessage(eventName);
  }

  return {
    asyncapi: '2.6.0',
    info: {
      title: 'Kloel Event Spine',
      version: '1.0.0',
      description: `Auto-extracted event contracts. ${events.length} events across ${domains.size} domains.`,
    },
    servers: {
      spine: {
        url: 'spine://backend',
        protocol: 'nestjs-event-emitter2',
        description: 'In-process event spine via NestJS EventEmitter2',
      },
      bullmq: {
        url: 'bullmq://worker',
        protocol: 'bullmq',
        description: 'Async job processing via BullMQ + Redis',
      },
    },
    channels,
    components: {
      messages,
      schemas: {},
    },
  };
}

async function main() {
  const { execSync } = await import('child_process');

  const emitFiles = execSync(
    `grep -r "EventEmitter2\\|this\\.eventEmitter\\.emit\\|@OnEvent" ${ROOT}/backend/src --include="*.ts" -l 2>/dev/null || true`,
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
  )
    .trim()
    .split('\n')
    .filter(Boolean);

  const workerQueues = execSync(
    `grep -r "Queue\\|Process\\|processJob\\|BullModule\\.registerQueue" ${ROOT}/worker --include="*.ts" -l 2>/dev/null || true`,
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
  )
    .trim()
    .split('\n')
    .filter(Boolean);

  const capabilityRegistryFiles = execSync(
    `grep -r "emits:" ${ROOT}/backend/src/kloel/capability-registry-v2 --include="*.ts" -l 2>/dev/null || true`,
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
  )
    .trim()
    .split('\n')
    .filter(Boolean);

  const eventNames = readExistingEvents();
  const bridgedEvents = new Set(DOMAIN_EVENT_BRIDGES.values());
  for (const eventName of collectCapabilityRegistryEvents(capabilityRegistryFiles)) {
    eventNames.add(eventName);
  }

  for (const eventName of collectEmitterEvents(emitFiles)) {
    if (eventNames.has(eventName) || bridgedEvents.has(eventName)) {
      eventNames.add(eventName);
    }
  }

  const spec = buildSpec(eventNames);
  const outDir = resolve(ROOT, 'tools/asyncapi');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(spec, null, 2)}\n`);

  console.log(`✅ AsyncAPI spec: ${eventNames.size} events`);
  console.log(`   Emitter files: ${emitFiles.length}`);
  console.log(`   Capability registry files: ${capabilityRegistryFiles.length}`);
  console.log(`   Worker queues: ${workerQueues.length}`);
  console.log(`   Output: ${OUT}`);
  if (eventNames.size > 0) {
    console.log('\nEvent catalog:');
    [...eventNames]
      .sort()
      .slice(0, 30)
      .forEach((eventName) => console.log(`   - ${eventName}`));
    if (eventNames.size > 30) console.log(`   ... and ${eventNames.size - 30} more`);
  }
}

main();
