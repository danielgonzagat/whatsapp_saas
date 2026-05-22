'use client';

import { ChatLayout } from './chat-container.layout';
import type { ChatContainerProps } from './chat-container.types';
import { useChatController } from './useChatController';

export function ChatContainer(props: ChatContainerProps) {
  const controller = useChatController(props);
  return <ChatLayout {...controller} />;
}
