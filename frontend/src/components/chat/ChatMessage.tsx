'use client';

import { cn } from '@/lib/utils';
import { TypingIndicator } from './TypingIndicator';
import type { KloelMessage } from '@/hooks/useKloel';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { colors } from '@/lib/design-tokens';

interface ChatMessageProps {
  message: KloelMessage;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const showTyping = message.isStreaming && message.content === '';
  const isToolEvent = message.eventType === 'tool_call' || message.eventType === 'tool_result';

  return (
    <div
      className={cn(
        'flex w-full mb-4',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-4 py-3 shadow-sm overflow-hidden',
          isUser
            ? 'bg-[#1A1A1A] text-white'
            : isToolEvent
              ? 'bg-[#F5F5F5] border border-[#E5E5E5] text-[#1A1A1A]'
              : 'bg-white border border-[#E5E5E5] text-[#1A1A1A]'
        )}
      >
        {/* Nome do remetente */}
        {!isUser && !isToolEvent && (
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-full bg-[#1A1A1A] flex items-center justify-center">
              <span className="text-xs font-bold text-white">K</span>
            </div>
            <span className="text-xs font-semibold text-[#1A1A1A]">KLOEL</span>
          </div>
        )}

        {isToolEvent && (
          <div className="flex items-center gap-2 mb-1 text-xs uppercase tracking-wide text-[#3B82F6]">
            {message.eventType === 'tool_call' ? 'Tool' : 'Tool Result'}
          </div>
        )}

        {/* Conteúdo da mensagem */}
        {showTyping ? (
          <TypingIndicator />
        ) : (
          <div 
            className={cn(
              'text-sm leading-relaxed prose max-w-none',
              isUser ? 'text-white prose-p:text-white prose-headings:text-white prose-strong:text-white' : 'text-[#1A1A1A]'
            )}
          >
            {isUser ? (
              <div className="whitespace-pre-wrap">{message.content}</div>
            ) : (
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]}
                components={{
                  img: ({node, ...props}) => (
                    <img {...props} className="rounded-lg max-w-full h-auto my-2 border border-[#E5E5E5]" />
                  ),
                  a: ({node, ...props}) => (
                    <a {...props} target="_blank" rel="noopener noreferrer" className="text-[#3B82F6] hover:underline" />
                  ),
                  p: ({node, ...props}) => (
                    <p {...props} className="mb-2 last:mb-0" />
                  ),
                  ul: ({node, ...props}) => (
                    <ul {...props} className="list-disc pl-4 mb-2" />
                  ),
                  ol: ({node, ...props}) => (
                    <ol {...props} className="list-decimal pl-4 mb-2" />
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
            )}
            {message.isStreaming && (
              <span className="inline-block w-1 h-4 ml-1 bg-[#1A1A1A] animate-pulse" />
            )}
          </div>
        )}

        {/* Timestamp */}
        <div
          className={cn(
            'text-xs mt-1 opacity-60',
            isUser ? 'text-white/60 text-right' : 'text-[#525252]'
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
