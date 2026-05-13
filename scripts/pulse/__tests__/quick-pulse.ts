/**
 * Quick pulse: runs just the core parsers and graph builder to check orphan count.
 */
import { detectConfig } from '../config';
import { parseSchema } from '../parsers/schema-parser';
import { parseBackendRoutes } from '../parsers/backend-parser';
import { traceServices } from '../parsers/service-tracer';
import { parseAPICalls, parseProxyRoutes } from '../parsers/api-parser';
import { parseUIElements } from '../parsers/ui-parser/parse-ui-elements';
import { buildHookRegistry } from '../parsers/hook-registry';
import { detectFacades } from '../parsers/facade-detector/facade-detector-part3-main';
import { buildGraph } from '../graph/graph-part3-builder';

const rootDir = '/Users/danielpenin/whatsapp_saas';
const config = detectConfig(rootDir);

console.log('Config:', JSON.stringify({ backendDir: config.backendDir, schemaPath: config.schemaPath, globalPrefix: config.globalPrefix }));

console.log('\nParsing schema...');
const prismaModels = parseSchema(config);
console.log(`Found ${prismaModels.length} models`);

console.log('Tracing services...');
const serviceTraces = traceServices(config);
console.log(`Found ${serviceTraces.length} traces`);

console.log('Parsing backend routes...');
const backendRoutes = parseBackendRoutes(config);
console.log(`Found ${backendRoutes.length} routes`);

console.log('Parsing API calls...');
const apiCalls = parseAPICalls(config);
console.log(`Found ${apiCalls.length} API calls`);

console.log('Parsing proxy routes...');
const proxyRoutes = parseProxyRoutes(config);
console.log(`Found ${proxyRoutes.length} proxy routes`);

const hookRegistry = buildHookRegistry(config);

console.log('Parsing UI elements...');
const uiElements = parseUIElements(config, hookRegistry);
console.log(`Found ${uiElements.length} UI elements`);

const facades = detectFacades(config);

console.log('\nBuilding graph...');
const health = buildGraph({
  uiElements,
  apiCalls,
  backendRoutes,
  prismaModels,
  serviceTraces,
  proxyRoutes,
  facades,
  globalPrefix: config.globalPrefix,
  config,
});

console.log(`\n=== RESULTS ===`);
console.log(`Score: ${health.score}`);
console.log(`Total breaks: ${health.breaks.length}`);
console.log(`Prisma models: ${health.stats.prismaModels}`);
console.log(`Model orphans: ${health.stats.modelOrphans}`);

// Show which models are still orphans
const orphanBreaks = health.breaks.filter(b => b.source === 'graph:confirmed_static:state_model_access_unobserved');
console.log(`\nOrphan models (${orphanBreaks.length}):`);
for (const b of orphanBreaks) {
  console.log(`  - ${b.description}`);
}
