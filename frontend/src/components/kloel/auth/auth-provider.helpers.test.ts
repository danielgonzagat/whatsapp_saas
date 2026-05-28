import { describe, expect, it } from 'vitest';
import {
  buildEmptyAuthState,
  buildEmptySubscription,
  isUnauthorizedStatus,
  mapAuthErrorStatusToMessage,
  mapSubscriptionResponse,
  pickUserDisplayName,
  projectWorkspace,
} from './auth-provider.helpers';

describe('isUnauthorizedStatus', () => {
  it('treats 401 and 403 as unauthorized', () => {
    expect(isUnauthorizedStatus(401)).toBe(true);
    expect(isUnauthorizedStatus(403)).toBe(true);
  });

  it('treats other statuses (including undefined) as authorized', () => {
    expect(isUnauthorizedStatus(200)).toBe(false);
    expect(isUnauthorizedStatus(429)).toBe(false);
    expect(isUnauthorizedStatus(500)).toBe(false);
    expect(isUnauthorizedStatus(undefined)).toBe(false);
  });
});

describe('buildEmptySubscription', () => {
  it('returns a zeroed subscription with status none', () => {
    const sub = buildEmptySubscription();
    expect(sub.status).toBe('none');
    expect(sub.trialDaysLeft).toBe(0);
    expect(sub.creditsBalance).toBe(0);
    expect(sub.plan).toBeUndefined();
  });

  it('returns a fresh object each call (no shared mutation)', () => {
    const a = buildEmptySubscription();
    const b = buildEmptySubscription();
    expect(a).not.toBe(b);
    a.trialDaysLeft = 7;
    expect(b.trialDaysLeft).toBe(0);
  });
});

describe('buildEmptyAuthState', () => {
  it('returns a logged-out state with isLoading false by default', () => {
    const s = buildEmptyAuthState();
    expect(s.isAuthenticated).toBe(false);
    expect(s.isLoading).toBe(false);
    expect(s.justSignedUp).toBe(false);
    expect(s.hasCompletedOnboarding).toBe(false);
    expect(s.user).toBeNull();
    expect(s.workspace).toBeNull();
    expect(s.subscription).toEqual(buildEmptySubscription());
  });

  it('honors isLoading override (used at bootstrap)', () => {
    expect(buildEmptyAuthState({ isLoading: true }).isLoading).toBe(true);
    expect(buildEmptyAuthState({ isLoading: false }).isLoading).toBe(false);
  });
});

describe('mapSubscriptionResponse', () => {
  it('returns null for null/undefined payloads', () => {
    expect(mapSubscriptionResponse(null)).toBeNull();
    expect(mapSubscriptionResponse(undefined)).toBeNull();
  });

  it('coerces missing fields to defaults', () => {
    expect(mapSubscriptionResponse({})).toEqual({
      status: 'none',
      trialDaysLeft: 0,
      creditsBalance: 0,
    });
  });

  it('passes through full payload incl. plan', () => {
    expect(
      mapSubscriptionResponse({
        status: 'active',
        trialDaysLeft: 3,
        creditsBalance: 1000,
        plan: 'pro',
      }),
    ).toEqual({
      status: 'active',
      trialDaysLeft: 3,
      creditsBalance: 1000,
      plan: 'pro',
    });
  });

  it('omits plan key when payload.plan is null/undefined', () => {
    const out = mapSubscriptionResponse({ status: 'trial', trialDaysLeft: 5 })!;
    expect(out.status).toBe('trial');
    expect(out.trialDaysLeft).toBe(5);
    expect('plan' in out).toBe(false);
  });

  it('coerces null trialDaysLeft/creditsBalance to 0 (not null)', () => {
    const out = mapSubscriptionResponse({
      status: 'active',
      trialDaysLeft: null,
      creditsBalance: null,
    })!;
    expect(out.trialDaysLeft).toBe(0);
    expect(out.creditsBalance).toBe(0);
  });
});

