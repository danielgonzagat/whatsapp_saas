import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * UTP-MIND-PREDICT — Predictive coding engine.
 *
 * Implements B5 (predictive coding obligatory) + B7 (valence on terminal events).
 *
 * CYCLE:
 *   1. Read recent events from spine → extract patterns
 *   2. Generate predictions based on learned patterns
 *   3. On next cycle, evaluate predictions against new events
 *   4. Compute surprise (prediction error)
 *   5. Update belief confidence via Beta posterior
 *   6. Emit surprise events into the spine
 *
 * This CLOSES the cognitive loop: perception → prediction → surprise → update.
 */

export interface GeneratedPrediction {
  id: string;
  predicate: string;        // e.g. "lead_from_instagram_converts"
  expectedOutcome: string;  // e.g. "lead_converted" or "payment_approved"
  confidence: number;       // 0-1
  generatedAt: string;
  evaluatedAt?: string;
  wasCorrect?: boolean;
  surprise?: number;        // 0-1, higher = more surprising
  evidenceEvents: string[]; // eventIds that support this prediction
}

export interface PredictionCycle {
  cycleAt: string;
  predictionsGenerated: number;
  predictionsEvaluated: number;
  correctPredictions: number;
  meanSurprise: number;
  predictions: GeneratedPrediction[];
}

