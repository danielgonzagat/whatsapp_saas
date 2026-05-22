import { Module } from '@nestjs/common';
import { CashPositionTracker } from './cash-position.tracker';
import { CashPositionTrackerService } from './cash-position.tracker.service';
import { ReceivablesProjector } from './receivables.projector';
import { PayablesProjector } from './payables.projector';
import { RunwayCalculator } from './runway.calculator';
import { RiskDetector } from './risk.detector';
import { VolatilityTracker } from './volatility.tracker';
import { ProtectiveActionSuggester } from './protective-action.suggester';
import { UnsafeOperationBlocker } from './unsafe-operation.blocker';

/**
 * CashModule — Camada XXII (UTP-CASH-001..008).
 *
 * Caixa preservado como oxigênio. Pure-logic module that tracks cash
 * position, projects receivables and payables, calculates runway,
 * detects early warning risks, tracks volatility, suggests protective
 * actions, and blocks unsafe financial operations.
 *
 * All services operate on CashEntry[] arrays with no external
 * dependencies. Monetary amounts are bigint cents.
 */
@Module({
  providers: [
    CashPositionTracker,
    CashPositionTrackerService,
    ReceivablesProjector,
    PayablesProjector,
    RunwayCalculator,
    RiskDetector,
    VolatilityTracker,
    ProtectiveActionSuggester,
    UnsafeOperationBlocker,
  ],
  exports: [
    CashPositionTracker,
    CashPositionTrackerService,
    ReceivablesProjector,
    PayablesProjector,
    RunwayCalculator,
    RiskDetector,
    VolatilityTracker,
    ProtectiveActionSuggester,
    UnsafeOperationBlocker,
  ],
})
export class CashModule {}
