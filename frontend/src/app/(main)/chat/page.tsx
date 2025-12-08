'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { KloelChat } from '@/components/chat';
import { Loader2 } from 'lucide-react';
import { useWorkspace } from '@/hooks/useWorkspaceId';

// -------------- DESIGN TOKENS --------------
const COLORS = {
  bg: '#050608',
  green: '#28E07B',
};

function ChatContent() {
  const { workspaceId, isLoading } = useWorkspace();
  const searchParams = useSearchParams();
  
  const initialMessage = searchParams.get('q') || undefined;
  
  if (isLoading) {
    return (
      <div 
        className="h-full flex items-center justify-center"
        style={{ backgroundColor: COLORS.bg }}
      >
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: COLORS.green }} />
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
      style={{ backgroundColor: COLORS.bg }}
    >
      <Suspense fallback={
        <div 
          className="h-full flex items-center justify-center"
          style={{ backgroundColor: COLORS.bg }}
        >
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: COLORS.green }} />
        </div>
      }>
        <ChatContent />
      </Suspense>
    </div>
  );
}
