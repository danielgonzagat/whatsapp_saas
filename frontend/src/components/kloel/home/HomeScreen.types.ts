export type Phase = 'home' | 'transitioning' | 'chat';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  displayedContent?: string;
  isTyping?: boolean;
  isThinking?: boolean;
  timestamp: Date;
}

export interface UseKloelChatOptions {
  onSendMessage?: (text: string) => void;
}

export interface UseKloelChatReturn {
  phase: Phase;
  homeInput: string;
  chatInput: string;
  messages: ChatMessage[];
  activeConversationId: string | null;
  thinkingText: string;
  chatTitle: string;
  isWaitingForResponse: boolean;
  copiedId: string | null;
  setHomeInput: (value: string) => void;
  setChatInput: (value: string) => void;
  handleHomeSubmit: () => void;
  handleChatSubmit: () => void;
  handleNewChat: () => void;
  handleStopResponse: () => void;
  handleCopyMessage: (msgId: string, content: string) => void;
  handleEditMessage: (content: string) => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  chatContainerRef: React.RefObject<HTMLDivElement | null>;
  chatInputRef: React.RefObject<HTMLInputElement | null>;
  ERROR_MESSAGE: string;
}