describe('mapAuthErrorStatusToMessage', () => {
  it('maps 409 to "email already used" only on signup channel', () => {
    expect(mapAuthErrorStatusToMessage(409, 'signup')).toBe(
      'E-mail já cadastrado. Faça login.',
    );
    expect(mapAuthErrorStatusToMessage(409, 'signin')).toBeNull();
    expect(mapAuthErrorStatusToMessage(409, 'google')).toBeNull();
  });

  it('maps 429 to throttle message on every channel', () => {
    const expected = 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
    expect(mapAuthErrorStatusToMessage(429, 'signup')).toBe(expected);
    expect(mapAuthErrorStatusToMessage(429, 'signin')).toBe(expected);
    expect(mapAuthErrorStatusToMessage(429, 'google')).toBe(expected);
    expect(mapAuthErrorStatusToMessage(429, 'facebook')).toBe(expected);
    expect(mapAuthErrorStatusToMessage(429, 'magic-link')).toBe(expected);
  });

  it('maps 503 to generic outage on signup/signin/magic-link', () => {
    const expected = 'Serviço indisponível no momento. Tente novamente em instantes.';
    expect(mapAuthErrorStatusToMessage(503, 'signup')).toBe(expected);
    expect(mapAuthErrorStatusToMessage(503, 'signin')).toBe(expected);
    expect(mapAuthErrorStatusToMessage(503, 'magic-link')).toBe(expected);
  });

  it('prefers rawError on 503 for Google/Facebook, falling back to channel default', () => {
    expect(mapAuthErrorStatusToMessage(503, 'google', 'Specific Google msg')).toBe(
      'Specific Google msg',
    );
    expect(mapAuthErrorStatusToMessage(503, 'google')).toBe(
      'Login com Google indisponível no momento. Tente novamente em instantes.',
    );
    expect(mapAuthErrorStatusToMessage(503, 'facebook', 'Specific FB msg')).toBe(
      'Specific FB msg',
    );
    expect(mapAuthErrorStatusToMessage(503, 'facebook')).toBe(
      'Login com Facebook indisponível no momento. Tente novamente em instantes.',
    );
  });

  it('returns null for statuses outside the known set so callers can fall back to raw error', () => {
    expect(mapAuthErrorStatusToMessage(400, 'signup')).toBeNull();
    expect(mapAuthErrorStatusToMessage(500, 'signin')).toBeNull();
    expect(mapAuthErrorStatusToMessage(undefined, 'google')).toBeNull();
  });
});

describe('pickUserDisplayName', () => {
  it('prefers server-provided userName', () => {
    expect(
      pickUserDisplayName({
        userName: 'Alice',
        userEmail: 'a@a.com',
        fallbackName: 'Bob',
        fallbackEmail: 'b@b.com',
      }),
    ).toBe('Alice');
  });

  it('falls back to fallbackName when userName is empty/null', () => {
    expect(
      pickUserDisplayName({
        userName: '',
        userEmail: 'a@a.com',
        fallbackName: 'Bob',
      }),
    ).toBe('Bob');
    expect(
      pickUserDisplayName({
        userName: null,
        userEmail: 'a@a.com',
        fallbackName: 'Carol',
      }),
    ).toBe('Carol');
  });

  it('falls back to local-part of fallbackEmail when userName and fallbackName are absent', () => {
    expect(
      pickUserDisplayName({
        userEmail: 'a@a.com',
        fallbackEmail: 'jane.doe@example.com',
      }),
    ).toBe('jane.doe');
  });

  it('falls back to local-part of userEmail as last resort', () => {
    expect(pickUserDisplayName({ userEmail: 'john@example.com' })).toBe('john');
  });

  it('handles malformed user email by returning empty string', () => {
    expect(pickUserDisplayName({ userEmail: '' })).toBe('');
  });
});

describe('projectWorkspace', () => {
  it('returns null when raw is null/undefined', () => {
    expect(projectWorkspace(null)).toBeNull();
    expect(projectWorkspace(undefined)).toBeNull();
  });

  it('returns null when raw has no id', () => {
    expect(projectWorkspace({ id: '', name: 'X' })).toBeNull();
    expect(projectWorkspace({ id: null, name: 'X' })).toBeNull();
    expect(projectWorkspace({ name: 'X' })).toBeNull();
  });

  it('uses "Workspace" as fallback name when name is empty/null', () => {
    expect(projectWorkspace({ id: 'w1' })).toEqual({ id: 'w1', name: 'Workspace' });
    expect(projectWorkspace({ id: 'w1', name: null })).toEqual({
      id: 'w1',
      name: 'Workspace',
    });
    expect(projectWorkspace({ id: 'w1', name: '' })).toEqual({
      id: 'w1',
      name: 'Workspace',
    });
  });

  it('uses provided name when present', () => {
    expect(projectWorkspace({ id: 'w1', name: 'Acme' })).toEqual({
      id: 'w1',
      name: 'Acme',
    });
  });
});
