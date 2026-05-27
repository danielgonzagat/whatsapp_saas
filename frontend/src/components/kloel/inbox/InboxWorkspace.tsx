'use client';

/** Dynamic. */
export const dynamic = 'force-dynamic';

import { useAuth } from '@/components/kloel/auth/auth-provider';
import { useSocket } from '@/hooks/useSocket';
import { useMemo, type ReactNode } from 'react';
import {
  INBOX_RESPONSIVE_VARS,
} from './inbox-workspace-utils';
import { InboxNoWorkspaceView } from './InboxNoWorkspaceView';
import { InboxNotAuthenticatedView } from './InboxNotAuthenticatedView';
import { useInboxData } from './useInboxData';
import { useInboxRealtime } from './useInboxRealtime';
import { InboxHeader } from './parts/InboxHeader';
import { InboxContextBanner } from './parts/InboxContextBanner';
import { InboxErrorBanner } from './parts/InboxErrorBanner';
import { InboxConversationList } from './parts/InboxConversationList';
import { InboxConversationHeader } from './parts/InboxConversationHeader';
import { InboxMessageList } from './parts/InboxMessageList';
import { InboxMessageInput } from './parts/InboxMessageInput';
import { SuggestionChips } from './parts/SuggestionChips';

interface InboxWorkspaceProps {
  embedded?: boolean;
  title?: string;
  description?: string;
  showHeader?: boolean;
  showUtilityLinks?: boolean;
  showContextBanner?: boolean;
  headerActions?: ReactNode;
}

/** Inbox workspace. */
export function InboxWorkspace({
  embedded = false,
  title = 'Conversas',
  description = 'Converse, feche e acompanhe conversas de todos os canais.',
  showHeader = true,
  showUtilityLinks = !embedded,
  showContextBanner = !embedded,
  headerActions,
}: InboxWorkspaceProps) {
  const { isAuthenticated, isLoading, workspace, user, openAuthModal } = useAuth();
  const workspaceId = workspace?.id;
  const { isConnected, subscribe } = useSocket();

  const {
    loadingConversations,
    loadingMessages,
    error,
    conversations,
    selectedConversationId,
    messages,
    setMessages,
    agents,
    assigning,
    channelFilter,
    setChannelFilter,
    statusFilter,
    setStatusFilter,
    replyText,
    setReplyText,
    sending,
    messagesEndRef,
    sourceLabel,
    selectedConversation,
    filteredConversations,
    matchedConversationByPhone,
    visualReady,
    handleAssumir,
    handleDevolverIA,
    handleSendReply,
    handleAssignAgent,
    refreshConversations,
    handleSelectConversation,
    handleCloseConversation,
    requestedPhone,
    requestedConversationId,
    requestedDraft,
  } = useInboxData({ workspaceId, isAuthenticated, isLoading, userId: user?.id ?? '' });

  useInboxRealtime({
    workspaceId,
    isConnected,
    subscribe,
    selectedConversationId,
    setMessages,
    refreshConversations,
  });

  const contactIdFromConversation = useMemo(
    () => selectedConversation?.contact?.id ?? null,
    [selectedConversation],
  );

  if (!isLoading && !isAuthenticated) {
    return (
      <InboxNotAuthenticatedView
        embedded={embedded}
        title={title}
        onLogin={() => openAuthModal('login')}
      />
    );
  }

  if (!isLoading && isAuthenticated && !workspaceId) {
    return <InboxNoWorkspaceView embedded={embedded} title={title} />;
  }

  return (
    <div
      data-testid="inbox-workspace-root"
      data-ready={visualReady ? 'true' : 'false'}
      className={embedded ? 'w-full' : 'mx-auto max-w-6xl'}
      style={{
        ...INBOX_RESPONSIVE_VARS,
        ...(embedded ? {} : { padding: 'var(--inbox-page-y) var(--inbox-page-x)' }),
      }}
    >
      <InboxHeader
        title={title}
        description={description}
        isConnected={isConnected}
        showHeader={showHeader}
        showUtilityLinks={showUtilityLinks}
        headerActions={headerActions}
        loadingConversations={loadingConversations}
        refreshConversations={refreshConversations}
      />

      <InboxContextBanner
        showContextBanner={showContextBanner}
        sourceLabel={sourceLabel}
        requestedPhone={requestedPhone}
        requestedConversationId={requestedConversationId}
      />

      <InboxErrorBanner error={error} />

      <div className="grid grid-cols-1 gap-[var(--inbox-shell-gap)] lg:grid-cols-12">
        <div className="lg:col-span-4">
          <InboxConversationList
            loadingConversations={loadingConversations}
            conversations={conversations}
            filteredConversations={filteredConversations}
            selectedConversationId={selectedConversationId}
            channelFilter={channelFilter}
            setChannelFilter={setChannelFilter}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            onSelectConversation={handleSelectConversation}
            requestedPhone={requestedPhone}
          />
        </div>

        <div className="lg:col-span-8">
          <div className="rounded-[var(--inbox-radius)] border border-[var(--bg-border)] bg-[var(--bg-surface)] shadow-sm">
            <InboxConversationHeader
              selectedConversation={selectedConversation}
              selectedConversationId={selectedConversationId}
              agents={agents}
              assigning={assigning}
              onAssumir={handleAssumir}
              onDevolverIA={handleDevolverIA}
              onAssignAgent={handleAssignAgent}
              onCloseConversation={handleCloseConversation}
              requestedPhone={requestedPhone}
              requestedDraft={requestedDraft}
            />

            <div className="max-h-[clamp(380px,55vh,680px)] overflow-y-auto px-[var(--inbox-panel-x)] py-[var(--inbox-panel-y)]">
              <InboxMessageList
                loadingMessages={loadingMessages}
                selectedConversationId={selectedConversationId}
                messages={messages}
                messagesEndRef={messagesEndRef}
                requestedPhone={requestedPhone}
                matchedConversationByPhone={matchedConversationByPhone}
                selectedConversation={selectedConversation}
                requestedDraft={requestedDraft}
              />
            </div>

            <SuggestionChips
              workspaceId={workspaceId}
              contactId={contactIdFromConversation}
              onSelectSuggestion={setReplyText}
            />
            <InboxMessageInput
              selectedConversationId={selectedConversationId}
              replyText={replyText}
              onReplyTextChange={setReplyText}
              sending={sending}
              onSendReply={handleSendReply}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default InboxWorkspace;
