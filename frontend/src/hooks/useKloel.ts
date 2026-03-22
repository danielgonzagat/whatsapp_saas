'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { apiUrl } from '@/lib/http';

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
  workspaceId?: string; // Optional - if missing, uses guest mode
  token?: string; // Optional JWT token for authenticated requests
}

/**
 * 🎯 ENDPOINT CORRETO BASEADO NO MODO
 * - Visitante (sem token): /chat/guest (público)
 * - Usuário autenticado: /kloel/think (SSE com IA completa)
 */
const getChatEndpoint = (token?: string, workspaceId?: string): string => {
  if (!token || !workspaceId) {
    // Visitante → usa o endpoint público
    return '/chat/guest';
  }
  // Usuário autenticado → usa a IA completa com SSE
  return '/kloel/think';
};

export function useKloel(options: UseKloelOptions = {}) {
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
        const res = await fetch(apiUrl('/kloel/history'), {
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
      
      // 🎯 USA O ENDPOINT CORRETO BASEADO NO MODO
      const endpoint = getChatEndpoint(token, workspaceId);
      const isGuestMode = !token || !workspaceId;
      
      const response = await fetch(apiUrl(endpoint), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(
          isGuestMode 
            ? { message: content.trim() }  // Guest mode: só mensagem
            : { message: content.trim() }  // Auth mode: workspace vem do token
        ),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader available');

      const decoder = new TextDecoder();
      let fullContent = '';
      let streamError = '';

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

              if (parsed.error) {
                streamError = String(parsed.error);
                fullContent = streamError;
                setMessages(prev =>
                  prev.map(msg =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: fullContent, isStreaming: false }
                      : msg
                  )
                );
                break;
              }

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
              const delta = parsed.content ?? parsed.chunk;
              if (delta) {
                fullContent += String(delta);
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

          if (streamError) {
            break;
          }
        }

        if (streamError) {
          break;
        }
      }

      if (!streamError && !fullContent.trim()) {
        throw new Error('empty_stream');
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
      
      // Detecta se é erro de rede (Failed to fetch)
      const isNetworkError = error instanceof TypeError;
      
      // Em caso de erro, tenta resposta síncrona como fallback
      try {
        // Se tem token, usa endpoint autenticado; senão, usa guest chat público
        const syncEndpoint = token ? '/kloel/think/sync' : '/chat/guest/sync';
        const syncBody = token ? { message: content.trim() } : { message: content.trim() };
        
        const syncResponse = await fetch(apiUrl(syncEndpoint), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(syncBody),
        });

        if (!syncResponse.ok) {
          throw new Error(`HTTP ${syncResponse.status}`);
        }

        const data = await syncResponse.json();
        const responseText = data.response || data.reply || data.message || data.answer;
        
        setMessages(prev => 
          prev.map(msg => 
            msg.id === assistantMessageId 
              ? { ...msg, content: responseText || 'Sem resposta', isStreaming: false }
              : msg
          )
        );
      } catch (fallbackError) {
        console.error('Fallback também falhou:', fallbackError);
        
        // Mensagem de erro mais específica baseada no tipo de erro
        let errorMessage: string;
        const errMsg = (error as Error).message || '';
        
        if (isNetworkError) {
          errorMessage = 'Erro de comunicação com o servidor. Verifique se a URL da API está configurada corretamente e se você está conectado à internet.';
        } else if (errMsg.includes('401') || errMsg.includes('403')) {
          errorMessage = 'Você precisa estar autenticado para usar todas as funcionalidades. Faça login e tente novamente.';
        } else if (errMsg.includes('429')) {
          errorMessage = 'Muitas requisições. Aguarde um momento e tente novamente.';
        } else if (errMsg.includes('500') || errMsg.includes('502') || errMsg.includes('503')) {
          errorMessage = 'O servidor está temporariamente indisponível. Tente novamente em alguns minutos.';
        } else {
          errorMessage = 'Desculpe, tive um problema para processar sua mensagem. Pode tentar novamente?';
        }
        
        setMessages(prev => 
          prev.map(msg => 
            msg.id === assistantMessageId 
              ? { 
                  ...msg, 
                  content: errorMessage, 
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
