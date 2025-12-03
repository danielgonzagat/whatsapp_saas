'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Square, Paperclip, Mic } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop?: () => void;
  isLoading?: boolean;
  isStreaming?: boolean;
  placeholder?: string;
  disabled?: boolean;
}

export function ChatInput({
  onSend,
  onStop,
  isLoading = false,
  isStreaming = false,
  placeholder = 'Digite sua mensagem...',
  disabled = false,
}: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, [value]);

  const handleSubmit = () => {
    if (value.trim() && !isLoading && !disabled) {
      onSend(value);
      setValue('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleStop = () => {
    if (onStop) {
      onStop();
    }
  };

  return (
    <div className="relative flex items-end gap-2 p-4 bg-[#0A0A0F] border-t border-[#2A2A3E]">
      {/* Botões extras */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-[#1A1A24] transition-colors"
          title="Anexar arquivo"
        >
          <Paperclip className="w-5 h-5" />
        </button>
        <button
          type="button"
          className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-[#1A1A24] transition-colors"
          title="Gravar áudio"
        >
          <Mic className="w-5 h-5" />
        </button>
      </div>

      {/* Input */}
      <div className="flex-1 relative">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className={cn(
            'w-full px-4 py-3 bg-[#1A1A24] border border-[#2A2A3E] rounded-xl',
            'text-white placeholder:text-gray-500',
            'focus:outline-none focus:ring-2 focus:ring-[#00FFA3]/50 focus:border-[#00FFA3]',
            'resize-none max-h-32 scrollbar-thin scrollbar-thumb-[#2A2A3E]',
            'transition-all duration-200',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        />
      </div>

      {/* Botão de enviar/parar */}
      {isStreaming ? (
        <button
          type="button"
          onClick={handleStop}
          className={cn(
            'p-3 rounded-xl bg-red-500 text-white',
            'hover:bg-red-600 transition-colors',
            'flex items-center justify-center'
          )}
          title="Parar resposta"
        >
          <Square className="w-5 h-5 fill-current" />
        </button>
      ) : (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!value.trim() || isLoading || disabled}
          className={cn(
            'p-3 rounded-xl transition-all duration-200',
            'flex items-center justify-center',
            value.trim() && !isLoading && !disabled
              ? 'bg-gradient-to-r from-[#00FFA3] to-[#00D4FF] text-black hover:opacity-90'
              : 'bg-[#2A2A3E] text-gray-500 cursor-not-allowed'
          )}
          title="Enviar mensagem"
        >
          {isLoading ? (
            <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </button>
      )}
    </div>
  );
}
