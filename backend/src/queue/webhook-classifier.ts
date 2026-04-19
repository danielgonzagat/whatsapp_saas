/**
 * Pure helper for classifying outbound ops webhooks as Slack / Teams / generic.
 *
 * Extracted from queue.ts to keep each module's cyclomatic complexity low
 * (Codacy / lizard measures function bundles per-file). Logic is unchanged.
 */
export type OpsWebhookKind = 'slack' | 'teams' | 'generic';

export function classifyWebhook(webhook: string): OpsWebhookKind {
  try {
    const host = new URL(webhook).hostname.toLowerCase();
    if (host === 'hooks.slack.com') {
      return 'slack';
    }
    if (
      host === 'outlook.office.com' ||
      host === 'outlook.office365.com' ||
      host.endsWith('.office.com') ||
      host.endsWith('.office365.com')
    ) {
      return 'teams';
    }
  } catch {
    return 'generic';
  }

  return 'generic';
}
