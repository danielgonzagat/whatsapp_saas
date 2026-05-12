'use client';

import WhatsAppExperience from './WhatsAppExperience';
import type { ChannelRealData, WhatsAppChannelConnection } from './MarketingTypes';

interface WhatsAppMarketingTabProps {
  channelData: ChannelRealData | null;
  liveFeed: string[];
  mode?: string | undefined;
  workspaceId?: string | null | undefined;
  operator?: string | null | undefined;
  connection?: WhatsAppChannelConnection | undefined;
  onRefreshConnectionStatus?: (() => Promise<unknown> | unknown) | undefined;
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

  const optionalProps: Record<string, unknown> = {};
  if (operator !== undefined) {optionalProps.operator = operator;}
  if (mode !== undefined) {optionalProps.mode = mode;}
  if (connection !== undefined) {optionalProps.connection = connection;}
  if (onRefreshConnectionStatus !== undefined)
    {optionalProps.onConnectionRefresh = onRefreshConnectionStatus;}

  return (
    <WhatsAppExperience
      workspaceId={workspaceId}
      channelData={channelData}
      liveFeed={liveFeed}
      {...optionalProps}
    />
  );
}
