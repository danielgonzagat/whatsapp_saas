import { Module } from '@nestjs/common';
import { CapabilityRegistryV2Module } from '../capability-registry-v2/capability-registry-v2.module';
import { CapabilityManifestBuilderService } from './capability-manifest.builder';
import { CapabilityRouterService } from './capability-router.service';
import { ManifestInjectionBuilderService } from './manifest-injection.builder';

/**
 * FACTORY CAPABILITY MANIFEST module.
 *
 * Wires the read-only manifest view over the existing capability registry:
 *   - {@link CapabilityManifestBuilderService} — registry → manifest projection.
 *   - {@link CapabilityRouterService} — per-turn relevant-subset selection.
 *   - {@link ManifestInjectionBuilderService} — compact context injection +
 *     hidden-from-user sanitization.
 *
 * Imports {@link CapabilityRegistryV2Module} (which exports the registry
 * service) and is otherwise fully disjoint from the registry internals.
 */
@Module({
  imports: [CapabilityRegistryV2Module],
  providers: [
    CapabilityManifestBuilderService,
    CapabilityRouterService,
    ManifestInjectionBuilderService,
  ],
  exports: [
    CapabilityManifestBuilderService,
    CapabilityRouterService,
    ManifestInjectionBuilderService,
  ],
})
export class CapabilityManifestModule {}
