'use client';

import { useKloelChat } from './useKloelChat';
import type { Phase, ChatMessage } from './HomeScreen.types';
import { HomeLanding } from './HomeLanding';
import { ChatTitleBar } from './ChatTitleBar';
import { ChatMessageBubble } from './ChatMessageBubble';
import { ChatInputArea } from './ChatInputArea';

export type { Phase, ChatMessage };

interface HomeScreenProps {
  onSendMessage?: (text: string) => void;
}

export function HomeScreen({ onSendMessage }: HomeScreenProps) {
  const {
    phase,
    homeInput,
    setHomeInput,
    handleHomeSubmit,
    chatTitle,
    chatContainerRef,
    messages,
    thinkingText,
    copiedId,
    handleCopyMessage,
    handleEditMessage,
    ERROR_MESSAGE,
    messagesEndRef,
    chatInput,
    setChatInput,
    isWaitingForResponse,
    handleChatSubmit,
    handleStopResponse,
    chatInputRef,
  } = useKloelChat(onSendMessage !== undefined ? { onSendMessage } : {});

  if (phase === 'home' || phase === 'transitioning') {
    return (
      <HomeLanding
        phase={phase}
        homeInput={homeInput}
        onHomeInputChange={setHomeInput}
        onSubmit={handleHomeSubmit}
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
      <ChatTitleBar title={chatTitle} />

      <div
        ref={chatContainerRef}
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
          {messages.map((msg) => (
            <ChatMessageBubble
              key={msg.id}
              msg={msg}
              thinkingText={thinkingText}
              copiedId={copiedId}
              onCopy={handleCopyMessage}
              onEdit={handleEditMessage}
              errorMessage={ERROR_MESSAGE}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <ChatInputArea
        value={chatInput}
        onChange={setChatInput}
        isWaitingForResponse={isWaitingForResponse}
        onSubmit={handleChatSubmit}
        onStop={handleStopResponse}
        inputRef={chatInputRef}
      />
    </div>
  );
}
