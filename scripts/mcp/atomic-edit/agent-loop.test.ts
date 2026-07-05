import { describe, it, expect } from 'vitest';
import {
  createSession,
  recordEntry,
  advancePhase,
  nextStep,
  accept,
  requestRevision,
  proposalsForStep,
  AgentPhase,
} from './agent-loop.js';

describe('agent-loop', () => {
  describe('createSession', () => {
    it('initializes with plan phase', () => {
      const session = createSession('test issue', [
        { step: 1, description: 'Investigate', expectedOutcome: 'Found' },
      ]);
      expect(session.phase).toBe(AgentPhase.PLAN);
      expect(session.plan.issue).toBe('test issue');
      expect(session.plan.steps).toHaveLength(1);
    });

    it('assigns unique session ID', () => {
      const s1 = createSession('a', []);
      const s2 = createSession('b', []);
      expect(s1.sessionId).not.toBe(s2.sessionId);
    });
  });

  describe('advancePhase', () => {
    it('advances through initial phases', () => {
      const session = createSession('issue', [
        { step: 1, description: 'A', expectedOutcome: 'OK' },
      ]);
      expect(session.phase).toBe(AgentPhase.PLAN);
      advancePhase(session);
      expect(session.phase).toBe(AgentPhase.INVESTIGATE);
    });
  });

  describe('nextStep', () => {
    it('returns first incomplete step', () => {
      const session = createSession('issue', [
        { step: 1, description: 'A', expectedOutcome: 'OK' },
        { step: 2, description: 'B', expectedOutcome: 'OK' },
      ]);
      advancePhase(session);
      expect(typeof nextStep(session)).toBe('number');
    });

    it('returns null when all steps completed', () => {
      const session = createSession('issue', [
        { step: 1, description: 'A', expectedOutcome: 'OK' },
      ]);
      advancePhase(session);
      recordEntry(session, {
        step: 1,
        tool: 'read',
        findings: ['done'],
        at: Date.now(),
      });
      expect(nextStep(session)).toBe(null);
    });
  });

  describe('accept / requestRevision', () => {
    it('accept records a decision', () => {
      const session = createSession('issue', [
        { step: 1, description: 'A', expectedOutcome: 'OK' },
      ]);
      const decision = accept(session, {}, 'looks good');
      expect(decision.verdict).toBe('accepted');
    });

    it('requestRevision records a needs_revision', () => {
      const session = createSession('issue', [
        { step: 1, description: 'A', expectedOutcome: 'OK' },
      ]);
      const decision = requestRevision(session, 'try again', 'needs work');
      expect(decision.verdict).toBe('needs_revision');
    });
  });

  describe('proposalsForStep', () => {
    it('returns empty for no proposals', () => {
      const session = createSession('issue', [
        { step: 1, description: 'A', expectedOutcome: 'OK' },
      ]);
      expect(proposalsForStep(session, 1)).toHaveLength(0);
    });
  });
});
