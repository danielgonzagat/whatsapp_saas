import { Module } from '@nestjs/common';
import { LocalIdentityService } from './local-identity.service';

/**
 * LocalIdentityModule — Camada V (UTP-LOCAL-IDENT-001..007).
 *
 * Per-workspace operational profile derived from spine events.
 * Exports LocalIdentityService for ABI builder consumption.
 */
@Module({
  providers: [LocalIdentityService],
  exports: [LocalIdentityService],
})
export class LocalIdentityModule {}
