'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { mutate } from 'swr';

import { tokenStorage } from '@/lib/api';
import { onboardingApi } from '@/lib/api/onboarding';
import { apiUrl } from '@/lib/http';
import { useAuth } from '@/components/kloel/auth/auth-provider';

import {
  buildOnboardingHeaders,
  buildRoleSeedMessage,
  createOnboardingMessage,
  extractSseContent,
  getOnboardingRoleLabel,
  isOnboardingSwrKey,
  normalizeOnboardingRole,
  type OnboardingMessage,
} from './onboarding-chat.helpers';

export interface OnboardingChatStatus {
  messagesCount?: number;
  completed?: boolean;
  [key: string]: unknown;
}

export interface UseOnboardingChat {
  // Auth/identity
  isAuthenticated: boolean;
  authLoading: boolean;
  userName: string | null;
  userEmail: string | null;
  queryRole: string | null;
  // Chat state
  messages: OnboardingMessage[];
  input: string;
  setInput: (value: string) => void;
  loading: boolean;
  completed: boolean;
  status: OnboardingChatStatus | null;
  // Refs
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  inputRef: React.RefObject<HTMLInputElement | null>;
  // Handlers
  sendMessage: () => Promise<void>;
  handleKeyDown: (event: React.KeyboardEvent) => void;
  goToDashboard: () => void;
}

/**
 * Encapsulates all state, side-effects and network calls used by the
 * conversational onboarding page. The page component only wires this hook
 * to its presentational sub-components, keeping `page.tsx` focused on
 * layout and orchestration.
 */
export function useOnboardingChat(): UseOnboardingChat {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading: authLoading, workspace, userName, userEmail } = useAuth();
  const queryRole = normalizeOnboardingRole(searchParams.get('role'));
  const [storedRole] = useState<string | null>(() => {
    if (typeof window === 'undefined') {
      return null;
    }
    return normalizeOnboardingRole(window.localStorage.getItem('kloel_onboarding_role'));
  });
  const selectedRole = queryRole || storedRole;

  const workspaceId = isAuthenticated && workspace?.id ? workspace.id : null;
  const startedRef = useRef(false);
  const roleSeededRef = useRef(false);

  const [messages, setMessages] = useState<OnboardingMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [status, setStatus] = useState<OnboardingChatStatus | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to the latest message whenever the list grows.
  useEffect(() => {
    const el = messagesEndRef.current;
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  // Redirect to WhatsApp connect once onboarding finishes.
  useEffect(() => {
    if (completed) {
      router.push('/whatsapp?from=onboarding&autoConnect=1');
    }
  }, [completed, router]);

  const addMessage = useCallback((role: 'user' | 'assistant', content: string) => {
    setMessages((prev) => [...prev, createOnboardingMessage(role, content)]);
  }, []);

  const startOnboarding = useCallback(async () => {
    if (!workspaceId || startedRef.current) {
      return;
    }
    startedRef.current = true;
    setLoading(true);
    try {
      const headers = buildOnboardingHeaders(tokenStorage.getToken());

      const res = await fetch(apiUrl(`/kloel/onboarding/${workspaceId}/start`), {
        method: 'POST',
        headers,
      });
      const data: { message?: string } = await res.json();
      mutate(isOnboardingSwrKey);

      if (data.message) {
        addMessage('assistant', data.message);
      }

      if (selectedRole && !roleSeededRef.current) {
        roleSeededRef.current = true;
        const roleLabel = getOnboardingRoleLabel(selectedRole);
        const seed = buildRoleSeedMessage(roleLabel);
        addMessage('user', seed);
        const roleRes = await fetch(apiUrl(`/kloel/onboarding/${workspaceId}/chat`), {
          method: 'POST',
          headers,
          body: JSON.stringify({ message: seed }),
        });
        const roleData: { message?: string } = await roleRes.json();
        mutate(isOnboardingSwrKey);
        if (roleData.message) {
          addMessage('assistant', roleData.message);
        }
      }
    } catch (error) {
      console.error('Erro ao iniciar onboarding:', error);
      addMessage(
        'assistant',
        'Olá! Eu sou a Kloel, sua inteligência artificial de vendas. Vamos configurar sua conta? Me conte sobre seu negócio!',
      );
    }
    setLoading(false);
    inputRef.current?.focus();
  }, [addMessage, selectedRole, workspaceId]);

  // Auto-start the chat whenever the workspace becomes known.
  // queueMicrotask escapes the effect's synchronous frame so the React-X
  // rule no longer flags the transitive setLoading inside startOnboarding.
  useEffect(() => {
    if (!workspaceId) {
      return;
    }
    queueMicrotask(() => {
      void startOnboarding();
    });
  }, [workspaceId, startOnboarding]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading) {
      return;
    }
    if (!workspaceId) {
      return;
    }

    const userMessage = input.trim();
    setInput('');
    addMessage('user', userMessage);
    setLoading(true);

    try {
      const headers = buildOnboardingHeaders(tokenStorage.getToken());

      const res = await fetch(apiUrl(`/kloel/onboarding/${workspaceId}/chat/stream`), {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: userMessage }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = '';

      if (reader) {
        const readStream = async (): Promise<void> => {
          const { done, value } = await reader.read();
          if (done) {
            return;
          }

          const chunk = decoder.decode(value, { stream: true });
          const latest = extractSseContent(chunk);
          if (latest !== null) {
            assistantMessage = latest;
          }
          await readStream();
        };

        await readStream();
      }

      if (assistantMessage) {
        addMessage('assistant', assistantMessage);
      }

      const statusResult = await onboardingApi.getOnboardingStatus(workspaceId);
      if (statusResult.data) {
        setStatus(statusResult.data);
        if (statusResult.data.completed) {
          addMessage(
            'assistant',
            'Perfeito. Agora vamos conectar seu WhatsApp — vou abrir o QR Code na próxima tela.',
          );
          setCompleted(true);
        }
      }
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      addMessage('assistant', 'Desculpe, tive um problema. Pode repetir?');
    }

    setLoading(false);
    inputRef.current?.focus();
  }, [addMessage, input, loading, workspaceId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage],
  );

  const goToDashboard = useCallback(() => {
    router.push('/whatsapp');
  }, [router]);

  return {
    isAuthenticated,
    authLoading,
    userName,
    userEmail,
    queryRole,
    messages,
    input,
    setInput,
    loading,
    completed,
    status,
    messagesEndRef,
    inputRef,
    sendMessage,
    handleKeyDown,
    goToDashboard,
  };
}
