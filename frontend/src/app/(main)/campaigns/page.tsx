'use client';

import { CampaignsView } from '@/components/kloel/campaigns/CampaignsView';

/**
 * /campaigns — full campaign management. The CampaignsView screen (create, list,
 * launch, pause) and its backend (CampaignsController + BullMQ worker, all
 * Prisma-backed) were already built; this route now mounts them instead of the
 * old "coming soon" placeholder.
 */
export default function CampaignsPage() {
  return <CampaignsView />;
}
