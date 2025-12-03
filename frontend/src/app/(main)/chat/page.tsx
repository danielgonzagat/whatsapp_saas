'use client';

import { KloelChat } from '@/components/chat';

export default function ChatPage() {
  return (
    <div className="h-[calc(100vh-120px)] rounded-xl overflow-hidden border border-[#2A2A3E] bg-[#0A0A0F]">
      <KloelChat workspaceId="default" />
    </div>
  );
}
