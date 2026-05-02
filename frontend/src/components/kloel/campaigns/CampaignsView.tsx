'use client';

import { kloelT } from '@/lib/i18n/t';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { useWorkspace } from '@/hooks/useWorkspaceId';
import {
  listCampaigns,
  createCampaign,
  launchCampaign,
  pauseCampaign,
  type Campaign,
} from '@/lib/api/campaigns';
import { useToast } from '@/components/kloel/ToastProvider';
import { useCallback, useEffect, useState } from 'react';

const SORA = "'Sora', sans-serif";
const MONO = "'JetBrains Mono', monospace";
const BG_CARD = KLOEL_THEME.bgCard;
const BG_ELEVATED = KLOEL_THEME.bgSecondary;
const BORDER = KLOEL_THEME.borderPrimary;
const TEXT_PRIMARY = KLOEL_THEME.textPrimary;
const TEXT_SECONDARY = KLOEL_THEME.textSecondary;
const TEXT_TERTIARY = KLOEL_THEME.textTertiary;
const ACCENT = KLOEL_THEME.accent;
const GREEN = KLOEL_THEME.green || '#22c55e';
const BLUE = KLOEL_THEME.blue || '#3b82f6';

function statusBadgeColor(status: string | undefined): string {
  const s = (status || 'DRAFT').toUpperCase();
  if (s === 'RUNNING') return BLUE;
  if (s === 'COMPLETED') return GREEN;
  if (s === 'SCHEDULED') return ACCENT;
  if (s === 'PAUSED') return TEXT_TERTIARY;
  return TEXT_TERTIARY;
}

