'use client';

import { KLOEL_THEME } from '@/lib/kloel-theme';
import { AgentDesktopViewer } from './AgentDesktopViewer';
import { ReasoningTraceBar } from './chat-container.agent-trace';
import { EmptyStateGreetingHeader } from './chat-container.empty-state';
import { MessageList } from './chat-container.message-list';
import { ChatContainerModals } from './chat-container.modals';
import type { AgentActivity } from './AgentConsole';
import type { ChatContainerModalsProps } from './chat-container.modals';
import type { AgentCursorTarget, AgentTraceEntry } from './chat-container.types';
import type { Message } from './chat-message.types';
import { FooterMinimal } from './footer-minimal';
import { HeaderMinimal } from './header-minimal';
import { InputComposer } from './input-composer';

export type ChatLayoutProps = {
  /* Header */
  isWhatsAppConnected: boolean;
  subscriptionStatus: 'none' | 'trial' | 'active' | 'expired' | 'suspended';
  trialDaysLeft: number;
  onOpenSettings: () => void;
  /* Messages */
  messages: Message[];
  showAgentDesktop: boolean;
  latestTraceLine: string;
  isAgentThinking: boolean;
  agentTraceEntries: AgentTraceEntry[];
  cursorTarget: AgentCursorTarget | null;
  thoughtTraceExpanded: boolean;
  isTyping: boolean;
  isCancelableReply: boolean;
  showSlowHint: boolean;
  pendingAgentAction: string | null;
  activeConversationId: string | null;
  isAuthenticated: boolean;
  userName: string | null;
  contentMaxWidth: number;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  /* Composer */
  inputValue: string;
  onInputChange: (v: string) => void;
  onSend: (content: string) => void;
  /* Callbacks */
  onThoughtTraceToggle: () => void;
  onAgentDesktopClose: () => void;
  onAgentConnectionChange: (connected: boolean) => void;
  onAgentStreamEnable: () => void;
  onQuickAction: (actionId: string, label: string) => void;
  onCancelProcessing: () => void;
  onMessageEdit?: (id: string, content: string) => Promise<void>;
  onMessageRetry: (id: string) => Promise<void>;
  onAssistantFeedback?: (id: string, type: 'positive' | 'negative' | null) => Promise<void>;
  onAssistantRegenerate?: (id: string) => Promise<void>;
  onWhatsAppConnect: () => void;
  onWhatsAppConnectionChange: (connected: boolean) => void;
  onAgentStreamEnabled: () => void;
  /* Modals */
  modals: ChatContainerModalsProps;
  /* Agent activities (for modals) */
  agentActivities: AgentActivity[];
};

export function ChatLayout({
  isWhatsAppConnected,
  subscriptionStatus,
  trialDaysLeft,
  onOpenSettings,
  messages,
  showAgentDesktop,
  latestTraceLine,
  isAgentThinking,
  agentTraceEntries,
  cursorTarget,
  thoughtTraceExpanded,
  isTyping,
  isCancelableReply,
  showSlowHint,
  pendingAgentAction,
  activeConversationId,
  isAuthenticated,
  userName,
  contentMaxWidth,
  messagesEndRef,
  inputValue,
  onInputChange,
  onSend,
  onThoughtTraceToggle,
  onAgentDesktopClose,
  onAgentConnectionChange,
  onAgentStreamEnable,
  onQuickAction,
  onCancelProcessing,
  onMessageEdit,
  onMessageRetry,
  onAssistantFeedback,
  onAssistantRegenerate,
  onWhatsAppConnect,
  modals,
}: ChatLayoutProps) {
  const hasMessages = messages.length > 0;

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        minHeight: 0,
        flexDirection: 'column',
        overflow: 'hidden',
        background: KLOEL_THEME.bgPrimary,
      }}
    >
      <HeaderMinimal
        isWhatsAppConnected={isWhatsAppConnected}
        onOpenSettings={onOpenSettings}
        subscriptionStatus={subscriptionStatus}
        trialDaysLeft={trialDaysLeft}
      />

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            overflowY: 'auto',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
          }}
        >
          <div
            style={{
              minHeight: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: hasMessages ? 'flex-start' : 'center',
              padding: '80px 16px 24px',
              boxSizing: 'border-box',
            }}
          >
            {!hasMessages ? (
              <div
                style={{
                  display: 'flex',
                  width: '100%',
                  maxWidth: contentMaxWidth,
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
              >
                {!showAgentDesktop && (
                  <EmptyStateGreetingHeader isAuthenticated={isAuthenticated} userName={userName} />
                )}
                {showAgentDesktop ? (
                  <AgentDesktopViewer
                    isVisible={showAgentDesktop}
                    latestThought={latestTraceLine}
                    isThinking={isAgentThinking}
                    traceEntries={agentTraceEntries}
                    cursorTarget={cursorTarget}
                    autoConnect={true}
                    onClose={onAgentDesktopClose}
                    onConnectionChange={(connected) => {
                      onAgentConnectionChange(connected);
                      if (connected) onAgentStreamEnable();
                    }}
                  />
                ) : (
                  <ReasoningTraceBar
                    latestThought={latestTraceLine}
                    entries={agentTraceEntries}
                    expanded={thoughtTraceExpanded}
                    onToggle={onThoughtTraceToggle}
                    isThinking={isAgentThinking}
                  />
                )}
              </div>
            ) : (
              <MessageList
                messages={messages}
                showAgentDesktop={showAgentDesktop}
                latestTraceLine={latestTraceLine}
                isAgentThinking={isAgentThinking}
                agentTraceEntries={agentTraceEntries}
                cursorTarget={cursorTarget}
                thoughtTraceExpanded={thoughtTraceExpanded}
                isTyping={isTyping}
                isCancelableReply={isCancelableReply}
                showSlowHint={showSlowHint}
                pendingAgentAction={pendingAgentAction}
                activeConversationId={activeConversationId}
                contentMaxWidth={contentMaxWidth}
                messagesEndRef={messagesEndRef}
                onThoughtTraceToggle={onThoughtTraceToggle}
                onAgentDesktopClose={onAgentDesktopClose}
                onAgentConnectionChange={onAgentConnectionChange}
                onAgentStreamEnable={onAgentStreamEnable}
                onQuickAction={onQuickAction}
                onCancelProcessing={onCancelProcessing}
                onMessageEdit={onMessageEdit}
                onMessageRetry={onMessageRetry}
                onAssistantFeedback={onAssistantFeedback}
                onAssistantRegenerate={onAssistantRegenerate}
              />
            )}
          </div>
        </div>
      </div>

      <div
        style={{
          flexShrink: 0,
          background: KLOEL_THEME.bgPrimary,
          paddingTop: 20,
          paddingBottom: 'max(24px, env(safe-area-inset-bottom, 0px))',
        }}
      >
        <div style={{ margin: '0 auto', maxWidth: 768, padding: '0 16px' }}>
          <InputComposer
            value={inputValue}
            onChange={onInputChange}
            onSend={onSend}
            onConnectWhatsApp={onWhatsAppConnect}
            showActionButtons={true}
          />
          <FooterMinimal />
        </div>
      </div>

      <ChatContainerModals {...modals} />
    </div>
  );
}
