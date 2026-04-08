import { WorkerLogger } from '../logger';

const log = new WorkerLogger('campaigns-provider');

export const Campaigns = {
  async trigger(id: string, users: string[]) {
    const { campaignQueue } = await import('../queue');
    log.info('campaign_trigger', { campaignId: id, contactCount: users.length });
    await campaignQueue.add('process-campaign', {
      campaignId: id,
      contacts: users,
    });
  },

  async run(payload: { id: string; user: string; action: string }) {
    const { campaignQueue } = await import('../queue');
    log.info('campaign_run', {
      campaignId: payload.id,
      user: payload.user,
      action: payload.action,
    });
    await campaignQueue.add('process-campaign-action', {
      campaignId: payload.id,
      user: payload.user,
      action: payload.action,
    });
  },
};
