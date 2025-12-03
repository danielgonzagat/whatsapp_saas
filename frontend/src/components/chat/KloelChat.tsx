'use client';

import { useRef, useEffect } from 'react';
import { useKloel } from '@/hooks/useKloel';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { Sparkles, Trash2 } from 'lucide-react';

interface KloelChatProps {
  workspaceId?: string;
  className?: string;
}

export function KloelChat({ workspaceId, className = '' }: KloelChatProps) {
  const {
    messages,
    isLoading,
    isStreaming,
    sendMessage,
    clearMessages,
    stopStreaming,
  } = useKloel({ workspaceId });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll para última mensagem
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className={`flex flex-col h-full bg-[#0A0A0F] ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#2A2A3E] bg-[#0D0D12]">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#00FFA3] to-[#00D4FF] flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-black" />
            </div>
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-[#0D0D12]" />
          </div>
          <div>
            <h2 className="text-white font-semibold">KLOEL</h2>
            <p className="text-xs text-[#00FFA3]">Online • IA de Vendas</p>
          </div>
        </div>
        
        {messages.length > 0 && (
          <button
            onClick={clearMessages}
            className="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-[#1A1A24] transition-colors"
            title="Limpar conversa"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-1 scrollbar-thin scrollbar-thumb-[#2A2A3E] scrollbar-track-transparent">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-20 h-20 rounded-full bg-gradient-to-r from-[#00FFA3]/20 to-[#00D4FF]/20 flex items-center justify-center mb-4">
              <Sparkles className="w-10 h-10 text-[#00FFA3]" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">
              Olá! Eu sou a KLOEL 👋
            </h3>
            <p className="text-gray-400 max-w-md">
              Sua inteligência artificial especialista em vendas pelo WhatsApp. 
              Me conte sobre seu negócio e vou te ajudar a vender mais!
            </p>
            
            {/* Sugestões de início */}
            <div className="mt-6 flex flex-wrap gap-2 justify-center">
              {[
                'Como você pode me ajudar?',
                'Quero vender mais no WhatsApp',
                'Configure meu primeiro funil',
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => sendMessage(suggestion)}
                  className="px-4 py-2 rounded-full text-sm bg-[#1A1A24] border border-[#2A2A3E] text-gray-300 hover:border-[#00FFA3] hover:text-[#00FFA3] transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <ChatInput
        onSend={sendMessage}
        onStop={stopStreaming}
        isLoading={isLoading}
        isStreaming={isStreaming}
        placeholder="Pergunte algo para a KLOEL..."
      />
    </div>
  );
}
