'use client';

import { useSession } from 'next-auth/react';
import { KloelChat } from '@/components/chat';
import { Loader2 } from 'lucide-react';

export default function ChatPage() {
  const { data: session, status } = useSession();
  
  // Get workspaceId from authenticated session
  const workspaceId = (session?.user as any)?.workspaceId || 'default';
  
  if (status === 'loading') {
    return (
      <div className="h-[calc(100vh-120px)] rounded-xl overflow-hidden border border-[#2A2A3E] bg-[#0A0A0F] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-120px)] rounded-xl overflow-hidden border border-[#2A2A3E] bg-[#0A0A0F]">
      <KloelChat workspaceId={workspaceId} />
    </div>
  );
}
