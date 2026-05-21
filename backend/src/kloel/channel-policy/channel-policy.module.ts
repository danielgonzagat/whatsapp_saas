import { Module } from '@nestjs/common';
import { ChannelPolicyRegistry } from './channel-policy.registry';

/**
 * ChannelPolicyModule — NestJS wiring for the per-channel policy registry.
 *
 * Exports ChannelPolicyRegistry so that consumers (ValenceTaggerService,
 * SpineEmitterService, MIND processors) can inject it and consult
 * per-channel terminal valence / truthMode defaults.
 */
@Module({
  providers: [ChannelPolicyRegistry],
  exports: [ChannelPolicyRegistry],
})
export class ChannelPolicyModule {}
