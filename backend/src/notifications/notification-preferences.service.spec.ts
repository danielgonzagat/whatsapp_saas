import {
  DEFAULT_EMAIL_NOTIFICATION_PREFERENCES,
  NotificationPreferencesService,
  notificationPreferencesKey,
  parseStoredNotificationPreferences,
  sanitizeNotificationPreferencesUpdate,
} from './notification-preferences.service';

describe('notification-preferences pure helpers', () => {
  it('builds the per-user KloelMemory key', () => {
    expect(notificationPreferencesKey('agent-1')).toBe('notification-prefs:user:agent-1');
  });

  it('parses stored values, defaulting unknown shapes to enabled', () => {
    expect(parseStoredNotificationPreferences({ emailTips: false })).toEqual({ emailTips: false });
    expect(parseStoredNotificationPreferences({ emailTips: true })).toEqual({ emailTips: true });
    expect(parseStoredNotificationPreferences(null)).toEqual({ emailTips: true });
    expect(parseStoredNotificationPreferences('garbage')).toEqual({ emailTips: true });
    expect(parseStoredNotificationPreferences({ emailTips: 'no' })).toEqual({ emailTips: true });
  });

  it('sanitizes updates down to known boolean toggles only', () => {
    expect(sanitizeNotificationPreferencesUpdate({ emailTips: false })).toEqual({
      emailTips: false,
    });
    expect(sanitizeNotificationPreferencesUpdate({ emailTips: 'false' })).toEqual({});
    expect(sanitizeNotificationPreferencesUpdate({ somethingElse: true })).toEqual({});
    expect(sanitizeNotificationPreferencesUpdate(undefined)).toEqual({});
  });
});

describe('NotificationPreferencesService', () => {
  const findUnique = jest.fn();
  const upsert = jest.fn();
  const agentFindFirst = jest.fn();

  const prisma = {
    kloelMemory: { findUnique, upsert },
    agent: { findFirst: agentFindFirst },
  };

  let service: NotificationPreferencesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NotificationPreferencesService(prisma as never);
  });

  describe('getPreferences', () => {
    it('returns defaults when the user never saved preferences', async () => {
      findUnique.mockResolvedValue(null);

      const result = await service.getPreferences('ws-1', 'agent-1');

      expect(result).toEqual(DEFAULT_EMAIL_NOTIFICATION_PREFERENCES);
      expect(findUnique).toHaveBeenCalledWith({
        where: {
          workspaceId_key: { workspaceId: 'ws-1', key: 'notification-prefs:user:agent-1' },
        },
        select: { value: true },
      });
    });

    it('returns the persisted preferences when saved', async () => {
      findUnique.mockResolvedValue({ value: { emailTips: false } });

      await expect(service.getPreferences('ws-1', 'agent-1')).resolves.toEqual({
        emailTips: false,
      });
    });
  });

  describe('updatePreferences', () => {
    it('merges the partial update and upserts under the per-user key with category preferences', async () => {
      findUnique.mockResolvedValue(null);
      upsert.mockResolvedValue({});

      const result = await service.updatePreferences('ws-1', 'agent-1', { emailTips: false });

      expect(result).toEqual({ emailTips: false });
      expect(upsert).toHaveBeenCalledWith({
        where: {
          workspaceId_key: { workspaceId: 'ws-1', key: 'notification-prefs:user:agent-1' },
        },
        update: { value: { emailTips: false } },
        create: {
          workspaceId: 'ws-1',
          key: 'notification-prefs:user:agent-1',
          value: { emailTips: false },
          category: 'preferences',
          type: 'notification-preferences',
        },
      });
    });

    it('round-trips: a saved OFF value is returned by a subsequent get', async () => {
      findUnique.mockResolvedValueOnce(null);
      upsert.mockResolvedValue({});
      await service.updatePreferences('ws-1', 'agent-1', { emailTips: false });

      findUnique.mockResolvedValueOnce({ value: { emailTips: false } });
      await expect(service.getPreferences('ws-1', 'agent-1')).resolves.toEqual({
        emailTips: false,
      });
    });
  });

  describe('isOnboardingEmailAllowed (enforcement hook)', () => {
    it('blocks the send when the resolved agent disabled emailTips', async () => {
      agentFindFirst.mockResolvedValue({ id: 'agent-1', workspaceId: 'ws-1' });
      findUnique.mockResolvedValue({ value: { emailTips: false } });

      await expect(service.isOnboardingEmailAllowed('ws-1', 'a@b.com')).resolves.toBe(false);
      expect(agentFindFirst).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1', email: 'a@b.com' },
        select: { id: true, workspaceId: true },
      });
    });

    it('allows the send when the preference is enabled or never saved', async () => {
      agentFindFirst.mockResolvedValue({ id: 'agent-1', workspaceId: 'ws-1' });
      findUnique.mockResolvedValue(null);

      await expect(service.isOnboardingEmailAllowed('ws-1', 'a@b.com')).resolves.toBe(true);
    });

    it('resolves the agent by email alone when the job has no workspaceId', async () => {
      agentFindFirst.mockResolvedValue({ id: 'agent-2', workspaceId: 'ws-9' });
      findUnique.mockResolvedValue({ value: { emailTips: false } });

      await expect(service.isOnboardingEmailAllowed(undefined, 'b@c.com')).resolves.toBe(false);
      expect(agentFindFirst).toHaveBeenCalledWith({
        where: { email: 'b@c.com' },
        select: { id: true, workspaceId: true },
      });
      expect(findUnique).toHaveBeenCalledWith({
        where: {
          workspaceId_key: { workspaceId: 'ws-9', key: 'notification-prefs:user:agent-2' },
        },
        select: { value: true },
      });
    });

    it('defaults to send when no agent matches the job email', async () => {
      agentFindFirst.mockResolvedValue(null);

      await expect(service.isOnboardingEmailAllowed('ws-1', 'ghost@b.com')).resolves.toBe(true);
    });

    it('fails open (send) when the preference lookup itself errors', async () => {
      agentFindFirst.mockRejectedValue(new Error('db down'));

      await expect(service.isOnboardingEmailAllowed('ws-1', 'a@b.com')).resolves.toBe(true);
    });
  });
});
