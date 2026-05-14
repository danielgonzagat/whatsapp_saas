import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { PartialExecutionOffer } from './types';

interface PartialOfferInput {
  readonly workspaceId: string;
  readonly originalAction: string;
  readonly fullEstimatedMinutes: number;
  readonly coreValueDescription: string;
  readonly niceToHaveDescription: string;
  readonly minimumViableOutcome: string;
}

const VALUE_RETENTION_BY_SPLIT: readonly { coreWeight: number; valueRetained: number; label: string }[] = [
  { coreWeight: 0.8, valueRetained: 0.85, label: '80% value, 20% effort' },
  { coreWeight: 0.6, valueRetained: 0.75, label: '75% value, 40% effort' },
  { coreWeight: 0.5, valueRetained: 0.65, label: '65% value, 50% effort' },
  { coreWeight: 0.4, valueRetained: 0.55, label: '55% value, 60% effort' },
];

@Injectable()
export class PartialExecutionOfferService {
  private readonly logger = new Logger(PartialExecutionOfferService.name);

  offer(input: PartialOfferInput): PartialExecutionOffer | null {
    if (input.fullEstimatedMinutes <= 10) {
      this.logger.debug('Action is already small enough — no partial execution needed');
      return null;
    }

    const split = this.selectSplit(input.fullEstimatedMinutes);
    const partialMinutes = Math.round(input.fullEstimatedMinutes * (1 - split.coreWeight));
    const savedTimePercent = Math.round((1 - partialMinutes / input.fullEstimatedMinutes) * 100);
    const partialVersion = this.buildPartialVersion(input, split);
    const rationale = this.buildRationale(input, savedTimePercent, split.valueRetained);

    this.logger.debug(
      `Partial execution offer: ${savedTimePercent}% time saved, ${Math.round(split.valueRetained * 100)}% value retained`,
    );

    return {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      originalAction: input.originalAction,
      partialVersion,
      savedTimePercent,
      valueRetainedPercent: Math.round(split.valueRetained * 100),
      rationale,
      generatedAt: new Date().toISOString(),
    };
  }

  private selectSplit(totalMinutes: number): { coreWeight: number; valueRetained: number; label: string } {
    if (totalMinutes > 480) return VALUE_RETENTION_BY_SPLIT[1]!;
    if (totalMinutes > 120) return VALUE_RETENTION_BY_SPLIT[0]!;
    return VALUE_RETENTION_BY_SPLIT[2]!;
  }

  private buildPartialVersion(input: PartialOfferInput, split: { label: string }): string {
    const corePart = input.coreValueDescription || input.minimumViableOutcome || 'the core deliverable';
    return `Partial version: deliver only ${corePart} (${split.label})`;
  }

  private buildRationale(input: PartialOfferInput, savedPercent: number, retention: number): string {
    const retentionPct = Math.round(retention * 100);
    if (input.niceToHaveDescription) {
      return `Skip "${input.niceToHaveDescription}" now. Deliver the core first: ${input.minimumViableOutcome}. Saves ${savedPercent}% time while retaining ~${retentionPct}% of value.`;
    }
    return `Strip to minimum viable: ${input.minimumViableOutcome}. Saves ${savedPercent}% time while retaining ~${retentionPct}% of value.`;
  }
}
