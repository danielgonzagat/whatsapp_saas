import { Injectable, Logger } from '@nestjs/common';
import type { NoBlameTone } from './types';

interface GuardInput {
  readonly text: string;
  readonly context: 'action_suggestion' | 'friction_feedback' | 'pattern_report' | 'alternative_route';
}

const BLAME_MARKERS: readonly string[] = [
  'you failed to',
  'you should have',
  'you did not',
  'you forgot',
  'you missed',
  'you are not',
  'you never',
  'you always',
  'your mistake',
  'your fault',
  'why did you not',
  'why have you not',
  'you are too',
  'you lack',
  'you cannot',
  'you are incapable',
  'you are slow',
  'you procrastinated',
  'you are lazy',
];

const REPLACEMENTS: Readonly<Record<string, string>> = {
  'you should have': 'a possible step would have been',
  'you did not': 'it may have been possible to',
  'you forgot': 'this may have been overlooked',
  'you missed': 'this opportunity may have passed',
  'you are not': 'this area might benefit from',
  'you never': 'there has not yet been',
  'you always': 'there is a pattern of',
  'why did you not': 'what prevented',
  'why have you not': 'what has been preventing',
  'your mistake': 'the outcome that did not match expectations',
  'your fault': 'the contributing factors',
  'you are too': 'the approach could be more',
  'you lack': 'there may be room to develop',
  'you cannot': 'it may be challenging to',
  'you are incapable': 'this may be outside current scope',
  'you are slow': 'the pace could be optimized',
  'you procrastinated': 'the delay may have been due to',
  'you are lazy': 'the energy may not have been available',
};

@Injectable()
export class NoBlameToneGuardService {
  private readonly logger = new Logger(NoBlameToneGuardService.name);

  guard(input: GuardInput): NoBlameTone {
    const { rewrittenText, removed } = this.rewrite(input.text);
    const toneShift = this.detectToneShift(input.context);

    const result: NoBlameTone = {
      originalText: input.text,
      rewrittenText,
      blameMarkersRemoved: removed,
      toneShift,
      rewrittenAt: new Date().toISOString(),
    };

    if (removed.length > 0) {
      this.logger.debug(
        `Removed ${removed.length} blame markers from ${input.context} text`,
      );
    }

    return result;
  }

  private rewrite(text: string): { rewrittenText: string; removed: string[] } {
    let result = text;
    const removed: string[] = [];

    for (const marker of BLAME_MARKERS) {
      const lowerText = result.toLowerCase();
      const idx = lowerText.indexOf(marker.toLowerCase());
      if (idx !== -1) {
        const matched = result.slice(idx, idx + marker.length);
        removed.push(matched);
        const replacement = REPLACEMENTS[marker] ?? this.genericReplacement(marker);
        result = result.slice(0, idx) + replacement + result.slice(idx + marker.length);
      }
    }

    return { rewrittenText: result, removed };
  }

  private genericReplacement(marker: string): string {
    const withoutYou = marker.replace(/^you\s+/, '');
    return `the ${withoutYou}`;
  }

  private detectToneShift(context: GuardInput['context']): NoBlameTone['toneShift'] {
    switch (context) {
      case 'action_suggestion':
        return 'directive_to_invitational';
      case 'friction_feedback':
        return 'accusatory_to_observational';
      case 'pattern_report':
        return 'past_focus_to_future_focus';
      case 'alternative_route':
        return 'absolute_to_contextual';
    }
  }

  hasBlameMarkers(text: string): boolean {
    const lower = text.toLowerCase();
    return BLAME_MARKERS.some((m) => lower.includes(m.toLowerCase()));
  }
}
