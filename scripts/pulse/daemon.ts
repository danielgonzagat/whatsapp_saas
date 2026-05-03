export type { FullScanResult, FullScanOptions } from './__parts__/daemon/types';
export { fullScan } from './__parts__/daemon/full-scan';
export {
  classifyWatchChange,
  getWatchRefreshMode,
  shouldRescanForWatchChange,
} from './__parts__/daemon/types';
export type { PulseWatchChangeKind, PulseWatchRefreshMode } from './__parts__/daemon/types';
export { refreshScanResultForWatchChange, rebuildDerivedScanState } from './__parts__/daemon/types';
export { startDaemon } from './__parts__/daemon/types';
