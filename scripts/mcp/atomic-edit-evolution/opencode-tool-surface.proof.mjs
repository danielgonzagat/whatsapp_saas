#!/usr/bin/env node
/**
 * opencode-tool-surface.proof.mjs - executable proof for the OpenCode worker
 * tool-surface classifier used by the Atomic vs Normal A/B loop.
 */
const {
  classifyOpenCodeToolSurface,
  runCli,
} = await import('./opencode-tool-surface-harness.mjs');

const checks = [];
const check = (id, ok, detail) => checks.push({ id, ok: ok === true, detail: detail ?? null });
const blockerKinds = (result) => (Array.isArray(result.blockers) ? result.blockers.map((blocker) => blocker.kind) : []);
const warningKinds = (result) => (Array.isArray(result.warnings) ? result.warnings.map((warning) => warning.kind) : []);

const allDisabled = `
●  ○ chrome-devtools disabled
●  ○ atomic-edit disabled
●  ○ codegraph disabled
●  ○ graphify-plus disabled
●  ○ saas-compiler disabled
●  ○ gitnexus disabled
`;

const onlyAtomic = `
●  ○ chrome-devtools disabled
●  ✓ atomic-edit connected
●  ○ codegraph disabled
●  ○ graphify-plus disabled
●  ○ saas-compiler disabled
●  ○ gitnexus disabled
`;

const codegraphConnected = `
●  ○ chrome-devtools disabled
●  ○ atomic-edit disabled
●  ✓ codegraph connected
●  ○ graphify-plus disabled
●  ○ saas-compiler disabled
●  ○ gitnexus disabled
`;

const validBlock = classifyOpenCodeToolSurface({
  mode: 'BLOCK_NO_MCP',
  mcpListText: allDisabled,
  toolNames: ['read', 'bash', 'glob'],
});
check('block-accepts-native-tools-when-all-mcps-disabled', validBlock.ok === true, JSON.stringify(validBlock));

const invalidBlockMcp = classifyOpenCodeToolSurface({
  mode: 'BLOCK_NO_MCP',
  mcpListText: codegraphConnected,
  toolNames: ['codegraph_codegraph_files'],
});
check(
  'block-rejects-connected-mcp-and-mcp-shaped-tool-use',
  invalidBlockMcp.ok === false
    && blockerKinds(invalidBlockMcp).includes('BLOCK_MCP_CONNECTED')
    && blockerKinds(invalidBlockMcp).includes('BLOCK_MCP_TOOL_USED'),
  JSON.stringify(invalidBlockMcp),
);

const invalidBlockAtomic = classifyOpenCodeToolSurface({
  mode: 'BLOCK_NO_MCP',
  mcpListText: allDisabled,
  toolNames: ['atomic-edit_atomic_replace_text'],
});
check(
  'block-rejects-atomic-tool-use-even-if-mcp-list-is-disabled',
  invalidBlockAtomic.ok === false
    && blockerKinds(invalidBlockAtomic).includes('BLOCK_ATOMIC_TOOL_USED'),
  JSON.stringify(invalidBlockAtomic),
);

const validAtomic = classifyOpenCodeToolSurface({
  mode: 'ALL_IN_ATOMIC_ONLY',
  mcpListText: onlyAtomic,
  toolNames: ['atomic-edit_atomic_workspace_bind', 'atomic-edit_code_readcode', 'atomic-edit_atomic_exec'],
});
check('atomic-accepts-only-atomic-tools-with-only-atomic-mcp-connected', validAtomic.ok === true, JSON.stringify(validAtomic));

const atomicWithTodo = classifyOpenCodeToolSurface({
  mode: 'ALL_IN_ATOMIC_ONLY',
  mcpListText: onlyAtomic,
  toolNames: ['atomic-edit_atomic_workspace_bind', 'todowrite', 'atomic-edit_atomic_exec'],
});
check(
  'atomic-rejects-native-todowrite-planning-leak',
  atomicWithTodo.ok === false
    && blockerKinds(atomicWithTodo).includes('ATOMIC_NATIVE_TOOL_USED'),
  JSON.stringify(atomicWithTodo),
);

const atomicNativeRead = classifyOpenCodeToolSurface({
  mode: 'ALL_IN_ATOMIC_ONLY',
  mcpListText: onlyAtomic,
  toolNames: ['atomic-edit_atomic_workspace_bind', 'read'],
});
check(
  'atomic-rejects-native-read',
  atomicNativeRead.ok === false
    && blockerKinds(atomicNativeRead).includes('ATOMIC_NATIVE_TOOL_USED'),
  JSON.stringify(atomicNativeRead),
);

const atomicForeignMcp = classifyOpenCodeToolSurface({
  mode: 'ALL_IN_ATOMIC_ONLY',
  mcpListText: onlyAtomic,
  toolNames: ['atomic-edit_atomic_workspace_bind', 'codegraph_codegraph_files'],
});
check(
  'atomic-rejects-foreign-mcp-tools',
  atomicForeignMcp.ok === false
    && blockerKinds(atomicForeignMcp).includes('ATOMIC_FOREIGN_MCP_TOOL_USED'),
  JSON.stringify(atomicForeignMcp),
);

const atomicNoMcp = classifyOpenCodeToolSurface({
  mode: 'ALL_IN_ATOMIC_ONLY',
  mcpListText: allDisabled,
  toolNames: ['atomic-edit_atomic_workspace_bind'],
});
check(
  'atomic-rejects-missing-atomic-mcp-even-if-tool-log-claims-atomic',
  atomicNoMcp.ok === false
    && blockerKinds(atomicNoMcp).includes('ATOMIC_MCP_NOT_CONNECTED'),
  JSON.stringify(atomicNoMcp),
);

const cli = runCli(['--classify-opencode-tool-surface'], JSON.stringify({
  mode: 'ALL_IN_ATOMIC_ONLY',
  mcpListText: onlyAtomic,
  toolNames: ['atomic-edit_atomic_workspace_bind'],
}));
check('runCli-classifies-tool-surface', cli.ok === true, JSON.stringify(cli));

const failed = checks.filter((c) => !c.ok);
const result = {
  ok: failed.length === 0,
  gate: 'opencode-tool-surface',
  checks,
  failedCount: failed.length,
  honestCeiling: 'Pure classifier only. It validates supplied OpenCode MCP-list output and supplied tool names; it does not launch workers, inspect configs, or prove OS-level no-bypass.',
};

process.stdout.write(JSON.stringify(result, null, 2) + '\n');
process.exit(result.ok ? 0 : 1);
