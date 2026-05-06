import { classifyWebhook } from './webhook-classifier';

describe('classifyWebhook', () => {
  it('classifies hooks.slack.com as slack', () => {
    expect(classifyWebhook('https://hooks.slack.com/services/T000/B000/xxx')).toBe('slack');
  });

  it('classifies outlook.office.com as teams', () => {
    expect(classifyWebhook('https://outlook.office.com/webhook/abc')).toBe('teams');
  });

  it('classifies outlook.office365.com as teams', () => {
    expect(classifyWebhook('https://outlook.office365.com/webhook/abc')).toBe('teams');
  });

  it('classifies subdomain.office.com as teams', () => {
    expect(classifyWebhook('https://myorg.office.com/webhook/abc')).toBe('teams');
  });

  it('classifies subdomain.office365.com as teams', () => {
    expect(classifyWebhook('https://myorg.office365.com/webhook/abc')).toBe('teams');
  });

  it('classifies generic url as generic', () => {
    expect(classifyWebhook('https://example.com/webhook')).toBe('generic');
  });

  it('classifies empty string as generic', () => {
    expect(classifyWebhook('https://discord.com/api/webhooks/123')).toBe('generic');
  });

  it('handles malformed url gracefully returning generic', () => {
    expect(classifyWebhook('not-a-url')).toBe('generic');
  });
});
