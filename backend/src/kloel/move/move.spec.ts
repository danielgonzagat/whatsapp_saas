import { FrictionDetectorService } from './friction.detector';
import { StepDecomposerService } from './step-decomposer.service';
import { HOURS_24_MS } from './move.types';
import type { OwnerAction, ComplexActionInput } from './move.types';

const now = Date.now();

function pastHours(hours: number): string {
  return new Date(now - hours * 60 * 60 * 1000).toISOString();
}

function pastDays(days: number): string {
  return pastHours(days * 24);
}

function makeAction(overrides: Partial<OwnerAction> = {}): OwnerAction {
  return {
    id: 'action-1',
    workspaceId: 'ws-1',
    description: 'Set up email automation',
    createdAt: pastDays(3),
    lastProgressAt: null,
    priority: 'high',
    category: 'technical',
    estimatedMinutes: 60,
    hasExternalDependency: false,
    externalDependencyDescription: null,
    ...overrides,
  };
}

describe('Move module (Layer XXXI — Real Movement)', () => {
  describe('FrictionDetectorService (MOVE-001)', () => {
    const svc = new FrictionDetectorService();

    it('flags action never started and created >24h ago', () => {
      const results = svc.detectStuck([
        makeAction({ id: 'a1', createdAt: pastDays(2), lastProgressAt: null }),
      ]);
      expect(results).toHaveLength(1);
      expect(results[0].frictionKind).toBe('never_started');
      expect(results[0].hoursStuck).toBeGreaterThanOrEqual(48);
    });

    it('flags action with last progress >24h ago', () => {
      const results = svc.detectStuck([
        makeAction({ id: 'a2', createdAt: pastDays(5), lastProgressAt: pastDays(3) }),
      ]);
      expect(results).toHaveLength(1);
      expect(results[0].frictionKind).toBe('abandoned');
      expect(results[0].signals).toContain('likely_abandoned');
    });

    it('does NOT flag action created less than 24h ago', () => {
      const results = svc.detectStuck([
        makeAction({ id: 'a3', createdAt: pastHours(2), lastProgressAt: null }),
      ]);
      expect(results).toHaveLength(0);
    });

    it('does NOT flag action with recent progress (<24h)', () => {
      const results = svc.detectStuck([
        makeAction({ id: 'a4', createdAt: pastDays(10), lastProgressAt: pastHours(1) }),
      ]);
      expect(results).toHaveLength(0);
    });

    it('classifies action with external dependency as blocked', () => {
      const results = svc.detectStuck([
        makeAction({
          id: 'a5',
          createdAt: pastDays(4),
          lastProgressAt: pastDays(2),
          hasExternalDependency: true,
        }),
      ]);
      expect(results).toHaveLength(1);
      expect(results[0].frictionKind).toBe('blocked');
      expect(results[0].signals).toContain('external_dependency');
    });

    it('classifies large action (>120min) as overwhelmed', () => {
      const results = svc.detectStuck([
        makeAction({
          id: 'a6',
          createdAt: pastDays(3),
          lastProgressAt: pastDays(2),
          estimatedMinutes: 300,
        }),
      ]);
      expect(results).toHaveLength(1);
      expect(results[0].frictionKind).toBe('overwhelmed');
      expect(results[0].signals).toContain('large_action');
      expect(results[0].signals).toContain('action_too_large');
    });

    it('returns empty array when no actions are stuck', () => {
      const results = svc.detectStuck([
        makeAction({ id: 'a7', createdAt: pastHours(5), lastProgressAt: pastHours(2) }),
        makeAction({ id: 'a8', createdAt: pastHours(10), lastProgressAt: null }),
      ]);
      expect(results).toHaveLength(0);
    });

    it('scores critical priority higher than low priority', () => {
      const critical = svc.detectStuck([
        makeAction({ id: 'c1', createdAt: pastDays(2), lastProgressAt: null, priority: 'critical' }),
      ]);
      const low = svc.detectStuck([
        makeAction({ id: 'l1', createdAt: pastDays(2), lastProgressAt: null, priority: 'low' }),
      ]);
      expect(critical[0].frictionScore).toBeGreaterThan(low[0].frictionScore);
    });

    it('detects multiple stuck actions in a single batch', () => {
      const results = svc.detectStuck([
        makeAction({ id: 'b1', createdAt: pastDays(3), lastProgressAt: null }),
        makeAction({ id: 'b2', createdAt: pastDays(5), lastProgressAt: pastDays(3) }),
        makeAction({ id: 'b3', createdAt: pastHours(5), lastProgressAt: null }),
      ]);
      expect(results).toHaveLength(2);
    });

    it('produces recommendation for never_started with high score', () => {
      const results = svc.detectStuck([
        makeAction({ id: 'd1', createdAt: pastDays(5), lastProgressAt: null, priority: 'critical', estimatedMinutes: 300 }),
      ]);
      expect(results).toHaveLength(1);
      expect(results[0].recommendation).toContain('15 min');
      expect(results[0].frictionScore).toBeGreaterThan(0.6);
    });
  });

  describe('StepDecomposerService (MOVE-002)', () => {
    const svc = new StepDecomposerService();

    it('decomposes a complex action into multiple steps', () => {
      const result = svc.decompose({
        workspaceId: 'ws-1',
        actionDescription: 'Build lead capture funnel with A/B testing',
        totalEstimatedMinutes: 90,
        complexity: 'complex',
        hasDependencies: false,
        priorKnowledgeLevel: 'partial',
        availableTools: [],
      });
      expect(result.steps.length).toBeGreaterThanOrEqual(3);
      expect(result.totalEstimatedMinutes).toBeGreaterThan(0);
      expect(result.firstStepMinutes).toBeGreaterThan(0);
    });

    it('every step is <=15 minutes', () => {
      const result = svc.decompose({
        workspaceId: 'ws-1',
        actionDescription: 'Write email onboarding sequence',
        totalEstimatedMinutes: 60,
        complexity: 'moderate',
        hasDependencies: false,
        priorKnowledgeLevel: 'full',
        availableTools: [],
      });
      for (const step of result.steps) {
        expect(step.estimatedMinutes).toBeLessThanOrEqual(15);
      }
    });

    it('steps have sequential prerequisites', () => {
      const result = svc.decompose({
        workspaceId: 'ws-1',
        actionDescription: 'Set up affiliate tracking system',
        totalEstimatedMinutes: 120,
        complexity: 'moderate',
        hasDependencies: true,
        priorKnowledgeLevel: 'none',
        availableTools: [],
      });
      for (let i = 1; i < result.steps.length; i++) {
        expect(result.steps[i].prerequisites.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('first step has no prerequisites', () => {
      const result = svc.decompose({
        workspaceId: 'ws-1',
        actionDescription: 'Configure payment gateway integration',
        totalEstimatedMinutes: 30,
        complexity: 'simple',
        hasDependencies: false,
        priorKnowledgeLevel: 'full',
        availableTools: [],
      });
      if (result.steps.length > 0) {
        expect(result.steps[0].prerequisites).toHaveLength(0);
      }
    });

    it('steps have hasAssistedExecutionOption=true when tools are available', () => {
      const result = svc.decompose({
        workspaceId: 'ws-1',
        actionDescription: 'Create landing page variants',
        totalEstimatedMinutes: 45,
        complexity: 'moderate',
        hasDependencies: false,
        priorKnowledgeLevel: 'partial',
        availableTools: ['ChatGPT', 'Canva', 'Google Analytics'],
      });
      const assistedSteps = result.steps.filter((s) => s.hasAssistedExecutionOption);
      expect(assistedSteps.length).toBeGreaterThanOrEqual(1);
      const firstAssisted = assistedSteps[0];
      expect(firstAssisted.assistedExecutionDescription).toBeTruthy();
    });

    it('handles very small actions producing at least 1 step', () => {
      const result = svc.decompose({
        workspaceId: 'ws-1',
        actionDescription: 'Update one headline',
        totalEstimatedMinutes: 3,
        complexity: 'simple',
        hasDependencies: false,
        priorKnowledgeLevel: 'full',
        availableTools: [],
      });
      expect(result.steps.length).toBeGreaterThanOrEqual(1);
    });

    it('handles very large actions producing many steps', () => {
      const result = svc.decompose({
        workspaceId: 'ws-1',
        actionDescription: 'Rebuild complete checkout flow with multi-currency support',
        totalEstimatedMinutes: 2400,
        complexity: 'very_complex',
        hasDependencies: true,
        priorKnowledgeLevel: 'none',
        availableTools: [],
      });
      expect(result.steps.length).toBeGreaterThan(10);
    });

    it('hasAssistedExecutionDescription is null when no tools are available', () => {
      const result = svc.decompose({
        workspaceId: 'ws-1',
        actionDescription: 'Review quarterly metrics',
        totalEstimatedMinutes: 30,
        complexity: 'simple',
        hasDependencies: false,
        priorKnowledgeLevel: 'full',
        availableTools: [],
      });
      for (const step of result.steps) {
        expect(step.hasAssistedExecutionOption).toBe(false);
        expect(step.assistedExecutionDescription).toBeNull();
      }
    });

    it('firstStepMinutes reflects real step 1 duration', () => {
      const result = svc.decompose({
        workspaceId: 'ws-1',
        actionDescription: 'Design social media calendar',
        totalEstimatedMinutes: 40,
        complexity: 'moderate',
        hasDependencies: false,
        priorKnowledgeLevel: 'partial',
        availableTools: [],
      });
      expect(result.firstStepMinutes).toBe(result.steps[0].estimatedMinutes);
    });

    it('totalEstimatedMinutes equals sum of step minutes', () => {
      const result = svc.decompose({
        workspaceId: 'ws-1',
        actionDescription: 'Write product descriptions for catalog',
        totalEstimatedMinutes: 75,
        complexity: 'simple',
        hasDependencies: false,
        priorKnowledgeLevel: 'full',
        availableTools: ['ChatGPT'],
      });
      const sum = result.steps.reduce((acc, s) => acc + s.estimatedMinutes, 0);
      expect(result.totalEstimatedMinutes).toBe(sum);
    });
  });
});
