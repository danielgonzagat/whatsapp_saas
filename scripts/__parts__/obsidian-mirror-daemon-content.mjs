/**
 * obsidian-mirror-daemon-content — barrel module.
 *
 * The actual implementation lives in sibling files (relations/helpers/facts/
 * domain/extract/index/build) so each stays below the architecture-guard
 * line budget. This barrel re-exports the same surface so existing callers
 * (`obsidian-mirror-daemon.mjs` and `obsidian-mirror-daemon-indexes.mjs`)
 * keep working unchanged.
 */

export * from './obsidian-mirror-daemon-content-relations.mjs';
export * from './obsidian-mirror-daemon-content-helpers.mjs';
export * from './obsidian-mirror-daemon-content-facts.mjs';
export * from './obsidian-mirror-daemon-content-domain.mjs';
export * from './obsidian-mirror-daemon-content-extract.mjs';
export * from './obsidian-mirror-daemon-content-index.mjs';
export * from './obsidian-mirror-daemon-content-build.mjs';
