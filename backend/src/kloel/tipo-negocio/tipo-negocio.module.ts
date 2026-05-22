import { Module } from '@nestjs/common';
import { TipoNegocioClassifierService } from './tipo-negocio.classifier.service';

/**
 * TipoNegocioModule — Camada VIII maturity variant.
 *
 * Business profile classification across 5 dimensions
 * (ticket, modelo, oferta, touch, audiencia) derived from
 * spine payment events, not from human declaration.
 *
 * Exports: TipoNegocioClassifierService.
 * Pure classification functions are importable directly.
 */
@Module({
  providers: [TipoNegocioClassifierService],
  exports: [TipoNegocioClassifierService],
})
export class TipoNegocioModule {}
