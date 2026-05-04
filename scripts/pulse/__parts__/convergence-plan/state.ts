import {
  discoverAllObservedArtifactFilenames,
  discoverAllObservedGateNames,
} from '../../dynamic-reality-kernel';

export const OBSERVED_ARTIFACTS = discoverAllObservedArtifactFilenames();
export const OBSERVED_GATES = discoverAllObservedGateNames();
