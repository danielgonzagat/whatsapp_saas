'use client';

import { Suspense } from 'react';

import { colors } from '@/lib/design-tokens';
import { ErrorBoundary } from '@/components/kloel/ErrorBoundary';

import { OnboardingChatHeader } from './OnboardingChatHeader';
import { OnboardingChatHero } from './OnboardingChatHero';
import { OnboardingChatInputBar } from './OnboardingChatInputBar';
import { OnboardingChatMessageList } from './OnboardingChatMessageList';
import { OnboardingLoading } from './OnboardingLoading';
import { buildOnboardingLoginUrl } from './onboarding-chat.helpers';
import { useOnboardingChat } from './onboarding-chat.hooks';

function OnboardingChatContent() {
  const {
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
  } = useOnboardingChat();

  const goToLogin = () => {
    router.push('/login');
  };

  // Show loading while checking auth status
  if (authLoading) {
    return <OnboardingLoading />;
  }

  // Unauthenticated landing — render hero instead of redirecting
  if (!isAuthenticated) {
    return <OnboardingChatHero loginUrl={buildOnboardingLoginUrl(queryRole)} />;
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: colors.background.void,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <OnboardingChatHeader
        messagesCount={status?.messagesCount}
        userName={userName}
        userEmail={userEmail}
      />

      <OnboardingChatMessageList
        messages={messages}
        loading={loading}
        completed={completed}
        onGoToDashboard={goToDashboard}
        messagesEndRef={messagesEndRef}
      />

      {!completed && (
        <OnboardingChatInputBar
          input={input}
          loading={loading}
          onChange={setInput}
          onSubmit={sendMessage}
          onKeyDown={handleKeyDown}
          inputRef={inputRef}
        />
      )}
    </div>
  );
}

/** Conversational onboarding page. */
export default function ConversationalOnboardingPage() {
  return (
    <Suspense fallback={<OnboardingLoading />}>
      <OnboardingChatContent />
    </Suspense>
  );
}
