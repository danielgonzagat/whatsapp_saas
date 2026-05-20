import { applyGraphDerivedTags } from './obsidian-mirror-daemon-indexes-notes.mjs';
import { applyDiagnosticTags } from './obsidian-mirror-daemon-indexes-diagnostics.mjs';
import { removeGeneratedGraphOverlays } from './obsidian-mirror-daemon-indexes-camera.mjs';

/**
 * writeGeneratedIndexes — currently disabled (early return after applying
 * diagnostic + graph-derived tags). The legacy implementation that produced
 * `_visual`/`_clusters`/`_signals`/`_machine`/`_domains` overlays inflated
 * the Obsidian graph with 29k+ non-source files; only the source-code
 * mirror is needed for architectural diagnosis. The legacy body is
 * preserved in `obsidian-mirror-daemon-indexes-legacy-overlays.mjs` for
 * archival, never invoked.
 */
export function writeGeneratedIndexes(manifest) {
  removeGeneratedGraphOverlays();
  applyDiagnosticTags(manifest);
  applyGraphDerivedTags(manifest);
}
