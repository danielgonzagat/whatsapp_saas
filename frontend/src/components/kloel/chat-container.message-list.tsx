'use client';

import { AgentDesktopViewer } from './AgentDesktopViewer';
import { MessageBubble } from './message-bubble';
import { ReasoningTraceBar } from './chat-container.agent-trace';
import type { AgentTraceEntry, AgentCursorTarget } from './chat-container.types';
import type { Message } from './chat-message.types';

interface MessageListProps {
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
  contentMaxWidth: number;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  onThoughtTraceToggle: () => void;
  onAgentDesktopClose: () => void;
  onAgentConnectionChange: (connected: boolean) => void;
  onAgentStreamEnable: () => void;
  onQuickAction: (actionId: string, label: string) => void;
  onCancelProcessing: () => void;
  onMessageEdit?: (messageId: string, content: string) => Promise<void>;
  onMessageRetry: (messageId: string) => Promise<void>;
  onAssistantFeedback?: (messageId: string, type: 'positive' | 'negative' | null) => Promise<void>;
  onAssistantRegenerate?: (messageId: string) => Promise<void>;
}

export function MessageList({
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
  contentMaxWidth,
  messagesEndRef,
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
}: MessageListProps) {
  const agentDesktopViewer = (
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
        if (connected) {
          onAgentStreamEnable();
        }
      }}
    />
  );

  const reasoningBar = (
    <ReasoningTraceBar
      latestThought={latestTraceLine}
      entries={agentTraceEntries}
      expanded={thoughtTraceExpanded}
      onToggle={onThoughtTraceToggle}
      isThinking={isAgentThinking}
    />
  );

  return (
    <div
      style={{
        width: '100%',
        maxWidth: contentMaxWidth,
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
        paddingBottom: 24,
      }}
    >
      {showAgentDesktop ? agentDesktopViewer : reasoningBar}

      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          onQuickAction={onQuickAction}
          pendingActionId={pendingAgentAction}
          isBusy={isTyping}
          showSlowHint={Boolean(message.isStreaming && isCancelableReply && showSlowHint)}
          onCancelProcessing={message.isStreaming ? onCancelProcessing : undefined}
          onMessageEdit={activeConversationId ? onMessageEdit : undefined}
          onMessageRetry={onMessageRetry}
          onAssistantFeedback={activeConversationId ? onAssistantFeedback : undefined}
          onAssistantRegenerate={activeConversationId ? onAssistantRegenerate : undefined}
        />
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
}
