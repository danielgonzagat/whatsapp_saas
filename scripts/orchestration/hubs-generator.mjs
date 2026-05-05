#!/usr/bin/env node
export * from './hubs-generator/__parts__/constants.mjs';
export * from './hubs-generator/__parts__/helpers.mjs';
export * from './hubs-generator/__parts__/generators.mjs';
export * from './hubs-generator/__parts__/cli.mjs';

import { main } from './hubs-generator/__parts__/cli.mjs';
main();
