'use client';

import { kloelT } from '@/lib/i18n/t';
import { usePartnerChatContacts, markPartnerAsRead } from '@/hooks/usePartnerships';
import type { PartnerContact } from './partnershipTypes';
import { IC } from './ParceriasView.icons';
import { C, FONT } from './ParceriasDesignTokens';

export default function ChatContactList({
  selectedChat,
  onSelect,
  search,
  setSearch,
}: {
  selectedChat: PartnerContact | null;
  onSelect: (c: PartnerContact) => void;
  search: string;
  setSearch: (s: string) => void;
}) {
  const { contacts, mutate: mutateContacts } = usePartnerChatContacts();
  const displayContacts = contacts as unknown as PartnerContact[];

  const handleSelectContact = async (contact: PartnerContact) => {
    onSelect(contact);
    if ((contact.unread || 0) > 0) {
      try {
        await markPartnerAsRead(contact.id);
        mutateContacts();
      } catch {
        // silent
      }
    }
  };

  const filteredContacts = displayContacts.filter((c) => {
    if (!search) return true;
    return (c.name || '').toLowerCase().includes(search.toLowerCase());
  });

  const totalUnread = displayContacts.reduce((sum, c) => sum + (c.unread || 0), 0);

  return (
    <div style={{ width: 280, borderRight: `1px solid ${C.divider}`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <div style={{ padding: '16px 16px 12px', borderBottom: `1px solid ${C.divider}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: C.ember }}>{IC.chat(16)}</span>
            <span style={{ fontFamily: FONT.sans, fontSize: 14, fontWeight: 600, color: C.text }}>{kloelT(`Conversas`)}</span>
          </div>
          {totalUnread > 0 && (
            <span style={{ padding: '2px 8px', background: C.ember, borderRadius: 10, fontFamily: FONT.mono, fontSize: 11, fontWeight: 600, color: '#fff' }}>{totalUnread}</span>
          )}
        </div>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.muted }}>{IC.search(13)}</div>
          <input aria-label="Buscar conversa" type="text" placeholder={kloelT(`Buscar conversa...`)} value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', padding: '8px 12px 8px 30px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: FONT.sans, fontSize: 12, outline: 'none', boxSizing: 'border-box' as const }}
          />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filteredContacts.map((contact) => {
          const isSelected = selectedChat?.id === contact.id;
          return (
            <div key={contact.id} onClick={() => handleSelectContact(contact)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer', background: isSelected ? C.emberBg : 'transparent', borderLeft: isSelected ? `2px solid ${C.ember}` : '2px solid transparent', transition: 'background 150ms ease' }}
              onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = C.elevated; }}
              onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.currentTarget as HTMLElement).click(); } }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: contact.type === 'producer' ? 'rgba(139,92,246,0.12)' : C.elevated, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT.sans, fontSize: 14, fontWeight: 600, color: contact.type === 'producer' ? '#8B5CF6' : C.text }}>
                  {(contact.name || '?')[0].toUpperCase()}
                </div>
                {contact.online && <div style={{ position: 'absolute', bottom: 0, right: 0, width: 8, height: 8, borderRadius: '50%', background: '#10B981', border: `2px solid ${C.card}` }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                  <span style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: contact.unread ? 600 : 500, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{contact.name}</span>
                  <span style={{ fontFamily: FONT.sans, fontSize: 10, color: C.muted, flexShrink: 0, marginLeft: 8 }}>{contact.time}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontFamily: FONT.sans, fontSize: 12, color: contact.unread ? C.secondary : C.muted, fontWeight: contact.unread ? 500 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, flex: 1 }}>{contact.lastMessage}</span>
                  {(contact.unread || 0) > 0 && (
                    <span style={{ minWidth: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9, background: C.ember, fontFamily: FONT.mono, fontSize: 10, fontWeight: 600, color: '#fff', padding: '0 4px', flexShrink: 0 }}>{contact.unread}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {filteredContacts.length === 0 && displayContacts.length === 0 && (
          <div style={{ background: 'var(--app-bg-card)', border: '1px solid var(--app-border-primary)', borderRadius: 6, padding: '60px 20px', textAlign: 'center' as const }}>
            <span style={{ fontSize: 14, color: 'var(--app-text-tertiary)', display: 'block', marginBottom: 8 }}>{kloelT(`Nenhum contato`)}</span>
            <span style={{ fontSize: 12, color: 'var(--app-text-tertiary)' }}>{kloelT(`Conversas com parceiros aparecerao aqui`)}</span>
          </div>
        )}
        {filteredContacts.length === 0 && displayContacts.length > 0 && (
          <div style={{ textAlign: 'center' as const, padding: 32, color: C.muted }}>
            <span style={{ color: C.muted }}>{IC.chat(24)}</span>
            <p style={{ fontFamily: FONT.sans, fontSize: 13, marginTop: 8 }}>{kloelT(`Nenhuma conversa encontrada`)}</p>
          </div>
        )}
      </div>
    </div>
  );
}
