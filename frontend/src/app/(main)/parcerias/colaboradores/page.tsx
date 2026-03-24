'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAnalyticsDashboard } from '@/hooks/useAnalytics';
import { useContacts } from '@/hooks/useCRM';
import { apiFetch, tokenStorage } from '@/lib/api';
import { Card } from '@/components/kloel/Card';
import { PageTitle } from '@/components/kloel/PageTitle';
import { Lbl } from '@/components/kloel/Lbl';
import { Val } from '@/components/kloel/Val';
import { Metric } from '@/components/kloel/Metric';
import { colors, typography, motion } from '@/lib/design-tokens';

const ROLES = [
  { value: 'editor', label: 'Editor', description: 'Pode editar produtos e conteudo' },
  { value: 'moderator', label: 'Moderador', description: 'Gerencia comunidade e suporte' },
  { value: 'analyst', label: 'Analista', description: 'Acesso a relatorios e metricas' },
  { value: 'finance', label: 'Financeiro', description: 'Gerencia pagamentos e saques' },
];

export default function ColaboradoresPage() {
  const router = useRouter();
  const { dashboard, isLoading: dashLoading } = useAnalyticsDashboard();
  const { contacts, isLoading: contactsLoading } = useContacts({ tag: 'colaborador' });

  const isLoading = dashLoading || contactsLoading;
  const dash = dashboard as any;

  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [invited, setInvited] = useState(false);

  const collaborators = contacts || [];

  const handleInvite = async () => {
    if (!email.trim()) return;
    const workspaceId = tokenStorage.getWorkspaceId();
    try {
      await apiFetch('/crm/contacts', {
        method: 'POST',
        body: { name: email, email, phone: '', workspaceId },
      });
      setInvited(true);
      setTimeout(() => {
        setInvited(false);
        setShowInvite(false);
        setEmail('');
      }, 2000);
    } catch (e) {
      console.error('Invite failed', e);
    }
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', background: colors.background.void }}>
        <div style={{width:20,height:20,border:'2px solid transparent',borderTopColor:'#E85D30',borderRadius:'50%',animation:'spin 1s linear infinite'}} />
      </div>
    );
  }

  return (
    <div style={{ padding: 32, position: 'relative', minHeight: '100vh', background: colors.background.void }}>
      
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 960 }}>
        <button
          onClick={() => router.push('/parcerias')}
          style={{
            background: 'none',
            border: 'none',
            color: colors.accent.webb,
            fontFamily: typography.fontFamily.sans,
            fontSize: 12,
            cursor: 'pointer',
            padding: 0,
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          &#8592; Voltar para Parcerias
        </button>

        <PageTitle
          title="Colaboradores"
          sub="Adicione e gerencie membros da sua equipe"
          right={
            <button
              onClick={() => setShowInvite(!showInvite)}
              style={{
                padding: '10px 20px',
                background: colors.accent.webb,
                border: 'none',
                borderRadius: 6,
                color: '#fff',
                fontFamily: typography.fontFamily.display,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              + Convidar
            </button>
          }
        />

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
          <Card>
            <Lbl>Total Colaboradores</Lbl>
            <Val size={24}>{dash?.collaborators ?? collaborators.length}</Val>
          </Card>
          <Card>
            <Lbl>Ativos Hoje</Lbl>
            <Val size={24} color={colors.state.success}>{dash?.activeCollaborators ?? 0}</Val>
          </Card>
          <Card>
            <Lbl>Convites Pendentes</Lbl>
            <Val size={24} color={colors.accent.gold}>{dash?.pendingInvites ?? 0}</Val>
          </Card>
        </div>

        {/* Invite Form */}
        {showInvite && (
          <Card style={{ padding: 24, marginBottom: 24 }}>
            <Lbl>Convidar Colaborador</Lbl>
            {invited ? (
              <div style={{ textAlign: 'center', padding: 16 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>&#9989;</div>
                <div style={{ fontFamily: typography.fontFamily.display, fontSize: 14, fontWeight: 600, color: colors.state.success }}>
                  Convite enviado com sucesso!
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 12, color: colors.text.dust, marginBottom: 4 }}>Email</div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@exemplo.com"
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      background: colors.background.nebula,
                      border: `1px solid ${colors.border.space}`,
                      borderRadius: 6,
                      color: colors.text.starlight,
                      fontFamily: typography.fontFamily.sans,
                      fontSize: 14,
                      outline: 'none',
                    }}
                  />
                </div>
                <div style={{ width: 180 }}>
                  <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 12, color: colors.text.dust, marginBottom: 4 }}>Funcao</div>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      background: colors.background.nebula,
                      border: `1px solid ${colors.border.space}`,
                      borderRadius: 6,
                      color: colors.text.starlight,
                      fontFamily: typography.fontFamily.sans,
                      fontSize: 14,
                      outline: 'none',
                      appearance: 'none' as const,
                    }}
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={handleInvite}
                  style={{
                    padding: '10px 20px',
                    background: colors.accent.webb,
                    border: 'none',
                    borderRadius: 6,
                    color: '#fff',
                    fontFamily: typography.fontFamily.display,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap' as const,
                  }}
                >
                  Enviar Convite
                </button>
              </div>
            )}
          </Card>
        )}

        {/* Roles Explanation */}
        <h2 style={{
          fontFamily: typography.fontFamily.display,
          fontSize: 16,
          fontWeight: 600,
          color: colors.text.starlight,
          marginBottom: 16,
        }}>
          Funcoes Disponiveis
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 32 }}>
          {ROLES.map((r) => (
            <Card key={r.value} style={{ padding: 16 }}>
              <div style={{ fontFamily: typography.fontFamily.display, fontSize: 14, fontWeight: 600, color: colors.text.starlight, marginBottom: 4 }}>
                {r.label}
              </div>
              <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 12, color: colors.text.dust }}>
                {r.description}
              </div>
            </Card>
          ))}
        </div>

        {/* Collaborators List */}
        <h2 style={{
          fontFamily: typography.fontFamily.display,
          fontSize: 16,
          fontWeight: 600,
          color: colors.text.starlight,
          marginBottom: 16,
        }}>
          Membros da Equipe
        </h2>
        {collaborators.length === 0 ? (
          <Card>
            <div style={{ textAlign: 'center', padding: 32, color: colors.text.dust, fontFamily: typography.fontFamily.sans, fontSize: 14 }}>
              Nenhum colaborador adicionado. Convide membros da sua equipe para trabalhar juntos.
            </div>
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {collaborators.map((c: any, i: number) => (
              <Card key={c.id || c._id || c.phone || i} style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    background: colors.background.nebula,
                    border: `1px solid ${colors.border.space}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: typography.fontFamily.display,
                    fontSize: 16,
                    fontWeight: 600,
                    color: colors.accent.webb,
                    flexShrink: 0,
                  }}>
                    {(c.name || c.email || '?')[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: typography.fontFamily.display, fontSize: 14, fontWeight: 600, color: colors.text.starlight }}>
                      {c.name || 'Colaborador'}
                    </div>
                    <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 12, color: colors.text.dust }}>
                      {c.email || c.phone || '--'}
                    </div>
                  </div>
                  <span style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    fontFamily: typography.fontFamily.display,
                    color: colors.accent.webb,
                    background: 'rgba(232, 93, 48, 0.08)',
                  }}>
                    {c.role || 'membro'}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
