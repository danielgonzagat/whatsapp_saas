import { Module } from '@nestjs/common';
import { GraduationService } from './graduation.service';

/**
 * ColdstartModule — Camada XVII (UTP-COLDSTART-001..008).
 *
 * Empresa sem historico chega a primeira verdade comercial em <=30 dias.
 * Implements B0.5. All detectors and builders are pure functions; only
 * the GraduationService is a NestJS provider for future spine wiring.
 */
@Module({
  providers: [GraduationService],
  exports: [GraduationService],
})
export class ColdstartModule {}
