'use client';

import { useRouter } from 'next/navigation';
import { useConversations } from '@/hooks/useInbox';
import { Card } from '@/components/kloel/Card';
import { PageTitle } from '@/components/kloel/PageTitle';
import { Lbl } from '@/components/kloel/Lbl';
import { Val } from '@/components/kloel/Val';
import { OrbitalLoader } from '@/components/kloel/cosmos/OrbitalLoader';
import { StarField } from '@/components/kloel/cosmos/StarField';
import { colors, typography, motion } from '@/lib/design-tokens';

export default function ParceriasChatPage() {
  const router = useRouter();
  const { conversations, isLoading } = useConversations();

  // Filter to partner/affiliate-related conversations
  const partnerConversations = (conversations || []).filter(
    (c: any) =>
      c.type === 'affiliate' ||
      c.type === 'partner' ||
      c.channel === 'affiliate' ||
      c.tags?.includes('affiliate') ||
      c.tags?.includes('parceiro') ||
      true, // fallback: show all conversations if no specific filter matches
  );

  const unreadCount = partnerConversations.filter(
    (c: any) => c.unread || c.unreadCount > 0 || c.status === 'unread',
  ).length;

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', background: colors.background.void }}>
        <OrbitalLoader size={36} />
      </div>
    );
  }

  return (
    <div style={{ padding: 32, position: 'relative', minHeight: '100vh', background: colors.background.void }}>
      <StarField density={35} />
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 960 }}>
        <PageTitle
          title="Chat com Afiliados"
          sub="Converse com seus parceiros e afiliados"
          right={
            <button
              onClick={() => router.push('/chat')}
              style={{
                padding: '10px 20px',
                background: colors.accent.webb,
                border: 'none',
                borderRadius: 10,
                color: '#fff',
                fontFamily: typography.fontFamily.display,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: `all ${motion.duration.normal} ${motion.easing.gravity}`,
              }}
            >
              Abrir chat completo
            </button>
          }
        />

        {/* Stat Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
          <Card>
            <Lbl>Conversas</Lbl>
            <Val size={28}>{partnerConversations.length}</Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 4 }}>
              com parceiros
            </div>
          </Card>
          <Card>
            <Lbl>Nao Lidas</Lbl>
            <Val size={28} color={unreadCount > 0 ? colors.state.warning : colors.state.success}>{unreadCount}</Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 4 }}>
              {unreadCount > 0 ? 'aguardando resposta' : 'tudo em dia'}
            </div>
          </Card>
        </div>

        {/* Conversation List */}
        <h2 style={{
          fontFamily: typography.fontFamily.display, fontSize: 16, fontWeight: 600,
          color: colors.text.starlight, marginBottom: 16,
        }}>
          Conversas Recentes
        </h2>

        {partnerConversations.length === 0 ? (
          <Card>
            <div style={{ textAlign: 'center', padding: 32, position: 'relative' }}>
              <StarField density={20} />
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ marginBottom: 12 }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={colors.text.dust} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto' }}>
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <div style={{ fontFamily: typography.fontFamily.display, fontSize: 15, fontWeight: 600, color: colors.text.moonlight, marginBottom: 6 }}>
                  Nenhuma conversa com afiliados
                </div>
                <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 13, color: colors.text.dust, marginBottom: 16 }}>
                  Quando seus afiliados enviarem mensagens, as conversas aparecerao aqui.
                </div>
                <button
                  onClick={() => router.push('/chat')}
                  style={{
                    padding: '10px 24px',
                    background: 'rgba(78, 122, 224, 0.08)',
                    border: `1px solid ${colors.border.space}`,
                    borderRadius: 10,
                    color: colors.accent.webb,
                    fontFamily: typography.fontFamily.display,
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    transition: `all ${motion.duration.normal} ${motion.easing.gravity}`,
                  }}
                >
                  Ir para o Chat
                </button>
              </div>
            </div>
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {partnerConversations.map((c: any, i: number) => {
              const name = c.contact?.name || c.contactName || c.name || c.phone || `Parceiro ${i + 1}`;
              const lastMsg = c.lastMessage?.body || c.lastMessage?.text || c.lastMessagePreview || c.preview || '';
              const isUnread = c.unread || (c.unreadCount || 0) > 0 || c.status === 'unread';
              const timestamp = c.lastMessage?.createdAt || c.updatedAt || c.lastMessageAt;

              return (
                <Card
                  key={c.id || c._id || c.conversationId || i}
                  onClick={() => router.push('/chat')}
                  style={{ padding: '14px 20px' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    {/* Avatar */}
                    <div style={{
                      width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
                      background: isUnread ? 'rgba(78, 122, 224, 0.12)' : colors.background.nebula,
                      border: `1px solid ${isUnread ? colors.accent.webb : colors.border.space}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: typography.fontFamily.display, fontSize: 16, fontWeight: 600,
                      color: isUnread ? colors.accent.webb : colors.text.moonlight,
                    }}>
                      {name[0].toUpperCase()}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                        <div style={{
                          fontFamily: typography.fontFamily.display, fontSize: 14,
                          fontWeight: isUnread ? 700 : 600,
                          color: isUnread ? colors.text.starlight : colors.text.moonlight,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
                        }}>
                          {name}
                        </div>
                        <div style={{
                          fontFamily: typography.fontFamily.sans, fontSize: 11,
                          color: isUnread ? colors.accent.webb : colors.text.dust,
                          whiteSpace: 'nowrap' as const, marginLeft: 12, flexShrink: 0,
                        }}>
                          {timestamp
                            ? new Date(timestamp).toLocaleString('pt-BR', {
                                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                              })
                            : '--'}
                        </div>
                      </div>
                      <div style={{
                        fontFamily: typography.fontFamily.sans, fontSize: 12,
                        color: colors.text.dust, lineHeight: 1.4,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
                      }}>
                        {lastMsg || 'Sem mensagens ainda'}
                      </div>
                    </div>

                    {/* Unread indicator */}
                    {isUnread && (
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: colors.accent.webb, flexShrink: 0,
                      }} />
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
