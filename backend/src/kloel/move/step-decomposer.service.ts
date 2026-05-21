import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { ComplexActionInput, MicroStep, StepDecompositionResult } from './move.types';

const MAX_STEP_MINUTES = 15;
const MIN_STEP_MINUTES = 2;

interface ToolAssistMap {
  readonly verb: string;
  readonly assistedTool: string;
}

@Injectable()
export class StepDecomposerService {
  private readonly logger = new Logger(StepDecomposerService.name);

  decompose(input: ComplexActionInput): StepDecompositionResult {
    const effectiveMinutes = this.computeEffectiveMinutes(
      input.totalEstimatedMinutes,
      input.complexity,
    );

    const stepCount = Math.max(1, Math.ceil(effectiveMinutes / MAX_STEP_MINUTES));
    const steps = this.generateSteps(input, effectiveMinutes, stepCount);
    const totalEstimated = steps.reduce((sum, s) => sum + s.estimatedMinutes, 0);

    this.logger.debug(
      `Decomposed "${input.actionDescription.slice(0, 40)}" into ${steps.length} steps (${totalEstimated}min)`,
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

  private computeEffectiveMinutes(raw: number, complexity: ComplexActionInput['complexity']): number {
    switch (complexity) {
      case 'simple':
        return raw * 0.5;
      case 'moderate':
        return raw * 1.0;
      case 'complex':
        return raw * 1.6;
      case 'very_complex':
        return raw * 2.4;
    }
  }

  private generateSteps(
    input: ComplexActionInput,
    totalMinutes: number,
    targetCount: number,
  ): MicroStep[] {
    const steps: MicroStep[] = [];
    const baseMinutes = Math.max(
      MIN_STEP_MINUTES,
      Math.min(MAX_STEP_MINUTES, Math.round(totalMinutes / targetCount)),
    );

    const verbSequence = this.pickVerbSequence(input.priorKnowledgeLevel, targetCount);
    const toolAssists = this.buildToolAssists(input.availableTools, targetCount);

    let remainingMinutes = totalMinutes;
    const previousDescriptions: string[] = [];

    for (let i = 0; i < targetCount && remainingMinutes > 0; i++) {
      const isLastStep = i === targetCount - 1 || remainingMinutes <= MAX_STEP_MINUTES;
      const stepMinutes = isLastStep
        ? Math.max(MIN_STEP_MINUTES, remainingMinutes)
        : Math.min(baseMinutes, remainingMinutes);

      const verb = verbSequence[i % verbSequence.length] ?? 'Complete';
      const toolAssist = toolAssists[i % toolAssists.length] ?? null;
      const description = this.buildStepDescription(i, verb, input.actionDescription);

      const prevDescription = previousDescriptions[i - 1];
      const prerequisites: string[] =
        i > 0 && prevDescription !== undefined ? [prevDescription] : [];
      previousDescriptions.push(description);

      steps.push({
        step: i + 1,
        description,
        estimatedMinutes: stepMinutes,
        hasAssistedExecutionOption: toolAssist !== null,
        assistedExecutionDescription: toolAssist
          ? `Use ${toolAssist.assistedTool} to ${toolAssist.verb} this step`
          : null,
        prerequisites,
      });

      remainingMinutes -= stepMinutes;
    }

    if (steps.length === 0) {
      steps.push({
        step: 1,
        description: `Start: ${input.actionDescription}`,
        estimatedMinutes: MAX_STEP_MINUTES,
        hasAssistedExecutionOption: false,
        assistedExecutionDescription: null,
        prerequisites: [],
      });
    }

    return steps;
  }

  private pickVerbSequence(prior: ComplexActionInput['priorKnowledgeLevel'], count: number): string[] {
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

  private buildToolAssists(
    availableTools: readonly string[],
    targetCount: number,
  ): (ToolAssistMap | null)[] {
    if (availableTools.length === 0) {
      return Array.from({ length: targetCount }, () => null);
    }

    const tool0 = availableTools[0] ?? '';
    const tool1 = availableTools[1];
    const tool2 = availableTools[2];
    const mapped: (ToolAssistMap | null)[] = [
      { verb: 'draft', assistedTool: tool0 },
    ];

    if (tool1 !== undefined) {
      mapped.push({ verb: 'generate', assistedTool: tool1 });
    }

    if (tool2 !== undefined) {
      mapped.push({ verb: 'check', assistedTool: tool2 });
    }

    const standard: ToolAssistMap | null =
      tool0 !== '' ? { verb: 'assist with', assistedTool: tool0 } : null;

    while (mapped.length < targetCount) {
      mapped.push(standard);
    }

    return mapped;
  }

  private buildStepDescription(index: number, verb: string, action: string): string {
    if (index === 0) {
      return `${verb} the first piece of: ${action}`;
    }
    return `${verb} next part of: ${action}`;
  }
}
