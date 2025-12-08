'use client';

import { KloelChat } from '@/components/chat';
import { Loader2 } from 'lucide-react';
import { useWorkspace } from '@/hooks/useWorkspaceId';

export default function ChatPage() {
  const { workspaceId, isLoading } = useWorkspace();
  
  if (isLoading) {
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
