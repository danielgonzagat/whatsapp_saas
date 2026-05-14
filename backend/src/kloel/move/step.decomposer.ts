import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { StepDecomposition, TinyStep } from './types';

interface DecomposeInput {
  readonly workspaceId: string;
  readonly actionDescription: string;
  readonly totalEstimatedHours: number;
  readonly complexity: 'simple' | 'moderate' | 'complex' | 'very_complex';
  readonly hasDependencies: boolean;
  readonly priorKnowledgeLevel: 'none' | 'partial' | 'full';
}

const MAX_STEP_MINUTES = 15;
const MIN_STEP_MINUTES = 2;

@Injectable()
export class StepDecomposerService {
  private readonly logger = new Logger(StepDecomposerService.name);

  decompose(input: DecomposeInput): StepDecomposition {
    const totalMinutes = input.totalEstimatedHours * 60;
    const effectiveComplexityMultiplier = this.complexityMultiplier(input.complexity);
    const adjustedMinutes = totalMinutes * effectiveComplexityMultiplier;
    const stepTarget = Math.max(1, Math.ceil(adjustedMinutes / MAX_STEP_MINUTES));
    const steps = this.generateSteps(input, adjustedMinutes, stepTarget);
    const totalEstimated = steps.reduce((sum, s) => sum + s.estimatedMinutes, 0);

    this.logger.debug(
      `Decomposed "${input.actionDescription.slice(0, 40)}" into ${steps.length} steps (${totalEstimated}min total)`,
    );

    return {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      originalAction: input.actionDescription,
      steps,
      totalEstimatedMinutes: totalEstimated,
      firstStepMinutes: steps[0]?.estimatedMinutes ?? 0,
      decomposedAt: new Date().toISOString(),
    };
  }

  private complexityMultiplier(complexity: DecomposeInput['complexity']): number {
    switch (complexity) {
      case 'simple': return 0.6;
      case 'moderate': return 1.0;
      case 'complex': return 1.5;
      case 'very_complex': return 2.2;
    }
  }

  private generateSteps(input: DecomposeInput, totalMinutes: number, targetCount: number): TinyStep[] {
    const steps: TinyStep[] = [];
    const baseMinutes = Math.max(MIN_STEP_MINUTES, Math.min(MAX_STEP_MINUTES, Math.round(totalMinutes / targetCount)));
    const verbs = this.verbSequence(input.priorKnowledgeLevel, targetCount);

    let remainingMinutes = totalMinutes;
    for (let i = 0; i < targetCount && remainingMinutes > 0; i++) {
      const isLastStep = i === targetCount - 1 || remainingMinutes <= MAX_STEP_MINUTES;
      const stepMinutes = isLastStep
        ? Math.max(MIN_STEP_MINUTES, remainingMinutes)
        : Math.min(baseMinutes, remainingMinutes);

      const verb = verbs[i % verbs.length]!;
      const stepDescription = this.buildStepDescription(i, verb, input);

      steps.push({
        order: i + 1,
        description: stepDescription,
        estimatedMinutes: stepMinutes,
        isAtomic: stepMinutes <= MAX_STEP_MINUTES,
        completionSignal: this.completionSignal(stepDescription),
      });

      remainingMinutes -= stepMinutes;
    }

    if (steps.length === 0) {
      steps.push({
        order: 1,
        description: `Start: ${input.actionDescription}`,
        estimatedMinutes: MAX_STEP_MINUTES,
        isAtomic: true,
        completionSignal: 'First action completed and visible',
      });
    }

    return steps;
  }

  private verbSequence(prior: DecomposeInput['priorKnowledgeLevel'], count: number): string[] {
    if (prior === 'full') {
      return ['Execute', 'Verify', 'Document'];
    }
    if (prior === 'partial') {
      return ['Outline', 'Draft', 'Review', 'Finalize'];
    }
    if (count <= 3) {
      return ['Define', 'Begin', 'Complete'];
    }
    return ['Define', 'Research', 'Outline', 'Draft', 'Review', 'Finalize'];
  }

  private buildStepDescription(i: number, verb: string, input: DecomposeInput): string {
    const action = input.actionDescription;
    if (i === 0) {
      return `${verb} the first piece: ${action}`;
    }
    return `${verb} next part of: ${action}`;
  }

  private completionSignal(description: string): string {
    return `Step "${description}" completed with visible output`;
  }
}
