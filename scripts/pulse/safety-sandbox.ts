// PULSE — Live Codebase Nervous System
// Safety Sandbox (Wave 9.3)
//
// Classifies destructive operations by risk level, defines isolation
// rules per operation type, simulates logical sandbox workspaces for
// planning validation, and gates autonomous execution of dangerous changes.
//
// This is a PLANNING module — it defines what should happen.
// It does NOT actually clone workspaces, execute patches, or apply migrations.
//
// Implementation lives in `safety-sandbox/__parts__/`.

export * from './safety-sandbox/__parts__/protected-files';
export * from './safety-sandbox/__parts__/classification';
export * from './safety-sandbox/__parts__/sandbox';
