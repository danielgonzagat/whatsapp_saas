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
import { CampaignCreateForm } from './CampaignsView.create-form';
import { CampaignsTable } from './CampaignsView.table';

const SORA = "'Sora', sans-serif";
const BG_CARD = KLOEL_THEME.bgCard;
const BORDER = KLOEL_THEME.borderPrimary;
const TEXT_PRIMARY = KLOEL_THEME.textPrimary;
const TEXT_SECONDARY = KLOEL_THEME.textSecondary;
const TEXT_TERTIARY = KLOEL_THEME.textTertiary;
const ACCENT = KLOEL_THEME.accent;

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

      <CampaignCreateForm
        show={showCreate}
        newName={newName}
        newMessage={newMessage}
        creating={creating}
        onNameChange={setNewName}
        onMessageChange={setNewMessage}
        onCreate={handleCreate}
        onCancel={() => setShowCreate(false)}
      />

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
        <CampaignsTable
          campaigns={campaigns}
          busyId={busyId}
          onLaunch={handleLaunch}
          onPause={handlePause}
        />
      )}
    </div>
  );
}
