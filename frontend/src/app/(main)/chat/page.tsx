'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { KloelChat } from '@/components/chat';
import { useWorkspace } from '@/hooks/useWorkspaceId';
import { colors } from '@/lib/design-tokens';

const Loader = () => (
  <div style={{width:20,height:20,border:'2px solid transparent',borderTopColor:'#E85D30',borderRadius:'50%',animation:'spin 1s linear infinite'}} />
);

function ChatContent() {
  const { workspaceId, isLoading } = useWorkspace();
  const searchParams = useSearchParams();

  const initialMessage = searchParams.get('q') || undefined;

  if (isLoading) {
    return (
      <div
        className="h-full flex items-center justify-center"
        style={{ backgroundColor: colors.background.base }}
      >
        <Loader />
      </div>
    );
  }

  return (
    <div className="h-full">
      <KloelChat
        workspaceId={workspaceId}
        initialMessage={initialMessage}
      />
    </div>
  );
}

export default function ChatPage() {
  return (
    <div
      style={{ height: '100%', backgroundColor: colors.background.void, display: 'flex', flexDirection: 'column' }}
    >
      <Suspense fallback={
        <div
          className="h-full flex items-center justify-center"
          style={{ backgroundColor: colors.background.base }}
        >
          <Loader />
        </div>
      }>
        <ChatContent />
      </Suspense>
    </div>
  );
}
