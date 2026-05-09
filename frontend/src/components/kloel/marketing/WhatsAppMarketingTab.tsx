'use client';

import React from 'react';
import WhatsAppExperience from './WhatsAppExperience';
import type { ChannelRealData, WhatsAppChannelConnection } from './MarketingTypes';

interface WhatsAppMarketingTabProps {
  channelData: ChannelRealData | null;
  liveFeed: string[];
  mode?: string;
  workspaceId?: string | null;
  operator?: string | null;
  connection?: WhatsAppChannelConnection;
  onRefreshConnectionStatus?: () => Promise<unknown> | unknown;
}

export default function WhatsAppMarketingTab({
  channelData,
  liveFeed,
  mode,
  workspaceId,
  operator,
  connection,
  onRefreshConnectionStatus,
}: WhatsAppMarketingTabProps) {
  if (!workspaceId) {
    return null;
  }

  return (
    <WhatsAppExperience
      workspaceId={workspaceId}
      operator={operator}
      mode={mode}
      channelData={channelData}
      liveFeed={liveFeed}
      connection={connection}
      onConnectionRefresh={onRefreshConnectionStatus}
    />
  );
}
