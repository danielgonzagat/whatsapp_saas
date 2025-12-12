'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { KloelChat } from '@/components/chat';
import { Loader2 } from 'lucide-react';
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
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: colors.brand.primary }} />
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
      className="h-[calc(100vh-56px)]"
      style={{ backgroundColor: colors.background.base }}
    >
      <Suspense fallback={
        <div 
          className="h-full flex items-center justify-center"
          style={{ backgroundColor: colors.background.base }}
        >
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: colors.brand.primary }} />
        </div>
      }>
        <ChatContent />
      </Suspense>
    </div>
  );
}
