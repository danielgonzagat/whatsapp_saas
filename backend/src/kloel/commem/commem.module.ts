import { Module } from '@nestjs/common';
import { CommemLedgerService } from './ledger.service';
import { MemoryProjector } from './memory.projector';
import { ExporterService } from './exporter.service';
import { TimeMachineService } from './time-machine.service';
import { ValueQuantifier } from './value-quantifier';
import { NarrativeBuilder } from './narrative.builder';
import { AttributionGuard } from './attribution.guard';

/**
 * CommemModule — Camada XXI (UTP-COMMEM-001..007).
 *
 * ComMem: tudo aprendido vira capital exportavel da empresa. Agrega
 * eventos do spine por workspace, projeta memoria por dimensao
 * (working, episodic, consolidated, procedural, semantic), empacota
 * capsulas auditaveis, permite consulta temporal (time machine),
 * quantifica valor do conhecimento acumulado, constroi narrativas
 * periodicas e garante isolamento absoluto entre workspaces.
 *
 * Implements B0.8 (knowledge capital), PCI.1 §3.1 (cognition.*
 * taxonomy), and PCI.5 conventions.
 *
 * All services are pure logic — no external dependencies. They operate
 * on SpineEventRef[] arrays consumed from the in-process spine.
 */
@Module({
  providers: [
    CommemLedgerService,
    MemoryProjector,
    ExporterService,
    TimeMachineService,
    ValueQuantifier,
    NarrativeBuilder,
    AttributionGuard,
  ],
  exports: [
    CommemLedgerService,
    MemoryProjector,
    ExporterService,
    TimeMachineService,
    ValueQuantifier,
    NarrativeBuilder,
    AttributionGuard,
  ],
})
export class CommemModule {}
