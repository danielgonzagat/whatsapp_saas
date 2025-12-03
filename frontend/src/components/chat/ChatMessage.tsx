'use client';

import { cn } from '@/lib/utils';
import { TypingIndicator } from './TypingIndicator';
import type { KloelMessage } from '@/hooks/useKloel';

interface ChatMessageProps {
  message: KloelMessage;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const showTyping = message.isStreaming && message.content === '';

  return (
    <div
      className={cn(
        'flex w-full mb-4',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-4 py-3 shadow-lg',
          isUser
            ? 'bg-gradient-to-r from-[#00FFA3] to-[#00D4FF] text-black'
            : 'bg-[#1A1A24] border border-[#2A2A3E] text-white'
        )}
      >
        {/* Nome do remetente */}
        {!isUser && (
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-full bg-gradient-to-r from-[#00FFA3] to-[#00D4FF] flex items-center justify-center">
              <span className="text-xs font-bold text-black">K</span>
            </div>
            <span className="text-xs font-semibold text-[#00FFA3]">KLOEL</span>
          </div>
        )}

        {/* Conteúdo da mensagem */}
        {showTyping ? (
          <TypingIndicator />
        ) : (
          <div 
            className={cn(
              'text-sm leading-relaxed whitespace-pre-wrap',
              isUser ? 'text-black' : 'text-gray-100'
            )}
          >
            {message.content}
            {message.isStreaming && (
              <span className="inline-block w-1 h-4 ml-1 bg-[#00FFA3] animate-pulse" />
            )}
          </div>
        )}

        {/* Timestamp */}
        <div
          className={cn(
            'text-xs mt-1 opacity-60',
            isUser ? 'text-black/60 text-right' : 'text-gray-400'
          )}
        >
          {message.timestamp.toLocaleTimeString('pt-BR', { 
            hour: '2-digit', 
            minute: '2-digit' 
          })}
        </div>
      </div>
    </div>
  );
}
