'use client';

import { useKloelChat, type Phase, type ChatMessage } from './useKloelChat';
import { HomeLanding } from './HomeLanding';
import { ChatTitleBar } from './ChatTitleBar';
import { ChatMessageBubble } from './ChatMessageBubble';
import { ChatInputArea } from './ChatInputArea';

export type { Phase, ChatMessage };

interface HomeScreenProps {
  onSendMessage?: (text: string) => void;
}

export function HomeScreen({ onSendMessage }: HomeScreenProps) {
  const chat = useKloelChat(
    onSendMessage !== undefined ? { onSendMessage } : {},
  );

  if (chat.phase === 'home' || chat.phase === 'transitioning') {
    return (
      <HomeLanding
        phase={chat.phase}
        homeInput={chat.homeInput}
        onHomeInputChange={chat.setHomeInput}
        onSubmit={chat.handleHomeSubmit}
      />
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        background: 'var(--app-bg-primary)',
        animation: 'chatEnter 500ms ease-out forwards',
        overflow: 'hidden',
      }}
    >
      <ChatTitleBar title={chat.chatTitle} />

      <div
        ref={chat.chatContainerRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px 20px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            maxWidth: 660,
            width: '100%',
            margin: '0 auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          {chat.messages.map((msg) => (
            <ChatMessageBubble
              key={msg.id}
              msg={msg}
              thinkingText={chat.thinkingText}
              copiedId={chat.copiedId}
              onCopy={chat.handleCopyMessage}
              onEdit={chat.handleEditMessage}
              errorMessage={chat.ERROR_MESSAGE}
            />
          ))}
          <div ref={chat.messagesEndRef} />
        </div>
      </div>

      <ChatInputArea
        value={chat.chatInput}
        onChange={chat.setChatInput}
        isWaitingForResponse={chat.isWaitingForResponse}
        onSubmit={chat.handleChatSubmit}
        onStop={chat.handleStopResponse}
        inputRef={chat.chatInputRef}
      />
    </div>
  );
}
