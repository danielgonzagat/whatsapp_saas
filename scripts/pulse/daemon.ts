export type { FullScanResult, FullScanOptions } from './daemon/__parts__/types';
export { fullScan } from './daemon/__parts__/fullScan';
export {
  classifyWatchChange,
  getWatchRefreshMode,
  shouldRescanForWatchChange,
} from './daemon-watch-classifier';
export type { PulseWatchChangeKind, PulseWatchRefreshMode } from './daemon-watch-classifier';
export { refreshScanResultForWatchChange, rebuildDerivedScanState } from './daemon-watch-state';
export { startDaemon } from './daemon-watch';
