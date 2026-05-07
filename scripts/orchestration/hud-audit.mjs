#!/usr/bin/env node
// Root entry-point — implementation lives in __parts__ (size-budget split).
import './__parts__/hud-audit.mjs';
export * from './__parts__/hud-audit.mjs';
