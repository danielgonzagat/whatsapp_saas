import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { TinyAction } from './types';

interface TinyActionInput {
  readonly workspaceId: string;
  readonly parentAction: string;
  readonly actionCategory: 'technical' | 'creative' | 'operational' | 'strategic' | 'communication';
  readonly timeAvailableMinutes: number;
  readonly energyLevel: 'low' | 'medium' | 'high';
  readonly contextSummary: string;
}

const CATEGORY_TEMPLATES: Record<TinyActionInput['actionCategory'], readonly string[]> = {
  technical: [
    'Write the first 10 lines of code',
    'Create the file structure',
    'Define the function signature',
    'Install one dependency',
    'Write a single test case',
  ],
  creative: [
    'Write one headline variation',
    'Draft a single sentence',
    'Sketch the layout with boxes',
    'Name the main concept',
    'Choose one reference image',
  ],
  operational: [
    'Open the dashboard and note one number',
    'Send one status update',
    'Check one metric',
    'Schedule one reminder',
    'Read one relevant document',
  ],
  strategic: [
    'Write one question that must be answered',
    'List three options without evaluating',
    'Define the single success criterion',
    'Name the constraint you know',
    'Write one sentence about what happens if you do nothing',
  ],
  communication: [
    'Write a one-sentence subject line',
    'Type the first greeting',
    'Draft the core message in one paragraph',
    'Decide who receives this and why',
    'Send to one person first as test',
  ],
};

const ENERGY_ADJUSTMENTS: Record<string, number> = {
  low: 0.5,
  medium: 1.0,
  high: 1.5,
};

@Injectable()
export class TinyActionSuggesterService {
  private readonly logger = new Logger(TinyActionSuggesterService.name);

  suggest(input: TinyActionInput): TinyAction {
    const template = this.pickTemplate(input);
    const adjustedMinutes = this.adjustForEnergy(input.timeAvailableMinutes, input.energyLevel);
    const description = this.buildDescription(template, input.contextSummary);
    const contextHelp = this.buildContextHelp(input);
    const motivationAnchor = this.buildMotivation(input);

    this.logger.debug(
      `Suggested tiny action for "${input.parentAction.slice(0, 40)}": ${description.slice(0, 50)}`,
    );

    return {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      parentAction: input.parentAction,
      description,
      estimatedMinutes: adjustedMinutes,
      contextHelp,
      motivationAnchor,
      suggestedAt: new Date().toISOString(),
    };
  }

  private pickTemplate(input: TinyActionInput): string {
    const templates = [...CATEGORY_TEMPLATES[input.actionCategory]];
    const seed = input.parentAction.length + input.timeAvailableMinutes;
    return templates[seed % templates.length]!;
  }

  private adjustForEnergy(minutes: number, energy: TinyActionInput['energyLevel']): number {
    const factor = ENERGY_ADJUSTMENTS[energy] ?? 1.0;
    return Math.max(2, Math.min(15, Math.round(minutes * factor)));
  }

  private buildDescription(template: string, context: string): string {
    return `${template}: ${context}`;
  }

  private buildContextHelp(input: TinyActionInput): string {
    if (input.energyLevel === 'low') {
      return 'Start where you are. This is the smallest possible forward movement.';
    }
    if (input.timeAvailableMinutes < 10) {
      return 'Tight window. This is optimized for speed, not completeness.';
    }
    return 'One clear step forward. Momentum, not perfection.';
  }

  private buildMotivation(input: TinyActionInput): string {
    if (input.energyLevel === 'low') {
      return 'Even a 2-minute action moves the needle';
    }
    return 'This single action unlocks the next one';
  }
}
