import { SpineEmitterService } from '../../src/kloel/spine/spine-emitter.service';
import { ValenceTaggerService } from '../../src/kloel/mind/valence-tagger.service';

/**
 * Canonical factory: returns a real SpineEmitterService instance for spec tests.
 * Use when a spec needs to drive the real emit pipeline (not a mock).
 *
 * Constructor verified at backend/src/kloel/spine/spine-emitter.service.ts:38-44:
 *   constructor(@Optional() valenceTagger?: ValenceTaggerService,
 *               @Optional() @Inject('SPINE_EMITTER_OPTS') opts?: { ringCapacity?: number })
 *
 * Variant A (real SpineEmitterService, 13 files) — migrated here.
 * Variant B (test-double with ringCapacity opt, 2 files) — keep local, different shape.
 * Variant C (mock spine with subscriber list, 2 files) — keep local, different shape.
 */
export function makeSpine(): SpineEmitterService {
  return new SpineEmitterService(new ValenceTaggerService());
}
