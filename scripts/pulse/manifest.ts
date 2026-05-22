import { safeJoin } from './safe-path';
import * as path from 'path';
import type { PulseConfig, PulseManifest, PulseManifestLoadResult } from './types.manifest';
import type { CoreParserData } from './functional-map-types';
import { pathExists, readTextFile } from './safe-fs';
import { manifestBreak, PULSE_MANIFEST_FILENAME, SUPPORTED_STACKS } from './manifest-validators';
import { validateManifestShape } from './manifest-shape-validators';
import { discoverSurfaceKinds } from './manifest-surface-discovery';

export { PULSE_MANIFEST_FILENAME, SUPPORTED_STACKS };

/** Load pulse manifest. */
export function loadPulseManifest(
  config: PulseConfig,
  coreData: CoreParserData,
): PulseManifestLoadResult {
  const manifestPath = safeJoin(config.rootDir, PULSE_MANIFEST_FILENAME);

  if (!pathExists(manifestPath)) {
    return {
      manifest: null,
      manifestPath: null,
      issues: [
        manifestBreak(
          'MANIFEST_MISSING',
          'pulse.manifest.json is missing',
          'Create the project manifest before using certification gates.',
          path.relative(config.rootDir, manifestPath),
        ),
      ],
      unknownSurfaces: [],
      unsupportedStacks: [],
    };
  }

  let rawContent = '';
  try {
    rawContent = readTextFile(manifestPath, 'utf8');
  } catch (error) {
    return {
      manifest: null,
      manifestPath,
      issues: [
        manifestBreak(
          'MANIFEST_INVALID',
          'pulse.manifest.json could not be read',
          (error as Error).message || 'Unknown filesystem error',
          path.relative(config.rootDir, manifestPath),
        ),
      ],
      unknownSurfaces: [],
      unsupportedStacks: [],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch (error) {
    return {
      manifest: null,
      manifestPath,
      issues: [
        manifestBreak(
          'MANIFEST_INVALID',
          'pulse.manifest.json is not valid JSON',
          (error as Error).message || 'JSON parse error',
          path.relative(config.rootDir, manifestPath),
        ),
      ],
      unknownSurfaces: [],
      unsupportedStacks: [],
    };
  }

  const issues = validateManifestShape(parsed, path.relative(config.rootDir, manifestPath));
  if (issues.length > 0) {
    return {
      manifest: null,
      manifestPath,
      issues,
      unknownSurfaces: [],
      unsupportedStacks: [],
    };
  }

  const manifest = parsed as PulseManifest;
  const unsupportedStacks: string[] = [];
  const discoveredSurfaces = discoverSurfaceKinds(config, coreData);
  const declared = new Set([...(manifest.surfaces || []), ...(manifest.excludedSurfaces || [])]);
  const unknownSurfaces = discoveredSurfaces.filter((surface) => !declared.has(surface));

  return {
    manifest,
    manifestPath,
    issues,
    unknownSurfaces,
    unsupportedStacks,
  };
}
