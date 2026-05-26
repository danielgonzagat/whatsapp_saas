#!/usr/bin/env node
/**
 * Kloel AsyncAPI Extractor — scans event emitters and @OnEvent listeners
 * to build an event-driven architecture contract.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const OUT = resolve(ROOT, 'tools/asyncapi/asyncapi-spec.json');

async function main() {
  const { execSync } = await import('child_process');

  // Find all event emitter usages
  const emitFiles = execSync(
    `grep -r "EventEmitter2\\|this\\.eventEmitter\\.emit\\|@OnEvent" ${ROOT}/backend/src --include="*.ts" -l 2>/dev/null || true`,
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
  ).trim().split('\n').filter(Boolean);

  // Find worker queue event handlers
  const workerQueues = execSync(
    `grep -r "Queue\\|Process\\|processJob\\|BullModule\\.registerQueue" ${ROOT}/worker --include="*.ts" -l 2>/dev/null || true`,
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
  ).trim().split('\n').filter(Boolean);

  // Extract event names from @OnEvent decorators
  const eventNames = new Set();
  for (const file of emitFiles) {
    try {
      const content = readFileSync(file, 'utf8');
      const matches = content.matchAll(/@OnEvent\(['"]([^'"]+)['"]\)/g);
      for (const m of matches) eventNames.add(m[1]);
      const emitMatches = content.matchAll(/\.emit\(['"]([^'"]+)['"]/g);
      for (const m of emitMatches) eventNames.add(m[1]);
    } catch {}
  }

  const spec = {
    asyncapi: '2.6.0',
    info: {
      title: 'Kloel Event Architecture',
      version: '1.0.0',
      description: 'Auto-extracted event contracts from NestJS EventEmitter2 + BullMQ workers',
    },
    channels: {},
    components: { messages: {} },
  };

  for (const event of [...eventNames].sort()) {
    spec.channels[event] = {
      description: `Event: ${event}`,
      publish: { message: { $ref: `#/components/messages/${event.replace(/[.:]/g, '_')}` } },
    };
    spec.components.messages[event.replace(/[.:]/g, '_')] = {
      name: event,
      title: event,
      summary: `Emitted by NestJS EventEmitter2 or processed by BullMQ worker`,
    };
  }

  const outDir = resolve(ROOT, 'tools/asyncapi');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  writeFileSync(OUT, JSON.stringify(spec, null, 2));

  console.log(`✅ AsyncAPI spec: ${eventNames.size} events`);
  console.log(`   Emitter files: ${emitFiles.length}`);
  console.log(`   Worker queues: ${workerQueues.length}`);
  console.log(`   Output: ${OUT}`);
  if (eventNames.size > 0) {
    console.log('\nEvent catalog:');
    [...eventNames].sort().slice(0, 30).forEach(e => console.log(`   - ${e}`));
    if (eventNames.size > 30) console.log(`   ... and ${eventNames.size - 30} more`);
  }
}

main();
