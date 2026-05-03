/**
 * PULSE Source Root Detector
 *
 * Discovers source-code roots within a project directory by examining package
 * manifests, TSConfig/JSConfig files, build configurations, file-system
 * evidence, and weak fallbacks for conventional directory layouts.
 *
 * Artifacts used by the PULSE scope engine to determine what to scan.
 */

export {
  type DetectedSourceRoot,
  type SourceRootAvailability,
  type SourceRootEvidenceBasis,
  type SourceRootKind,
  type SourceRootLanguage,
} from './__parts__/source-root-detector/types-and-constants';

export {
  detectSourceRoots,
  sourceGlobsForTsMorph,
} from './__parts__/source-root-detector/root-detection-final';
