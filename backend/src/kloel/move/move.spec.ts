import { FrictionDetectorService } from './friction.detector';
import { StepDecomposerService } from './step.decomposer';
import { TinyActionSuggesterService } from './tiny-action.suggester';
import { PartialExecutionOfferService } from './partial-execution.offer';
import { AlternativeRouteBuilderService } from './alternative-route.builder';
import { PatternLearnerService } from './pattern.learner';
import { NoBlameToneGuardService } from './no-blame-tone.guard';

describe('Move module (UTP-MOVE-001..007)', () => {
  describe('FrictionDetectorService (MOVE-001)', () => {
    const svc = new FrictionDetectorService();

    it('detects overwhelm for large action with low clarity', () => {
      const result = svc.detect({
        workspaceId: 'ws-1',
        targetAction: 'Launch entire marketing campaign across all channels',
        actionSize: 'giant',
        clarityScore: 0.2,
        hasPriorKnowledge: false,
        hasExternalDependency: false,
        paralellOptions: 5,
        recentAbandonmentCount: 3,
      });
      expect(result.frictionType).toBe('overwhelm');
      expect(result.frictionScore).toBeGreaterThan(0.6);
    });

    it('detects ambiguity for moderate action with no prior knowledge', () => {
      const result = svc.detect({
        workspaceId: 'ws-1',
        targetAction: 'Set up affiliate tracking',
        actionSize: 'medium',
        clarityScore: 0.3,
        hasPriorKnowledge: false,
        hasExternalDependency: false,
        paralellOptions: 1,
        recentAbandonmentCount: 0,
      });
      expect(result.frictionType).toBe('ambiguity');
      expect(result.frictionScore).toBeGreaterThan(0.3);
    });

    it('detects external_blocker when dependency exists', () => {
      const result = svc.detect({
        workspaceId: 'ws-1',
        targetAction: 'Integrate payment gateway',
        actionSize: 'large',
        clarityScore: 0.7,
        hasPriorKnowledge: true,
        hasExternalDependency: true,
        paralellOptions: 1,
        recentAbandonmentCount: 0,
      });
      expect(result.frictionType).toBe('external_blocker');
    });

    it('detects perfectionism with high clarity but abandonment', () => {
      const result = svc.detect({
        workspaceId: 'ws-1',
        targetAction: 'Write perfect landing page copy',
        actionSize: 'small',
        clarityScore: 0.8,
        hasPriorKnowledge: true,
        hasExternalDependency: false,
        paralellOptions: 1,
        recentAbandonmentCount: 4,
      });
      expect(result.frictionType).toBe('perfectionism');
    });

    it('detects scope_creep with too many options', () => {
      const result = svc.detect({
        workspaceId: 'ws-1',
        targetAction: 'Optimize all ad campaigns',
        actionSize: 'medium',
        clarityScore: 0.5,
        hasPriorKnowledge: true,
        hasExternalDependency: false,
        paralellOptions: 7,
        recentAbandonmentCount: 2,
      });
      expect(result.frictionType).toBe('scope_creep');
    });

    it('returns low friction score for tiny action with high clarity', () => {
      const result = svc.detect({
        workspaceId: 'ws-1',
        targetAction: 'Change one headline',
        actionSize: 'tiny',
        clarityScore: 0.9,
        hasPriorKnowledge: true,
        hasExternalDependency: false,
        paralellOptions: 1,
        recentAbandonmentCount: 0,
      });
      expect(result.frictionScore).toBeLessThan(0.3);
    });
  });

  describe('StepDecomposerService (MOVE-002)', () => {
    const svc = new StepDecomposerService();

    it('decomposes a 2-hour complex action into multiple steps', () => {
      const result = svc.decompose({
        workspaceId: 'ws-1',
        actionDescription: 'Build lead capture funnel',
        totalEstimatedHours: 2,
        complexity: 'complex',
        hasDependencies: false,
        priorKnowledgeLevel: 'partial',
      });
      expect(result.steps.length).toBeGreaterThanOrEqual(3);
      expect(result.totalEstimatedMinutes).toBeGreaterThan(0);
      expect(result.firstStepMinutes).toBeGreaterThan(0);
    });

    it('produces steps under 15 minutes each', () => {
      const result = svc.decompose({
        workspaceId: 'ws-1',
        actionDescription: 'Write email sequence',
        totalEstimatedHours: 1,
        complexity: 'simple',
        hasDependencies: false,
        priorKnowledgeLevel: 'full',
      });
      for (const step of result.steps) {
        expect(step.estimatedMinutes).toBeLessThanOrEqual(15);
      }
    });

    it('produces at least one step even for very small actions', () => {
      const result = svc.decompose({
        workspaceId: 'ws-1',
        actionDescription: 'Small task',
        totalEstimatedHours: 0.05,
        complexity: 'simple',
        hasDependencies: false,
        priorKnowledgeLevel: 'full',
      });
      expect(result.steps.length).toBeGreaterThanOrEqual(1);
    });

    it('handles very complex actions with many steps', () => {
      const result = svc.decompose({
        workspaceId: 'ws-1',
        actionDescription: 'Rebuild entire checkout flow',
        totalEstimatedHours: 30,
        complexity: 'very_complex',
        hasDependencies: true,
        priorKnowledgeLevel: 'none',
      });
      expect(result.steps.length).toBeGreaterThan(10);
    });
  });

  describe('TinyActionSuggesterService (MOVE-003)', () => {
    const svc = new TinyActionSuggesterService();

    it('suggests a tiny technical action', () => {
      const result = svc.suggest({
        workspaceId: 'ws-1',
        parentAction: 'Implement authentication',
        actionCategory: 'technical',
        timeAvailableMinutes: 10,
        energyLevel: 'medium',
        contextSummary: 'set up JWT auth for the admin panel',
      });
      expect(result.description).toBeTruthy();
      expect(result.estimatedMinutes).toBeLessThanOrEqual(15);
      expect(result.estimatedMinutes).toBeGreaterThanOrEqual(2);
      expect(result.motivationAnchor).toBeTruthy();
    });

    it('adjusts minute estimate for low energy', () => {
      const result = svc.suggest({
        workspaceId: 'ws-1',
        parentAction: 'Write ad copy',
        actionCategory: 'creative',
        timeAvailableMinutes: 15,
        energyLevel: 'low',
        contextSummary: 'Facebook ad for new product',
      });
      expect(result.estimatedMinutes).toBeLessThanOrEqual(15);
      expect(result.contextHelp).toContain('smallest possible');
    });

    it('suggests a strategic tiny action', () => {
      const result = svc.suggest({
        workspaceId: 'ws-1',
        parentAction: 'Define quarterly goals',
        actionCategory: 'strategic',
        timeAvailableMinutes: 5,
        energyLevel: 'high',
        contextSummary: 'Q3 revenue targets for the marketing team',
      });
      expect(result.description).toBeTruthy();
      expect(result.estimatedMinutes).toBeGreaterThanOrEqual(2);
    });
  });

  describe('PartialExecutionOfferService (MOVE-004)', () => {
    const svc = new PartialExecutionOfferService();

    it('offers partial execution for a large action', () => {
      const result = svc.offer({
        workspaceId: 'ws-1',
        originalAction: 'Build complete affiliate dashboard',
        fullEstimatedMinutes: 480,
        coreValueDescription: 'affiliate commission summary',
        niceToHaveDescription: 'real-time charts and exports',
        minimumViableOutcome: 'shows commission totals per affiliate',
      });
      expect(result).not.toBeNull();
      expect(result!.savedTimePercent).toBeGreaterThan(0);
      expect(result!.valueRetainedPercent).toBeGreaterThan(50);
    });

    it('returns null for actions under 10 minutes', () => {
      const result = svc.offer({
        workspaceId: 'ws-1',
        originalAction: 'Tiny task',
        fullEstimatedMinutes: 5,
        coreValueDescription: 'core',
        niceToHaveDescription: 'nice',
        minimumViableOutcome: 'done',
      });
      expect(result).toBeNull();
    });

    it('retains high value percentage for reasonable actions', () => {
      const result = svc.offer({
        workspaceId: 'ws-1',
        originalAction: 'Write 10 email variants',
        fullEstimatedMinutes: 180,
        coreValueDescription: 'first 3 variants',
        niceToHaveDescription: 'remaining 7 variants',
        minimumViableOutcome: '3 top variants ready to test',
      });
      expect(result).not.toBeNull();
      expect(result!.valueRetainedPercent).toBeGreaterThanOrEqual(55);
    });
  });

  describe('AlternativeRouteBuilderService (MOVE-005)', () => {
    const svc = new AlternativeRouteBuilderService();

    it('builds alternative route around a blocker', () => {
      const result = svc.build({
        workspaceId: 'ws-1',
        blockedAction: 'Launch Facebook ads campaign',
        blocker: 'Facebook ad account not approved yet',
        blockedActionEffortMinutes: 120,
        availableResources: ['Google Ads account'],
        constraints: ['budget limit $100/day'],
        desiredOutcome: 'generate leads this week',
      });
      expect(result).not.toBeNull();
      expect(result!.effortRatio).toBeLessThanOrEqual(1);
      expect(result!.outcomeProximity).toBeGreaterThanOrEqual(0.5);
    });

    it('returns null when no viable routes exist', () => {
      const result = svc.build({
        workspaceId: 'ws-1',
        blockedAction: 'Do something',
        blocker: 'all paths blocked',
        blockedActionEffortMinutes: 10,
        availableResources: [],
        constraints: ['no access', 'no budget', 'no permission'],
        desiredOutcome: 'impossible outcome',
      });
      expect(result).toBeNull();
    });

    it('prefers delegate route when resources available', () => {
      const result = svc.build({
        workspaceId: 'ws-1',
        blockedAction: 'Write product descriptions',
        blocker: 'No copywriter available',
        blockedActionEffortMinutes: 240,
        availableResources: ['AI content generator'],
        constraints: [],
        desiredOutcome: 'product descriptions live on site',
      });
      expect(result).not.toBeNull();
      expect(result!.effortRatio).toBeLessThan(0.5);
    });
  });

  describe('PatternLearnerService (MOVE-006)', () => {
    const svc = new PatternLearnerService();

    it('learns analysis paralysis pattern', () => {
      const results = svc.learn({
        workspaceId: 'ws-1',
        recentFrictionTypes: ['ambiguity', 'overwhelm', 'ambiguity', 'overwhelm', 'ambiguity'],
        actionAbandonmentRate: 0.6,
        averageTimeToStartMinutes: 120,
        mostCommonBlocker: 'too many priorities',
        mostCommonResponse: 'reduce to one focus',
        totalEventsObserved: 10,
      });
      expect(results.length).toBeGreaterThan(0);
      const pattern = results.find((p) => p.patternType === 'analysis_paralysis');
      expect(pattern).toBeDefined();
      expect(pattern!.ownerCriterionFeed).toBeTruthy();
    });

    it('learns waiting on external pattern', () => {
      const results = svc.learn({
        workspaceId: 'ws-1',
        recentFrictionTypes: ['external_blocker', 'external_blocker', 'overwhelm'],
        actionAbandonmentRate: 0.3,
        averageTimeToStartMinutes: 45,
        mostCommonBlocker: 'waiting for API key',
        mostCommonResponse: 'start without it',
        totalEventsObserved: 5,
      });
      const pattern = results.find((p) => p.patternType === 'waiting_on_external');
      expect(pattern).toBeDefined();
    });

    it('returns empty for insufficient events', () => {
      const results = svc.learn({
        workspaceId: 'ws-1',
        recentFrictionTypes: ['ambiguity'],
        actionAbandonmentRate: 0.2,
        averageTimeToStartMinutes: 10,
        mostCommonBlocker: 'unknown',
        mostCommonResponse: 'ask for help',
        totalEventsObserved: 1,
      });
      expect(results).toHaveLength(0);
    });

    it('learns fear of imperfect pattern', () => {
      const results = svc.learn({
        workspaceId: 'ws-1',
        recentFrictionTypes: ['perfectionism', 'perfectionism', 'ambiguity'],
        actionAbandonmentRate: 0.4,
        averageTimeToStartMinutes: 30,
        mostCommonBlocker: 'wanting it perfect',
        mostCommonResponse: 'ship the draft',
        totalEventsObserved: 6,
      });
      const pattern = results.find((p) => p.patternType === 'fear_of_imperfect');
      expect(pattern).toBeDefined();
      expect(pattern!.frequency).toBeGreaterThanOrEqual(2);
    });

    it('getDominantPattern returns highest frequency pattern', () => {
      const results = svc.learn({
        workspaceId: 'ws-1',
        recentFrictionTypes: ['overwhelm', 'overwhelm', 'overwhelm', 'overwhelm', 'overwhelm', 'ambiguity', 'ambiguity'],
        actionAbandonmentRate: 0.7,
        averageTimeToStartMinutes: 200,
        mostCommonBlocker: 'too many things',
        mostCommonResponse: 'delegate',
        totalEventsObserved: 12,
      });
      const dominant = svc.getDominantPattern(results);
      expect(dominant).not.toBeNull();
    });

    it('getDominantPattern returns null for empty array', () => {
      expect(svc.getDominantPattern([])).toBeNull();
    });

    it('getPatternCount returns correct count', () => {
      const results = svc.learn({
        workspaceId: 'ws-1',
        recentFrictionTypes: ['ambiguity', 'overwhelm', 'ambiguity', 'overwhelm', 'ambiguity', 'perfectionism', 'perfectionism'],
        actionAbandonmentRate: 0.5,
        averageTimeToStartMinutes: 90,
        mostCommonBlocker: 'overthinking',
        mostCommonResponse: 'start small',
        totalEventsObserved: 10,
      });
      expect(svc.getPatternCount(results)).toBeGreaterThan(0);
    });
  });

  describe('NoBlameToneGuardService (MOVE-007)', () => {
    const svc = new NoBlameToneGuardService();

    it('removes blame markers from text', () => {
      const result = svc.guard({
        text: 'You should have started this campaign last week.',
        context: 'friction_feedback',
      });
      expect(result.blameMarkersRemoved.length).toBeGreaterThan(0);
      expect(result.rewrittenText).not.toContain('you should have');
      expect(result.toneShift).toBe('accusatory_to_observational');
    });

    it('preserves text without blame markers unchanged', () => {
      const result = svc.guard({
        text: 'The next step is to review the campaign metrics.',
        context: 'action_suggestion',
      });
      expect(result.blameMarkersRemoved.length).toBe(0);
      expect(result.rewrittenText).toBe('The next step is to review the campaign metrics.');
    });

    it('detects blame markers in text', () => {
      expect(svc.hasBlameMarkers('You forgot to check the results')).toBe(true);
      expect(svc.hasBlameMarkers('Let us review the results together')).toBe(false);
    });

    it('handles multiple blame markers', () => {
      const result = svc.guard({
        text: 'You did not follow up and you forgot the deadline.',
        context: 'pattern_report',
      });
      expect(result.blameMarkersRemoved.length).toBeGreaterThanOrEqual(2);
      expect(result.toneShift).toBe('past_focus_to_future_focus');
    });

    it('applies directive_to_invitational for action suggestions', () => {
      const result = svc.guard({
        text: 'You should have configured the webhook first.',
        context: 'action_suggestion',
      });
      expect(result.toneShift).toBe('directive_to_invitational');
    });

    it('applies absolute_to_contextual for alternative routes', () => {
      const result = svc.guard({
        text: 'You cannot use this integration.',
        context: 'alternative_route',
      });
      expect(result.toneShift).toBe('absolute_to_contextual');
    });
  });
});