@Injectable()
export class MindPredictionService {
  private readonly logger = new Logger(MindPredictionService.name);
  private activePredictions: GeneratedPrediction[] = [];  private lastCycleAt?: string;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Run a full prediction cycle: evaluate old predictions against new events,
   * then generate new predictions from current patterns.
   */
  async runCycle(workspaceId: string): Promise<PredictionCycle> {
    const cycleAt = new Date().toISOString();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Step 1: Read recent events
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT intent, action, status, meta, "createdAt"
       FROM "RAC_AutopilotEvent"
       WHERE "workspaceId" = $1 AND "createdAt" > $2
       ORDER BY "createdAt" ASC LIMIT 500`,
      workspaceId, since,
    );

    if (!rows || rows.length === 0) {
      return { cycleAt, predictionsGenerated: 0, predictionsEvaluated: 0, correctPredictions: 0, meanSurprise: 0, predictions: [] };
    }

    // Step 2: Evaluate OLD predictions against NEW events (since last cycle)
    let evaluated = 0;
    let correct = 0;
    let totalSurprise = 0;
    const newEvents = this.lastCycleAt
      ? rows.filter((r: any) => new Date(r.createdAt) > new Date(this.lastCycleAt!))
      : [];

    for (const pred of this.activePredictions) {
      // Check if any NEW event matches the expected outcome
      const matchingEvents = newEvents.filter((r: any) => {
        const intent = `${r.intent}_${r.status}`;
        return intent.includes(pred.expectedOutcome) || r.intent.includes(pred.expectedOutcome);
      });

      pred.evaluatedAt = cycleAt;
      pred.wasCorrect = matchingEvents.length > 0;

      // Compute surprise = 1 - P(outcome|prediction)
      // If prediction was confident and wrong → high surprise
      // If prediction was uncertain and wrong → low surprise
      if (pred.wasCorrect) {
        pred.surprise = 0;
        pred.confidence = Math.min(1, pred.confidence + 0.05); // reinforce
      } else {
        pred.surprise = pred.confidence; // confident but wrong = surprising
        pred.confidence = Math.max(0.1, pred.confidence - 0.1); // weaken
      }

      evaluated++;
      if (pred.wasCorrect) correct++;
      totalSurprise += pred.surprise;

      // Emit surprise as event
      if (pred.surprise > 0.3) {
        void this.prisma.autopilotEvent.create({
          data: {
            workspaceId,
            intent: 'surprise_detected',
            action: 'mind.prediction.surprise',
            status: 'executed',
            meta: {
              predictionId: pred.id,
              predicate: pred.predicate,
              expectedOutcome: pred.expectedOutcome,
              surprise: pred.surprise,
              wasCorrect: pred.wasCorrect,
            },
          },
        }).catch(() => {});
      }
    }

    // Step 3: Extract patterns from recent events to generate NEW predictions
    const byIntent = new Map<string, number>();
    for (const r of rows) {
      const key = r.intent;
      byIntent.set(key, (byIntent.get(key) || 0) + 1);
    }

    // Generate predictions from patterns with sufficient evidence
    const newPredictions: GeneratedPrediction[] = [];
    const significantIntents = [...byIntent.entries()]
      .filter(([, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1]);

    for (const [intent, count] of significantIntents.slice(0, 5)) {
      // Predict that this pattern will continue
      const pred: GeneratedPrediction = {
        id: `pred_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        predicate: `pattern_${intent}_continues`,
        expectedOutcome: intent,
        confidence: Math.min(0.95, count / (count + 2)), // Beta(1,1) posterior
        generatedAt: cycleAt,
        evidenceEvents: rows
          .filter((r: any) => r.intent === intent)
          .slice(0, 3)
          .map((r: any) => `evt_${new Date(r.createdAt).getTime().toString(36)}`),
      };
      newPredictions.push(pred);
    }

    // Step 4: Cross-pattern predictions (emergent!)
    // e.g., "when campaign_clicked precedes lead_created, lead_converted is more likely"
    const sequencePatterns = this.detectSequences(rows);
    for (const seq of sequencePatterns.slice(0, 3)) {
      const pred: GeneratedPrediction = {
        id: `pred_seq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        predicate: `sequence_${seq.predecessor}_leads_to_${seq.successor}`,
        expectedOutcome: seq.successor,
        confidence: seq.confidence,
        generatedAt: cycleAt,
        evidenceEvents: seq.evidenceIds,
      };
      newPredictions.push(pred);
    }

    // Replace active predictions with new ones
    this.activePredictions = newPredictions;    this.lastCycleAt = cycleAt;

    // Emit predictions as events
    for (const pred of newPredictions) {
      void this.prisma.autopilotEvent.create({
        data: {
          workspaceId,
          intent: 'prediction_generated',
          action: 'mind.prediction.generate',
          status: 'executed',
          meta: {
            predictionId: pred.id,
            predicate: pred.predicate,
            expectedOutcome: pred.expectedOutcome,
            confidence: pred.confidence,
          },
        },
      }).catch(() => {});
    }

    const meanSurprise = evaluated > 0 ? totalSurprise / evaluated : 0;

    this.logger.log(
      `prediction cycle — generated=${newPredictions.length} evaluated=${evaluated} correct=${correct} meanSurprise=${meanSurprise.toFixed(3)}`,
    );

    return {
      cycleAt,
      predictionsGenerated: newPredictions.length,
      predictionsEvaluated: evaluated,
      correctPredictions: correct,
      meanSurprise,
      predictions: newPredictions,
    };
  }

  /**
   * Detect temporal sequences in events: A → B patterns.
   * This is where EMERGENCE happens — patterns nobody programmed.
   */
  private detectSequences(rows: any[]): Array<{
    predecessor: string;
    successor: string;
    confidence: number;
    evidenceIds: string[];
  }> {
    const sequences = new Map<string, { count: number; totalPredecessor: number; evidenceIds: string[] }>();

    for (let i = 0; i < rows.length - 1; i++) {
      const a = rows[i];
      const b = rows[i + 1];
      // Only consider events within 30 minutes of each other
      const timeDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (timeDiff > 30 * 60 * 1000) continue;

      const key = `${a.intent}→${b.intent}`;
      const entry = sequences.get(key) || { count: 0, totalPredecessor: 0, evidenceIds: [] };
      entry.count++;
      entry.totalPredecessor++;
      if (entry.evidenceIds.length < 3) {
        entry.evidenceIds.push(`evt_${new Date(a.createdAt).getTime().toString(36)}`);
      }
      sequences.set(key, entry);
    }

    return [...sequences.entries()]
      .filter(([, v]) => v.count >= 2)
      .map(([key, v]) => {
        const [predecessor, successor] = key.split('→');
        const confidence = v.count / Math.max(1, v.totalPredecessor);
        return { predecessor, successor, confidence: Math.round(confidence * 100) / 100, evidenceIds: v.evidenceIds };
      })
      .filter(s => s.confidence > 0.3)
      .sort((a, b) => b.confidence - a.confidence);
  }

  /** Get active predictions for inspection */
  getActivePredictions(): GeneratedPrediction[] {
    return this.activePredictions;
  }
}
