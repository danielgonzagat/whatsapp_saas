import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { OwnerAction, FrictionDetection, FrictionKind } from './move.types';
import { HOURS_24_MS } from './move.types';

@Injectable()
export class FrictionDetectorService {
  private readonly logger = new Logger(FrictionDetectorService.name);

  detectStuck(actions: readonly OwnerAction[]): FrictionDetection[] {
    const now = Date.now();
    const stuck = actions.filter((a) => this.isStuck(a, now));

    this.logger.debug(`Scanned ${actions.length} actions, ${stuck.length} stuck >24h`);

    return stuck.map((action) => this.buildDetection(action, now));
  }

  private isStuck(action: OwnerAction, now: number): boolean {
    const createdMs = new Date(action.createdAt).getTime();
    const ageMs = now - createdMs;

    if (ageMs < HOURS_24_MS) {
      return false;
    }

    if (action.lastProgressAt === null) {
      return true;
    }

    const lastProgressMs = new Date(action.lastProgressAt).getTime();
    const stalledMs = now - lastProgressMs;

    return stalledMs >= HOURS_24_MS;
  }

  private buildDetection(action: OwnerAction, now: number): FrictionDetection {
    const createdMs = new Date(action.createdAt).getTime();
    const hoursStuck = this.calcHoursStuck(action, now);
    const frictionKind = this.classifyFrictionKind(action, createdMs);
    const signals = this.gatherSignals(action, frictionKind, hoursStuck);
    const frictionScore = this.computeScore(action, frictionKind, hoursStuck);
    const recommendation = this.buildRecommendation(frictionKind, frictionScore, action);

    return {
      id: randomUUID(),
      workspaceId: action.workspaceId,
      actionId: action.id,
      actionDescription: action.description,
      hoursStuck: Math.round(hoursStuck * 10) / 10,
      frictionKind,
      frictionScore: Math.round(frictionScore * 1000) / 1000,
      signals,
      recommendation,
      detectedAt: new Date().toISOString(),
    };
  }

  private calcHoursStuck(action: OwnerAction, now: number): number {
    const createdMs = new Date(action.createdAt).getTime();
    if (action.lastProgressAt === null) {
      return (now - createdMs) / (1000 * 60 * 60);
    }
    const lastProgressMs = new Date(action.lastProgressAt).getTime();
    return (now - lastProgressMs) / (1000 * 60 * 60);
  }

  private classifyFrictionKind(action: OwnerAction, createdMs: number): FrictionKind {
    void createdMs;
    if (action.lastProgressAt === null) {
      return 'never_started';
    }

    const lastProgressMs = new Date(action.lastProgressAt).getTime();
    const stalledHours = (Date.now() - lastProgressMs) / (1000 * 60 * 60);

    if (action.hasExternalDependency) {
      return 'blocked';
    }

    if (stalledHours >= 72) {
      return 'abandoned';
    }

    if (action.estimatedMinutes > 120) {
      return 'overwhelmed';
    }

    return 'stalled';
  }

  private gatherSignals(action: OwnerAction, kind: FrictionKind, hoursStuck: number): string[] {
    const signals: string[] = [];

    signals.push(`stuck_${Math.floor(hoursStuck / 24)}_days`);

    if (action.lastProgressAt === null) {
      signals.push('never_had_progress');
    }

    if (action.hasExternalDependency) {
      signals.push('external_dependency');
    }

    if (action.estimatedMinutes > 120) {
      signals.push('large_action');
    }

    if (action.estimatedMinutes > 480) {
      signals.push('giant_action');
    }

    if (action.priority === 'critical') {
      signals.push('critical_priority');
    }

    if (kind === 'abandoned') {
      signals.push('likely_abandoned');
    }

    if (kind === 'overwhelmed') {
      signals.push('action_too_large');
    }

    return signals;
  }

  private computeScore(action: OwnerAction, kind: FrictionKind, hoursStuck: number): number {
    let score = 0;

    score += Math.min(hoursStuck / 168, 1) * 0.5;

    if (action.lastProgressAt === null) {
      score += 0.15;
    }

    if (action.hasExternalDependency) {
      score += 0.1;
    }

    const estimatedHours = action.estimatedMinutes / 60;
    score += Math.min(estimatedHours / 20, 1) * 0.2;

    switch (action.priority) {
      case 'critical':
        score += 0.15;
        break;
      case 'high':
        score += 0.08;
        break;
      default:
        break;
    }

    if (kind === 'abandoned') {
      score = Math.min(score + 0.1, 1);
    }

    return Math.min(Math.max(score, 0), 1);
  }

  private buildRecommendation(kind: FrictionKind, score: number, action: OwnerAction): string {
    const urgency = score >= 0.7 ? 'immediate' : score >= 0.4 ? 'soon' : 'watch';

    if (kind === 'never_started') {
      return urgency === 'immediate'
        ? 'Decompose into a single tiny first step of 15 min or less and execute today'
        : 'Define the smallest possible first action and schedule it';
    }

    if (kind === 'abandoned') {
      return 'Reassess whether this action is still relevant. If yes, restart with a single atomic step';
    }

    if (kind === 'overwhelmed') {
      return `Break down "${action.description}" into steps of 15 min or less. Start with step 1 only`;
    }

    if (kind === 'blocked') {
      return 'Identify the smallest action possible without the blocked resource and execute it';
    }

    return 'Resume with the next atomic step. Consider if the remaining work can be simplified';
  }
}
