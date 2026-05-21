'use client';

import { useState } from 'react';
import type { PartnerContact, PartnerMessage } from './partnershipTypes';
import { C } from './ParceriasDesignTokens';
import ChatContactList from './ChatContactList';
import ChatMessageArea from './ChatMessageArea';

export default function PartnerChatRoom() {
  const [selectedChat, setSelectedChat] = useState<PartnerContact | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<PartnerMessage[]>([]);
  const [search, setSearch] = useState('');

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 180px)', background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden', animation: 'fadeIn 300ms ease' }}>
      <ChatContactList selectedChat={selectedChat} onSelect={setSelectedChat} search={search} setSearch={setSearch} />
      <ChatMessageArea selectedChat={selectedChat} chatInput={chatInput} setChatInput={setChatInput} messages={messages} setMessages={setMessages} />
    </div>
  );
}
