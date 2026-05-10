'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
export const dynamic = 'force-dynamic';

import { SectionPage } from '@/components/kloel/SectionPage';
import { tokenStorage } from '@/lib/api';
import { type VoiceProfile, mediaApi, videoApi, voiceApi } from '@/lib/api/media';
import { swrFetcher } from '@/lib/fetcher';
import { useCallback, useEffect, useState } from 'react';
import useSWR from 'swr';
import { errorMessage, readStringField } from './page.helpers';
import {
  type Tab,
  type VideoJob,
} from './page.shared';
import { VideoJobsTab } from './VideoJobsTab';
import { VideoCreateTab } from './VideoCreateTab';
import { VoiceProfilesTab } from './VoiceProfilesTab';
import { MediaProcessingTab } from './MediaProcessingTab';

export default function VideoPage() {
  const [activeTab, setActiveTab] = useState<Tab>('jobs');

  const { data, error, isLoading, mutate } = useSWR<VideoJob[] | { jobs: VideoJob[] }>(
    '/video/jobs',
    swrFetcher,
  );
  const jobs: VideoJob[] = Array.isArray(data) ? data : data?.jobs || [];

  const [createUrl, setCreateUrl] = useState('');
  const [createPrompt, setCreatePrompt] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    if (!createUrl.trim() && !createPrompt.trim()) {
      return;
    }
    setCreating(true);
    setCreateError(null);
    setCreateSuccess(null);
    try {
      const res = await videoApi.create(createUrl.trim(), createPrompt.trim());
      if (res.error) {
        throw new Error(res.error);
      }
      const resData = res.data as Record<string, unknown> | null;
      setCreateSuccess(
        `Job criado: ${resData && typeof resData === 'object' && 'id' in resData ? resData.id : 'ok'}`,
      );
      setCreateUrl('');
      setCreatePrompt('');
      mutate();
      setActiveTab('jobs');
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : 'Erro ao criar job');
    } finally {
      setCreating(false);
    }
  }, [createUrl, createPrompt, mutate]);

  const handleRefreshJob = useCallback(
    async (id: string) => {
      try {
        await videoApi.getJob(id);
        mutate();
      } catch {
        // ignore
      }
    },
    [mutate],
  );

  const [voiceProfiles, setVoiceProfiles] = useState<VoiceProfile[]>([]);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [newVoiceName, setNewVoiceName] = useState('');
  const [newVoiceId, setNewVoiceId] = useState('');
  const [newVoiceProvider, setNewVoiceProvider] = useState('elevenlabs');
  const [creatingVoice, setCreatingVoice] = useState(false);
  const [genText, setGenText] = useState('');
  const [genProfileId, setGenProfileId] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  const loadVoiceProfiles = useCallback(async () => {
    setVoiceLoading(true);
    setVoiceError(null);
    try {
      const workspaceId = tokenStorage.getWorkspaceId() ?? undefined;
      const res = await voiceApi.listProfiles(workspaceId);
      if (res.error) {
        throw new Error(res.error);
      }
      const d = res.data as VoiceProfile[] | { profiles: VoiceProfile[] } | null;
      setVoiceProfiles(
        Array.isArray(d) ? d : ((d && 'profiles' in d ? d.profiles : undefined) ?? []),
      );
    } catch (e: unknown) {
      setVoiceError(errorMessage(e, 'Erro ao carregar perfis'));
    } finally {
      setVoiceLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'voice') {
      loadVoiceProfiles();
    }
  }, [activeTab, loadVoiceProfiles]);

  const handleCreateVoice = useCallback(async () => {
    if (!newVoiceName.trim()) {
      return;
    }
    setCreatingVoice(true);
    try {
      const res = await voiceApi.createProfile({
        name: newVoiceName.trim(),
        voiceId: newVoiceId.trim() || undefined,
        provider: newVoiceProvider || undefined,
      });
      if (res.error) {
        throw new Error(res.error);
      }
      setNewVoiceName('');
      setNewVoiceId('');
      await loadVoiceProfiles();
    } catch (e: unknown) {
      setVoiceError(errorMessage(e, 'Erro ao criar perfil'));
    } finally {
      setCreatingVoice(false);
    }
  }, [newVoiceName, newVoiceId, newVoiceProvider, loadVoiceProfiles]);

  const handleGenerate = useCallback(async () => {
    if (!genText.trim()) {
      return;
    }
    setGenerating(true);
    setGenResult(null);
    setGenError(null);
    try {
      const res = await voiceApi.generate({
        text: genText.trim(),
        voiceProfileId: genProfileId || undefined,
      });
      if (res.error) {
        throw new Error(res.error);
      }
      setGenResult(readStringField(res.data, 'audioUrl') || 'Audio gerado (sem URL)');
    } catch (e: unknown) {
      setGenError(errorMessage(e, 'Erro ao gerar audio'));
    } finally {
      setGenerating(false);
    }
  }, [genText, genProfileId]);

  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaPrompt, setMediaPrompt] = useState('');
  const [mediaType, setMediaType] = useState('video');
  const [processingMedia, setProcessingMedia] = useState(false);
  const [mediaJobId, setMediaJobId] = useState<string | null>(null);
  const [mediaStatus, setMediaStatus] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const handleProcessMedia = useCallback(async () => {
    setProcessingMedia(true);
    setMediaError(null);
    setMediaJobId(null);
    setMediaStatus(null);
    try {
      const res = await mediaApi.processVideo({
        inputUrl: mediaUrl.trim() || undefined,
        prompt: mediaPrompt.trim() || undefined,
        type: mediaType,
      });
      if (res.error) {
        throw new Error(res.error);
      }
      setMediaJobId(readStringField(res.data, 'id'));
      setMediaStatus(readStringField(res.data, 'status', 'PENDING'));
    } catch (e: unknown) {
      setMediaError(errorMessage(e, 'Erro ao processar midia'));
    } finally {
      setProcessingMedia(false);
    }
  }, [mediaUrl, mediaPrompt, mediaType]);

  const handleCheckMediaJob = useCallback(async () => {
    if (!mediaJobId) {
      return;
    }
    try {
      const res = await mediaApi.getJob(mediaJobId);
      if (res.error) {
        throw new Error(res.error);
      }
      setMediaStatus(readStringField(res.data, 'status') || mediaStatus);
    } catch (e: unknown) {
      setMediaError(errorMessage(e, 'Erro ao verificar job'));
    }
  }, [mediaJobId, mediaStatus]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'jobs', label: 'Jobs de Video' },
    { id: 'create', label: 'Criar Video' },
    { id: 'voice', label: 'Perfis de Voz' },
    { id: 'media', label: 'Processar Midia' },
  ];

  return (
    <SectionPage
      title={kloelT(`Video AI`)}
      icon={'\u{1F3AC}'}
      description={kloelT(`Jobs de geracao e processamento de video`)}
    >
      <div
        style={{
          display: 'flex',
          gap: 0,
          borderBottom: '1px solid var(--border-space)',
          marginBottom: 20,
        }}
      >
        {tabs.map((t) => (
          <button
            type="button"
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: '10px 18px',
              fontSize: 13,
              fontFamily: "'Sora', sans-serif",
              fontWeight: activeTab === t.id ? 600 : 400,
              color: activeTab === t.id ? colors.ember.primary : colors.text.muted,
              background: 'none',
              border: 'none',
              borderBottom:
                activeTab === t.id ? '2px solid colors.ember.primary' : '2px solid transparent',
              cursor: 'pointer',
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'jobs' && (
        <VideoJobsTab
          jobs={jobs}
          isLoading={isLoading}
          error={error}
          onRefresh={handleRefreshJob}
        />
      )}

      {activeTab === 'create' && (
        <VideoCreateTab
          createUrl={createUrl}
          createPrompt={createPrompt}
          creating={creating}
          createError={createError}
          createSuccess={createSuccess}
          onUrlChange={setCreateUrl}
          onPromptChange={setCreatePrompt}
          onCreate={handleCreate}
        />
      )}

      {activeTab === 'voice' && (
        <VoiceProfilesTab
          voiceProfiles={voiceProfiles}
          voiceLoading={voiceLoading}
          voiceError={voiceError}
          newVoiceName={newVoiceName}
          newVoiceId={newVoiceId}
          newVoiceProvider={newVoiceProvider}
          creatingVoice={creatingVoice}
          genText={genText}
          genProfileId={genProfileId}
          generating={generating}
          genResult={genResult}
          genError={genError}
          onNewVoiceNameChange={setNewVoiceName}
          onNewVoiceIdChange={setNewVoiceId}
          onNewVoiceProviderChange={setNewVoiceProvider}
          onCreateVoice={handleCreateVoice}
          onGenTextChange={setGenText}
          onGenProfileIdChange={setGenProfileId}
          onGenerate={handleGenerate}
        />
      )}

      {activeTab === 'media' && (
        <MediaProcessingTab
          mediaUrl={mediaUrl}
          mediaPrompt={mediaPrompt}
          mediaType={mediaType}
          processingMedia={processingMedia}
          mediaJobId={mediaJobId}
          mediaStatus={mediaStatus}
          mediaError={mediaError}
          onMediaUrlChange={setMediaUrl}
          onMediaPromptChange={setMediaPrompt}
          onMediaTypeChange={setMediaType}
          onProcess={handleProcessMedia}
          onCheck={handleCheckMediaJob}
        />
      )}
    </SectionPage>
  );
}
