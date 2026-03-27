'use client';

import dynamic from 'next/dynamic';

const ChatContainer = dynamic(
  () => import('@/components/kloel/chat-container').then(mod => ({ default: mod.ChatContainer })),
  { ssr: false, loading: () => (
    <div style={{ background: '#0A0A0C', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 20, height: 20, border: '2px solid transparent', borderTopColor: '#E85D30', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )}
);

export default function ChatPage() {
  return <ChatContainer />;
}