export function CampaignsView() {
  const { workspaceId, isLoading: wsLoading } = useWorkspace();
  const { showToast } = useToast();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listCampaigns(workspaceId);
      setCampaigns(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (workspaceId) {
      void load();
    }
  }, [workspaceId, load]);

  const handleCreate = async () => {
    if (!newName.trim() || !workspaceId) return;
    setCreating(true);
    try {
      await createCampaign(workspaceId, {
        name: newName.trim(),
        messageTemplate: newMessage.trim() || undefined,
      });
      setNewName('');
      setNewMessage('');
      setShowCreate(false);
      showToast('Campanha criada', 'success');
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Erro ao criar campanha', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleLaunch = async (campaignId: string, smartTime = false) => {
    if (!workspaceId) return;
    setBusyId(`launch-${campaignId}`);
    try {
      await launchCampaign(workspaceId, campaignId, { smartTime });
      showToast('Campanha lançada', 'success');
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Erro ao lançar campanha', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handlePause = async (campaignId: string) => {
    if (!workspaceId) return;
    setBusyId(`pause-${campaignId}`);
    try {
      await pauseCampaign(workspaceId, campaignId);
      showToast('Campanha pausada', 'success');
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Erro ao pausar campanha', 'error');
    } finally {
      setBusyId(null);
    }
  };

  if (wsLoading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: TEXT_TERTIARY, fontFamily: SORA }}>
        {kloelT('Carregando...')}
      </div>
    );
  }

  return (
    <div style={{ padding: '20px 24px', maxWidth: 960, margin: '0 auto' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: SORA,
              fontSize: 20,
              fontWeight: 700,
              color: TEXT_PRIMARY,
              margin: 0,
            }}
          >
            {kloelT('Campanhas')}
          </h1>
          <p style={{ fontFamily: SORA, fontSize: 12, color: TEXT_SECONDARY, margin: '4px 0 0' }}>
            {kloelT('Crie, lance e acompanhe campanhas de email marketing')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(!showCreate)}
          style={{
            background: ACCENT,
            color: '#0A0A0C',
            border: 'none',
            borderRadius: 6,
            padding: '10px 20px',
            fontSize: 13,
            fontWeight: 600,
            fontFamily: SORA,
            cursor: 'pointer',
          }}
        >
          {kloelT('+ Nova Campanha')}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div
          style={{
            background: BG_CARD,
            borderRadius: 6,
            border: `1px solid ${BORDER}`,
            padding: 20,
            marginBottom: 20,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label
                style={{
                  fontFamily: SORA,
                  fontSize: 12,
                  color: TEXT_SECONDARY,
                  display: 'block',
                  marginBottom: 6,
                }}
              >
                {kloelT('Nome da campanha')}
              </label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={kloelT('Ex: Lançamento Verão 2026')}
                style={{
                  fontFamily: SORA,
                  fontSize: 13,
                  padding: '10px 14px',
                  width: '100%',
                  borderRadius: 6,
                  border: `1px solid ${BORDER}`,
                  background: BG_ELEVATED,
                  color: TEXT_PRIMARY,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label
                style={{
                  fontFamily: SORA,
                  fontSize: 12,
                  color: TEXT_SECONDARY,
                  display: 'block',
                  marginBottom: 6,
                }}
              >
                {kloelT('Mensagem (opcional)')}
              </label>
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={kloelT('Use {{name}} para personalizar com o nome do contato')}
                rows={4}
                style={{
                  fontFamily: SORA,
                  fontSize: 13,
                  padding: '10px 14px',
                  width: '100%',
                  borderRadius: 6,
                  border: `1px solid ${BORDER}`,
                  background: BG_ELEVATED,
                  color: TEXT_PRIMARY,
                  outline: 'none',
                  boxSizing: 'border-box',
                  resize: 'vertical',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                style={{
                  background: ACCENT,
                  color: '#0A0A0C',
                  border: 'none',
                  borderRadius: 6,
                  padding: '8px 16px',
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: SORA,
                  cursor: creating || !newName.trim() ? 'not-allowed' : 'pointer',
                  opacity: creating || !newName.trim() ? 0.5 : 1,
                }}
              >
                {creating ? kloelT('Criando...') : kloelT('Criar')}
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                style={{
                  background: 'transparent',
                  color: TEXT_SECONDARY,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 6,
                  padding: '8px 16px',
                  fontSize: 12,
                  fontFamily: SORA,
                  cursor: 'pointer',
                }}
              >
                {kloelT('Cancelar')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {error ? (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <p style={{ fontFamily: SORA, fontSize: 13, color: TEXT_TERTIARY }}>{error}</p>
          <button
            type="button"
            onClick={load}
            style={{
              marginTop: 12,
              background: ACCENT,
              color: '#0A0A0C',
              border: 'none',
              borderRadius: 6,
              padding: '8px 16px',
              fontSize: 12,
              fontFamily: SORA,
              cursor: 'pointer',
            }}
          >
            {kloelT('Tentar novamente')}
          </button>
        </div>
      ) : loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: TEXT_TERTIARY, fontFamily: SORA }}>
          {kloelT('Carregando campanhas...')}
        </div>
      ) : campaigns.length === 0 ? (
        <div
          style={{
            background: BG_CARD,
            borderRadius: 6,
            border: `1px solid ${BORDER}`,
            padding: 40,
            textAlign: 'center',
          }}
        >
          <p style={{ fontFamily: SORA, fontSize: 13, color: TEXT_TERTIARY, margin: 0 }}>
            {kloelT('Nenhuma campanha criada')}
          </p>
          <p style={{ fontFamily: SORA, fontSize: 11, color: TEXT_TERTIARY, margin: '4px 0 0' }}>
            {kloelT('Crie sua primeira campanha para começar a enviar emails.')}
          </p>
        </div>
      ) : (
        <div
          style={{
            background: BG_CARD,
            borderRadius: 6,
            border: `1px solid ${BORDER}`,
            overflow: 'hidden',
          }}
        >
          {/* Table header */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 2fr 1fr 1fr 1.5fr',
              padding: '10px 16px',
              borderBottom: `1px solid ${BORDER}`,
              background: BG_ELEVATED,
            }}
          >
            {['Status', 'Nome', 'Envios', 'Falhas', 'Ações'].map((h) => (
              <span
                key={h}
                style={{
                  fontFamily: MONO,
                  fontSize: 9,
                  fontWeight: 600,
                  color: TEXT_TERTIARY,
                  letterSpacing: '.08em',
                  textTransform: 'uppercase',
                }}
              >
                {h}
              </span>
            ))}
          </div>
          {/* Rows */}
          {campaigns.map((c, i) => {
            const stats = (c.stats || {}) as Record<string, number>;
            const sent = stats.sent || 0;
            const failed = stats.failed || 0;
            const delivered = stats.delivered || 0;
            const status = (c.status || 'DRAFT').toUpperCase();
            const isRunning = status === 'RUNNING' || status === 'SCHEDULED';
            return (
              <div
                key={c.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 2fr 1fr 1fr 1.5fr',
                  padding: '10px 16px',
                  borderBottom: i < campaigns.length - 1 ? `1px solid ${BORDER}` : 'none',
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 10,
                    fontWeight: 600,
                    color: statusBadgeColor(c.status),
                  }}
                >
                  {status}
                </span>
                <div>
                  <span
                    style={{
                      fontFamily: SORA,
                      fontSize: 13,
                      color: TEXT_PRIMARY,
                      display: 'block',
                    }}
                  >
                    {c.name}
                  </span>
                  {c.messageTemplate && (
                    <span
                      style={{
                        fontFamily: SORA,
                        fontSize: 10,
                        color: TEXT_TERTIARY,
                        display: 'block',
                        marginTop: 2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: 300,
                      }}
                    >
                      {c.messageTemplate}
                    </span>
                  )}
                </div>
                <span style={{ fontFamily: MONO, fontSize: 11, color: TEXT_PRIMARY }}>
                  {c.status === 'COMPLETED' || c.status === 'RUNNING' ? sent : '--'}
                </span>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    color: c.status === 'COMPLETED' && failed > 0 ? ACCENT : TEXT_SECONDARY,
                  }}
                >
                  {c.status === 'COMPLETED' || c.status === 'RUNNING'
                    ? `${failed}${delivered > 0 ? ` (${Math.round((failed / (sent || 1)) * 100)}%)` : ''}`
                    : '--'}
                </span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {isRunning ? (
                    <button
                      type="button"
                      onClick={() => handlePause(c.id)}
                      disabled={!!busyId}
                      style={{
                        background: 'transparent',
                        color: TEXT_SECONDARY,
                        border: `1px solid ${BORDER}`,
                        borderRadius: 6,
                        padding: '4px 10px',
                        fontSize: 11,
                        fontFamily: SORA,
                        cursor: busyId ? 'wait' : 'pointer',
                      }}
                    >
                      {busyId === `pause-${c.id}` ? '...' : kloelT('Pausar')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleLaunch(c.id)}
                      disabled={!!busyId}
                      style={{
                        background: ACCENT,
                        color: '#0A0A0C',
                        border: 'none',
                        borderRadius: 6,
                        padding: '4px 10px',
                        fontSize: 11,
                        fontWeight: 600,
                        fontFamily: SORA,
                        cursor: busyId ? 'wait' : 'pointer',
                      }}
                    >
                      {busyId === `launch-${c.id}` ? '...' : kloelT('Lançar')}
                    </button>
                  )}
                  {!isRunning && status !== 'COMPLETED' && status !== 'PAUSED' && (
                    <button
                      type="button"
                      onClick={() => handleLaunch(c.id, true)}
                      disabled={!!busyId}
                      style={{
                        background: 'transparent',
                        color: BLUE,
                        border: `1px solid ${BLUE}`,
                        borderRadius: 6,
                        padding: '4px 10px',
                        fontSize: 11,
                        fontFamily: SORA,
                        cursor: busyId ? 'wait' : 'pointer',
                      }}
                    >
                      {kloelT('Smart')}
                    </button>
                  )}
                  {c.scheduledAt && (
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: 9,
                        color: TEXT_TERTIARY,
                        alignSelf: 'center',
                      }}
                      title={new Date(c.scheduledAt).toLocaleString()}
                    >
                      {new Date(c.scheduledAt).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
