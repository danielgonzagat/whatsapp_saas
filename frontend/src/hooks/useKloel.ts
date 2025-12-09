'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

export interface KloelMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  attachments?: Array<{ type: string; url: string; name?: string }>;
  eventType?: 'tool_call' | 'tool_result';
  meta?: Record<string, any>;
}

interface UseKloelOptions {
  workspaceId: string; // Required - no more 'default' fallback
  token?: string; // Optional JWT token for authenticated requests
}

export function useKloel(options: UseKloelOptions) {
  const { workspaceId, token } = options;
  const [messages, setMessages] = useState<KloelMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load history on mount
  useEffect(() => {
    if (!token) return;
    
    const fetchHistory = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/kloel/history`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setMessages(data.map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: new Date(m.timestamp),
          })));
        }
      } catch (e) {
        console.error('Failed to load history', e);
      }
    };
    
    fetchHistory();
  }, [token]);

  const generateId = () => `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    // Cancela streaming anterior se existir
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const userMessage: KloelMessage = {
      id: generateId(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
    };

    const assistantMessageId = generateId();
    const assistantMessage: KloelMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setIsLoading(true);
    setIsStreaming(true);

    try {
      abortControllerRef.current = new AbortController();
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/kloel/think`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          workspaceId,
          message: content.trim(),
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader available');

      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            
            if (data === '[DONE]') {
              continue;
            }

            try {
              const parsed = JSON.parse(data);

              // Eventos de ferramenta (tool_call/tool_result)
              if (parsed.type === 'tool_call') {
                const toolName = parsed.tool || parsed.name || 'ferramenta';
                const toolMsg: KloelMessage = {
                  id: generateId(),
                  role: 'assistant',
                  content: `🔧 Executando ${toolName}...`,
                  timestamp: new Date(),
                  eventType: 'tool_call',
                  meta: { name: toolName, args: parsed.args, result: parsed.result },
                };
                setMessages(prev => [...prev, toolMsg]);
                continue;
              }

              if (parsed.type === 'tool_result') {
                const toolResultMsg: KloelMessage = {
                  id: generateId(),
                  role: 'assistant',
                  content: parsed.result ? JSON.stringify(parsed.result, null, 2) : '✅ Ferramenta concluída',
                  timestamp: new Date(),
                  eventType: 'tool_result',
                  meta: parsed.result,
                };
                setMessages(prev => [...prev, toolResultMsg]);
                continue;
              }

              // Conteúdo normal do assistant (streaming)
              if (parsed.content) {
                fullContent += parsed.content;
                setMessages(prev => 
                  prev.map(msg => 
                    msg.id === assistantMessageId 
                      ? { ...msg, content: fullContent }
                      : msg
                  )
                );
              }

              // Finalização explícita
              if (parsed.done) {
                setMessages(prev => 
                  prev.map(msg => 
                    msg.id === assistantMessageId 
                      ? { ...msg, isStreaming: false }
                      : msg
                  )
                );
              }
            } catch {
              // Ignora linhas que não são JSON válido
            }
          }
        }
      }

      // Marca streaming como concluído
      setMessages(prev => 
        prev.map(msg => 
          msg.id === assistantMessageId 
            ? { ...msg, isStreaming: false }
            : msg
        )
      );

    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        // Streaming foi cancelado intencionalmente
        return;
      }

      console.error('Erro ao enviar mensagem:', error);
      
      // Em caso de erro, tenta resposta síncrona como fallback
      try {
        const syncResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/kloel/think/sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            workspaceId,
            message: content.trim(),
          }),
        });

        const data = await syncResponse.json();
        
        setMessages(prev => 
          prev.map(msg => 
            msg.id === assistantMessageId 
              ? { ...msg, content: data.response, isStreaming: false }
              : msg
          )
        );
      } catch (fallbackError) {
        console.error('Fallback também falhou:', fallbackError);
        setMessages(prev => 
          prev.map(msg => 
            msg.id === assistantMessageId 
              ? { 
                  ...msg, 
                  content: 'Desculpe, tive um problema para processar sua mensagem. Pode tentar novamente?', 
                  isStreaming: false 
                }
              : msg
          )
        );
      }
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, [workspaceId, token, isLoading]);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
      setIsLoading(false);
    }
  }, []);

  return {
    messages,
    isLoading,
    isStreaming,
    sendMessage,
    clearMessages,
    stopStreaming,
  };
}
