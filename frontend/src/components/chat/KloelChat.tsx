'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useKloel } from '@/hooks/useKloel';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { Sparkles, Trash2 } from 'lucide-react';
import { apiUrl } from '@/lib/http';
import { colors } from '@/lib/design-tokens';

// -------------- DESIGN TOKENS (Apple Light Theme) --------------
const COLORS = {
  bg: colors.background.base,           // #FAFAFA
  surface: colors.background.surface1,   // #FFFFFF
  surfaceHover: colors.background.surface2, // #F5F5F5
  accent: colors.brand.primary,          // #1A1A1A
  textPrimary: colors.text.primary,      // #1A1A1A
  textSecondary: colors.text.secondary,  // #525252
  border: colors.stroke,                 // #E5E5E5
};

interface KloelChatProps {
  workspaceId: string;
  token?: string;
  className?: string;
  /** Initial message to send (from query param) */
  initialMessage?: string;
}

export function KloelChat({ workspaceId, token: propToken, className = '', initialMessage }: KloelChatProps) {
  // Get token from session if not provided
  const { data: session } = useSession();
  const token = propToken || (session?.user as any)?.accessToken;
  
  const {
    messages,
    isLoading,
    isStreaming,
    sendMessage,
    clearMessages,
    stopStreaming,
  } = useKloel({ workspaceId, token });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initialSentRef = useRef(false);

  // Auto-scroll to last message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send initial message if provided
  useEffect(() => {
    if (initialMessage && !initialSentRef.current && messages.length === 0) {
      initialSentRef.current = true;
      sendMessage(initialMessage);
    }
  }, [initialMessage, messages.length, sendMessage]);

  // Handle file upload
  const handleSendFile = useCallback(async (file: File, caption?: string) => {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(apiUrl('/kloel/upload'), {
        method: 'POST',
        body: formData,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      const data = await response.json();

      if (data.success) {
        // Send message with file info
        const fileMessage = caption 
          ? `[Arquivo: ${data.name}] ${caption}`
          : `Enviei um arquivo: ${data.name} (${data.type})`;
        sendMessage(fileMessage);
      } else {
        console.error('Upload failed:', data.error);
      }
    } catch (error) {
      console.error('Error uploading file:', error);
    }
  }, [token, sendMessage]);

  // Handle audio upload
  const handleSendAudio = useCallback(async (audioBlob: Blob) => {
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.webm');

      const response = await fetch(apiUrl('/kloel/upload'), {
        method: 'POST',
        body: formData,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      const data = await response.json();

      if (data.success) {
        sendMessage(`[Áudio enviado] Transcreva e responda este áudio.`);
      } else {
        console.error('Audio upload failed:', data.error);
      }
    } catch (error) {
      console.error('Error uploading audio:', error);
    }
  }, [token, sendMessage]);

  return (
    <div 
      className={`flex flex-col h-full ${className}`}
      style={{ backgroundColor: COLORS.bg }}
    >
      {/* Header */}
      <div 
        className="flex items-center justify-between px-6 py-4 border-b"
        style={{ 
          backgroundColor: COLORS.surface,
          borderColor: COLORS.border,
        }}
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <div 
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ backgroundColor: COLORS.accent }}
            >
              <Sparkles className="w-5 h-5" style={{ color: '#FFFFFF' }} />
            </div>
            <span 
              className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2"
              style={{ 
                backgroundColor: '#22C55E',
                borderColor: COLORS.surface,
              }}
            />
          </div>
          <div>
            <h2 className="font-semibold" style={{ color: COLORS.textPrimary }}>KLOEL</h2>
            <p className="text-xs" style={{ color: '#22C55E' }}>Online · IA de Vendas</p>
          </div>
        </div>
        
        {messages.length > 0 && (
          <button
            onClick={clearMessages}
            className="p-2 rounded-lg transition-colors hover:bg-black/5"
            style={{ color: COLORS.textSecondary }}
            title="Limpar conversa"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-1 scrollbar-thin scrollbar-thumb-black/10 scrollbar-track-transparent">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div 
              className="w-20 h-20 rounded-full flex items-center justify-center mb-4"
              style={{ backgroundColor: `${COLORS.accent}10` }}
            >
              <Sparkles className="w-10 h-10" style={{ color: COLORS.accent }} />
            </div>
            <h3 
              className="text-xl font-semibold mb-2"
              style={{ color: COLORS.textPrimary }}
            >
              Olá! Eu sou a KLOEL 👋
            </h3>
            <p 
              className="max-w-md"
              style={{ color: COLORS.textSecondary }}
            >
              Sua inteligência artificial especialista em vendas pelo WhatsApp. 
              Me conte sobre seu negócio e vou te ajudar a vender mais!
            </p>
            
            {/* Suggestion chips */}
            <div className="mt-6 flex flex-wrap gap-2 justify-center">
              {[
                'Como você pode me ajudar?',
                'Quero vender mais no WhatsApp',
                'Configure meu primeiro funil',
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => sendMessage(suggestion)}
                  className="px-4 py-2 rounded-full text-sm transition-all duration-200 hover:scale-105"
                  style={{
                    backgroundColor: COLORS.surface,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.textSecondary,
                  }}
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
        onSendFile={handleSendFile}
        onSendAudio={handleSendAudio}
        onStop={stopStreaming}
        isLoading={isLoading}
        isStreaming={isStreaming}
        placeholder="Pergunte algo para a KLOEL..."
      />
    </div>
  );
}
