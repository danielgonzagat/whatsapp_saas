'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { KloelChat } from '@/components/chat';
import { OrbitalLoader } from '@/components/kloel/cosmos/OrbitalLoader';
import { useWorkspace } from '@/hooks/useWorkspaceId';
import { colors } from '@/lib/design-tokens';

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
        <OrbitalLoader size={32} />
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
          <OrbitalLoader size={32} />
        </div>
      }>
        <ChatContent />
      </Suspense>
    </div>
  );
}
