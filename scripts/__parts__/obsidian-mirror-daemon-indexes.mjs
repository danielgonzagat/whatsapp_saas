/**
 * obsidian-mirror-daemon-indexes — barrel module.
 *
 * Implementation lives in sibling files (notes/camera/diagnostics/domain-
 * write/domain-pages/machine/generated/legacy-overlays/persistence) so each
 * stays under the architecture-guard line budget. This barrel re-exports
 * the same surface so existing callers (`obsidian-mirror-daemon.mjs` and
 * `scripts/orchestration/__parts__/pulse-bridge-emitter.mjs`) keep working
 * unchanged.
 */

export * from './obsidian-mirror-daemon-indexes-notes.mjs';
export * from './obsidian-mirror-daemon-indexes-diagnostics.mjs';
export * from './obsidian-mirror-daemon-indexes-camera.mjs';
export * from './obsidian-mirror-daemon-indexes-domain-write.mjs';
export * from './obsidian-mirror-daemon-indexes-domain-pages.mjs';
export * from './obsidian-mirror-daemon-indexes-machine.mjs';
export * from './obsidian-mirror-daemon-indexes-generated.mjs';
export * from './obsidian-mirror-daemon-indexes-persistence.mjs';
