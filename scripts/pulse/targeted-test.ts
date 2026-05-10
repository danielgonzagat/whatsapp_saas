#!/usr/bin/env ts-node

import * as path from 'path';

// This test validates our detector changes by running the graph builder
// with the modified parsers, bypassing the broken convergence plan.

import { detectFacades } from './parsers/facade-detector/facade-detector-part3-main';
import { parseSchema } from './parsers/schema-parser';
import { traceServices } from './parsers/service-tracer';
import { parseBackendRoutes } from './parsers/backend-parser';
import { parseAPICalls, parseProxyRoutes } from './parsers/api-parser';
import { buildHookRegistry } from './parsers/hook-registry';
import { parseUIElements } from './parsers/ui-parser/parse-ui-elements';
import { buildGraph } from './graph/graph-part3-builder';
import type { PulseConfig } from './types.manifest';

const rootDir = path.resolve(__dirname, '../../..');
const config: PulseConfig = {
  rootDir,
  frontendDir: path.join(rootDir, 'frontend'),
  backendDir: path.join(rootDir, 'backend'),
};

console.log('Configuration:', JSON.stringify(config, null, 2));

async function main() {
  console.log('\n=== PULSE Targeted Test ===\n');

  // Phase 1: Core Parsers
  console.log('[1/6] Parsing schema...');
  const prismaModels = parseSchema(config);
  console.log(`  Models: ${prismaModels.length}`);

  console.log('[2/6] Tracing services...');
  const serviceTraces = traceServices(config);
  console.log(`  Service traces: ${serviceTraces.length}`);

  console.log('[3/6] Parsing backend routes...');
  const backendRoutes = parseBackendRoutes(config);
  console.log(`  Routes: ${backendRoutes.length}`);

  console.log('[4/6] Parsing API calls & proxy routes...');
  const apiCalls = parseAPICalls(config);
  const proxyRoutes = parseProxyRoutes(config);
  console.log(`  API calls: ${apiCalls.length}, Proxies: ${proxyRoutes.length}`);

  console.log('[5/6] Building hook registry & parsing UI elements...');
  const hookRegistry = buildHookRegistry(config);
  const uiElements = parseUIElements(config, hookRegistry);
  console.log(`  UI elements: ${uiElements.length}`);

  console.log('[6/6] Detecting facades...');
  const facades = detectFacades(config);
  console.log(`  Facades: ${facades.length}`);

  // Phase 2: Build Graph
  console.log('\n=== Building Graph ===\n');
  const health = buildGraph({
    uiElements,
    apiCalls,
    backendRoutes,
    prismaModels,
    serviceTraces,
    proxyRoutes,
    facades,
    config,
    globalPrefix: 'api',
  });

  console.log('\n=== PULSE HEALTH ===');
  console.log('Score:', health.score);
  console.log('Total Nodes:', health.totalNodes);
  console.log('Stats:');
  for (const [k, v] of Object.entries(health.stats)) {
    console.log(`  ${k}: ${JSON.stringify(v)}`);
  }

  console.log('\n=== BREAKS ===');
  const kinds: Record<string, number> = {};
  health.breaks.forEach(b => {
    kinds[b.source] = (kinds[b.source] || 0) + 1;
  });
  for (const [k, v] of Object.entries(kinds).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v}`);
  }

  // Show model orphan breaks
  const modelOrphanBreaks = health.breaks.filter(
    b => b.source === 'graph:confirmed_static:state_model_access_unobserved'
  );
  console.log(`\n=== Model Orphan Breaks (${modelOrphanBreaks.length}) ===`);
  for (const b of modelOrphanBreaks.slice(0, 10)) {
    console.log(`  ${b.description}`);
  }

  // Show dead handler breaks
  const deadHandlerBreaks = health.breaks.filter(
    b => b.source === 'graph:confirmed_static:ui_handler_effect_unobserved'
  );
  console.log(`\n=== Dead Handler Breaks (${deadHandlerBreaks.length}) ===`);
  for (const b of deadHandlerBreaks.slice(0, 10)) {
    console.log(`  ${b.file}:${b.line} - ${b.description}`);
  }

  // Show facade breaks
  const facadeBreaks = health.breaks.filter(
    b => b.source === 'graph:confirmed_static:facade_evidence'
  );
  console.log(`\n=== Facade Breaks (${facadeBreaks.length}) ===`);
  for (const b of facadeBreaks) {
    console.log(`  ${b.file}:${b.line} - ${b.description}`);
  }
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
