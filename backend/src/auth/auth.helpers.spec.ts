import { UnauthorizedException } from '@nestjs/common';
import { Agent } from '@prisma/client';
import {
  PATTERN_RE,
  assertAgentCanAuthenticate,
  buildAuthLogMessage,
  normalizeEmail,
} from './auth.helpers';

describe('auth.helpers', () => {
  describe('PATTERN_RE', () => {
    it('should be a regex pattern', () => {
      expect(Object.prototype.toString.call(PATTERN_RE)).toBe('[object RegExp]');
    });

    it('should match hyphens in UUIDs', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const matches = Array.from(uuid.matchAll(PATTERN_RE));
      expect(matches.length).toBeGreaterThan(0);
    });

    it('should remove hyphens when used in replace', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const result = uuid.replace(PATTERN_RE, '');
      expect(result).not.toContain('-');
    });
  });

  describe('normalizeEmail', () => {
    it('should lowercase email address', () => {
      expect(normalizeEmail('Test@Example.COM')).toBe('test@example.com');
    });

    it('should trim whitespace', () => {
      expect(normalizeEmail('  test@example.com  ')).toBe('test@example.com');
    });

    it('should handle already normalized emails', () => {
      expect(normalizeEmail('test@example.com')).toBe('test@example.com');
    });

    it('should normalize complex email addresses', () => {
      expect(normalizeEmail('  John.Doe+Filter@Example.Com  ')).toBe('john.doe+filter@example.com');
    });

    it('should preserve special characters in local part', () => {
      expect(normalizeEmail('user+tag@EXAMPLE.COM')).toBe('user+tag@example.com');
    });
  });

  describe('buildAuthLogMessage', () => {
    it('should build log message with event name', () => {
      const message = buildAuthLogMessage('test_event', {});
      expect(message).toContain('test_event');
    });

    it('should include provided context data', () => {
      const message = buildAuthLogMessage('login_success', {
        agentId: 'agent-123',
        email: 'test@example.com',
      });
      expect(message).toContain('agent-123');
      expect(message).toContain('test@example.com');
    });

    it('should handle empty context', () => {
      const message = buildAuthLogMessage('logout', {});
      expect(message).toBeTruthy();
      expect(typeof message).toBe('string');
    });

    it('should include error ID when provided', () => {
      const errorId = 'err-uuid-123';
      const message = buildAuthLogMessage('auth_error', { errorId });
      expect(message).toContain(errorId);
    });

    it('should format multiple context fields', () => {
      const message = buildAuthLogMessage('workspace_not_found', {
        errorId: 'err-123',
        agentId: 'agent-456',
        workspaceId: 'ws-789',
        email: 'test@example.com',
      });
      expect(message).toContain('err-123');
      expect(message).toContain('agent-456');
      expect(message).toContain('ws-789');
      expect(message).toContain('test@example.com');
    });
  });

  describe('assertAgentCanAuthenticate', () => {
    const validAgent: Partial<Agent> = {
      id: 'agent-123',
      deletedAt: null,
      disabledAt: null,
    };

    it('should not throw for valid agent', () => {
      expect(() => {
        assertAgentCanAuthenticate(validAgent);
      }).not.toThrow();
    });

    it('should throw UnauthorizedException when agent is deleted', () => {
      const deletedAgent: Partial<Agent> = {
        ...validAgent,
        deletedAt: new Date(),
      };
      expect(() => {
        assertAgentCanAuthenticate(deletedAgent);
      }).toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when agent is disabled', () => {
      const disabledAgent: Partial<Agent> = {
        ...validAgent,
        disabledAt: new Date(),
      };
      expect(() => {
        assertAgentCanAuthenticate(disabledAgent);
      }).toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when agent is both deleted and disabled', () => {
      const compromisedAgent: Partial<Agent> = {
        ...validAgent,
        deletedAt: new Date(),
        disabledAt: new Date(),
      };
      expect(() => {
        assertAgentCanAuthenticate(compromisedAgent);
      }).toThrow(UnauthorizedException);
    });

    it('should throw when deletedAt is present even if disabledAt is null', () => {
      const deletedButNotDisabled: Partial<Agent> = {
        id: 'agent-789',
        deletedAt: new Date('2024-01-01'),
        disabledAt: null,
      };
      expect(() => {
        assertAgentCanAuthenticate(deletedButNotDisabled);
      }).toThrow(UnauthorizedException);
    });

    it('should throw when disabledAt is present even if deletedAt is null', () => {
      const disabledButNotDeleted: Partial<Agent> = {
        id: 'agent-789',
        deletedAt: null,
        disabledAt: new Date('2024-01-01'),
      };
      expect(() => {
        assertAgentCanAuthenticate(disabledButNotDeleted);
      }).toThrow(UnauthorizedException);
    });
  });
});
