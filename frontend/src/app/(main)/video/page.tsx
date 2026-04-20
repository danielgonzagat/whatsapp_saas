'use client';

import { kloelT } from '@/lib/i18n/t';
/** Dynamic. */
export const dynamic = 'force-dynamic';

import { Card } from '@/components/kloel/Card';
import { ContextualEmptyState } from '@/components/kloel/EmptyStates';
import { SectionPage } from '@/components/kloel/SectionPage';
import { tokenStorage } from '@/lib/api';
import { type VoiceProfile, mediaApi, videoApi, voiceApi } from '@/lib/api/misc';
import { swrFetcher } from '@/lib/fetcher';
import { useCallback, useEffect, useState } from 'react';
import useSWR from 'swr';
import { errorMessage, readStringField } from './page.helpers';

interface VideoJob {
  id: string;
  status: string;
  inputUrl?: string;
  prompt?: string;
  outputUrl?: string;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  PROCESSING: '#3B82F6',
  COMPLETED: '#10B981',
  FAILED: '#EF4444',
  PENDING: '#F59E0B',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid var(--app-border-primary)',
  borderRadius: 6,
  padding: '9px 12px',
  color: 'var(--app-text-primary)',
  fontSize: 13,
  fontFamily: "'Sora', sans-serif",
  outline: 'none',
  boxSizing: 'border-box',
};

const btnPrimary: React.CSSProperties = {
  background: '#E85D30',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  padding: '9px 20px',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
  fontFamily: "'Sora', sans-serif",
  whiteSpace: 'nowrap',
};

const btnSecondary: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  color: 'var(--app-text-primary)',
  border: '1px solid var(--app-border-primary)',
  borderRadius: 6,
  padding: '9px 20px',
  cursor: 'pointer',
  fontSize: 13,
  fontFamily: "'Sora', sans-serif",
  whiteSpace: 'nowrap',
};

function VideoJobRow({ job, onRefresh }: { job: VideoJob; onRefresh: (id: string) => void }) {
  const status = job.status?.toUpperCase() || 'PENDING';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '14px 16px',
        borderBottom: '1px solid #222226',
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: STATUS_COLORS[status] || '#6E6E73',
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--app-text-primary)',
            fontFamily: "'Sora', sans-serif",
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {job.prompt || job.inputUrl || 'Video job'}
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'var(--app-text-secondary)',
            marginTop: 2,
            fontFamily: "'Sora', sans-serif",
          }}
        >
          {status.toLowerCase()}
          {job.outputUrl && (
            <>
              {' · '}
              <a
                href={job.outputUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#E85D30' }}
              >
                {kloelT(`ver output`)}
              </a>
            </>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <div
          style={{
            fontSize: 11,
            color: 'var(--app-text-tertiary)',
            fontFamily: "'Sora', sans-serif",
          }}
        >
          {new Date(job.createdAt).toLocaleDateString('pt-BR')}
        </div>
        {(status === 'PROCESSING' || status === 'PENDING') && (
          <button
            type="button"
            onClick={() => onRefresh(job.id)}
            style={{ ...btnSecondary, padding: '4px 10px', fontSize: 11 }}
          >
            {kloelT(`Atualizar`)}
          </button>
        )}
      </div>
    </div>
  );
}

type Tab = 'jobs' | 'create' | 'voice' | 'media';

/** Video page. */
export default function VideoPage() {
  const [activeTab, setActiveTab] = useState<Tab>('jobs');

  // Video jobs
  const { data, error, isLoading, mutate } = useSWR<VideoJob[] | { jobs: VideoJob[] }>(
    '/video/jobs',
    swrFetcher,
  );
  const jobs: VideoJob[] = Array.isArray(data) ? data : data?.jobs || [];

  // Create video job
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

  // Voice profiles
  const [voiceProfiles, setVoiceProfiles] = useState<VoiceProfile[]>([]);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [newVoiceName, setNewVoiceName] = useState('');
  const [newVoiceId, setNewVoiceId] = useState('');
  const [newVoiceProvider, setNewVoiceProvider] = useState('elevenlabs');
  const [creatingVoice, setCreatingVoice] = useState(false);

  // Generate voice
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

  // Media processing
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
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #222226', marginBottom: 20 }}>
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
              color: activeTab === t.id ? '#E85D30' : '#6E6E73',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === t.id ? '2px solid #E85D30' : '2px solid transparent',
              cursor: 'pointer',
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Jobs tab */}
      {activeTab === 'jobs' &&
        (isLoading ? (
          <Card>
            <div
              style={{
                padding: 32,
                textAlign: 'center',
                color: 'var(--app-text-secondary)',
                fontFamily: "'Sora', sans-serif",
              }}
            >
              {kloelT(`Carregando jobs...`)}
            </div>
          </Card>
        ) : error ? (
          <Card>
            <div
              style={{
                padding: 32,
                textAlign: 'center',
                color: '#EF4444',
                fontFamily: "'Sora', sans-serif",
              }}
            >
              {kloelT(`Erro ao carregar video jobs`)}
            </div>
          </Card>
        ) : jobs.length === 0 ? (
          <ContextualEmptyState
            context="generic"
            title={kloelT(`Nenhum job de video`)}
            description={kloelT(`Crie um job para gerar ou processar videos com IA.`)}
          />
        ) : (
          <Card>
            {jobs.map((job) => (
              <VideoJobRow key={job.id} job={job} onRefresh={handleRefreshJob} />
            ))}
          </Card>
        ))}

      {/* Create video tab */}
      {activeTab === 'create' && (
        <Card>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <p
                style={{
                  color: 'var(--app-text-secondary)',
                  fontSize: 11,
                  fontFamily: "'Sora', sans-serif",
                  marginBottom: 6,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                }}
              >
                {kloelT(`URL do video de entrada (opcional)`)}
              </p>
              <input
                aria-label="URL do video de entrada"
                type="url"
                value={createUrl}
                onChange={(e) => setCreateUrl(e.target.value)}
                placeholder="https://..."
                style={inputStyle}
              />
            </div>
            <div>
              <p
                style={{
                  color: 'var(--app-text-secondary)',
                  fontSize: 11,
                  fontFamily: "'Sora', sans-serif",
                  marginBottom: 6,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                }}
              >
                {kloelT(`Prompt / instrucao para a IA`)}
              </p>
              <textarea
                value={createPrompt}
                onChange={(e) => setCreatePrompt(e.target.value)}
                placeholder={kloelT(`Descreva o video que deseja gerar...`)}
                rows={4}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>
            {createError && (
              <div
                style={{
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  borderRadius: 6,
                  padding: '10px 14px',
                  color: '#EF4444',
                  fontSize: 13,
                }}
              >
                {createError}
              </div>
            )}
            {createSuccess && (
              <div
                style={{
                  background: 'rgba(16,185,129,0.08)',
                  border: '1px solid rgba(16,185,129,0.2)',
                  borderRadius: 6,
                  padding: '10px 14px',
                  color: '#10B981',
                  fontSize: 13,
                }}
              >
                {createSuccess}
              </div>
            )}
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating || (!createUrl.trim() && !createPrompt.trim())}
              style={{
                ...btnPrimary,
                opacity: creating || (!createUrl.trim() && !createPrompt.trim()) ? 0.5 : 1,
              }}
            >
              {creating ? 'Criando...' : 'Criar Job de Video'}
            </button>
          </div>
        </Card>
      )}

      {/* Voice profiles tab */}
      {activeTab === 'voice' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Create profile */}
          <Card>
            <div style={{ padding: 16 }}>
              <p
                style={{
                  color: 'var(--app-text-secondary)',
                  fontSize: 11,
                  fontFamily: "'Sora', sans-serif",
                  marginBottom: 12,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                }}
              >
                {kloelT(`Novo perfil de voz`)}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input
                  aria-label="Nome do perfil de voz"
                  type="text"
                  value={newVoiceName}
                  onChange={(e) => setNewVoiceName(e.target.value)}
                  placeholder={kloelT(`Nome do perfil`)}
                  style={inputStyle}
                />
                <input
                  aria-label="Voice ID do ElevenLabs"
                  type="text"
                  value={newVoiceId}
                  onChange={(e) => setNewVoiceId(e.target.value)}
                  placeholder={kloelT(`Voice ID (ex: ElevenLabs voice ID)`)}
                  style={inputStyle}
                />
                <select
                  value={newVoiceProvider}
                  onChange={(e) => setNewVoiceProvider(e.target.value)}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  <option value="elevenlabs">{kloelT(`ElevenLabs`)}</option>
                  <option value="openai">{kloelT(`OpenAI TTS`)}</option>
                  <option value="google">{kloelT(`Google TTS`)}</option>
                </select>
                {voiceError && <div style={{ color: '#EF4444', fontSize: 12 }}>{voiceError}</div>}
                <button
                  type="button"
                  onClick={handleCreateVoice}
                  disabled={creatingVoice || !newVoiceName.trim()}
                  style={{
                    ...btnPrimary,
                    opacity: creatingVoice || !newVoiceName.trim() ? 0.5 : 1,
                  }}
                >
                  {creatingVoice ? 'Criando...' : 'Criar Perfil'}
                </button>
              </div>
            </div>
          </Card>

          {/* Profile list */}
          <Card>
            <div style={{ padding: 16 }}>
              <p
                style={{
                  color: 'var(--app-text-secondary)',
                  fontSize: 11,
                  fontFamily: "'Sora', sans-serif",
                  marginBottom: 12,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                }}
              >
                {kloelT(`Perfis cadastrados`)}
              </p>
              {voiceLoading ? (
                <div style={{ color: 'var(--app-text-secondary)', fontSize: 13 }}>
                  {kloelT(`Carregando...`)}
                </div>
              ) : voiceProfiles.length === 0 ? (
                <div style={{ color: 'var(--app-text-tertiary)', fontSize: 13 }}>
                  {kloelT(`Nenhum perfil criado ainda.`)}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {voiceProfiles.map((p) => (
                    <div
                      key={p.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid var(--app-border-primary)',
                        borderRadius: 6,
                      }}
                    >
                      <div>
                        <div
                          style={{
                            color: 'var(--app-text-primary)',
                            fontSize: 13,
                            fontWeight: 600,
                          }}
                        >
                          {p.name}
                        </div>
                        <div
                          style={{ color: 'var(--app-text-secondary)', fontSize: 11, marginTop: 2 }}
                        >
                          {p.provider || '—'} {p.voiceId ? `· ${p.voiceId}` : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setGenProfileId(p.id)}
                        style={{
                          ...btnSecondary,
                          padding: '4px 10px',
                          fontSize: 11,
                          borderColor: genProfileId === p.id ? '#E85D30' : '#222226',
                          color: genProfileId === p.id ? '#E85D30' : '#E0DDD8',
                        }}
                      >
                        {genProfileId === p.id ? 'Selecionado' : 'Selecionar'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {/* Generate */}
          <Card>
            <div style={{ padding: 16 }}>
              <p
                style={{
                  color: 'var(--app-text-secondary)',
                  fontSize: 11,
                  fontFamily: "'Sora', sans-serif",
                  marginBottom: 12,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                }}
              >
                {kloelT(`Gerar audio`)}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <textarea
                  value={genText}
                  onChange={(e) => setGenText(e.target.value)}
                  placeholder={kloelT(`Texto para converter em audio...`)}
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
                {genError && <div style={{ color: '#EF4444', fontSize: 12 }}>{genError}</div>}
                {genResult && (
                  <div
                    style={{
                      background: 'rgba(16,185,129,0.08)',
                      border: '1px solid rgba(16,185,129,0.2)',
                      borderRadius: 6,
                      padding: '10px 14px',
                    }}
                  >
                    <p style={{ color: '#10B981', fontSize: 12, marginBottom: 4 }}>
                      {kloelT(`Audio gerado`)}
                    </p>
                    {genResult.startsWith('http') ? (
                      <audio controls src={genResult} style={{ width: '100%', marginTop: 4 }} />
                    ) : (
                      <p
                        style={{
                          color: 'var(--app-text-primary)',
                          fontSize: 12,
                          fontFamily: 'JetBrains Mono, monospace',
                        }}
                      >
                        {genResult}
                      </p>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={generating || !genText.trim()}
                  style={{ ...btnPrimary, opacity: generating || !genText.trim() ? 0.5 : 1 }}
                >
                  {generating ? 'Gerando...' : 'Gerar Audio'}
                </button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Media processing tab */}
      {activeTab === 'media' && (
        <Card>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <p
                style={{
                  color: 'var(--app-text-secondary)',
                  fontSize: 11,
                  fontFamily: "'Sora', sans-serif",
                  marginBottom: 6,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                }}
              >
                {kloelT(`Tipo de processamento`)}
              </p>
              <select
                value={mediaType}
                onChange={(e) => setMediaType(e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="video">{kloelT(`Video`)}</option>
                <option value="audio">{kloelT(`Audio`)}</option>
                <option value="image">{kloelT(`Imagem`)}</option>
              </select>
            </div>
            <div>
              <p
                style={{
                  color: 'var(--app-text-secondary)',
                  fontSize: 11,
                  fontFamily: "'Sora', sans-serif",
                  marginBottom: 6,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                }}
              >
                {kloelT(`URL da midia (opcional)`)}
              </p>
              <input
                aria-label="URL da midia"
                type="url"
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
                placeholder="https://..."
                style={inputStyle}
              />
            </div>
            <div>
              <p
                style={{
                  color: 'var(--app-text-secondary)',
                  fontSize: 11,
                  fontFamily: "'Sora', sans-serif",
                  marginBottom: 6,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                }}
              >
                {kloelT(`Instrucao / prompt`)}
              </p>
              <textarea
                value={mediaPrompt}
                onChange={(e) => setMediaPrompt(e.target.value)}
                placeholder={kloelT(`Descreva o processamento desejado...`)}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>
            {mediaError && (
              <div
                style={{
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  borderRadius: 6,
                  padding: '10px 14px',
                  color: '#EF4444',
                  fontSize: 13,
                }}
              >
                {mediaError}
              </div>
            )}
            {mediaJobId && (
              <div
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--app-border-primary)',
                  borderRadius: 6,
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div
                    style={{
                      color: 'var(--app-text-primary)',
                      fontSize: 12,
                      fontFamily: 'JetBrains Mono, monospace',
                    }}
                  >
                    {kloelT(`Job:`)} {mediaJobId}
                  </div>
                  <div
                    style={{
                      color: STATUS_COLORS[mediaStatus?.toUpperCase() || 'PENDING'] || '#6E6E73',
                      fontSize: 12,
                      marginTop: 2,
                    }}
                  >
                    {mediaStatus || 'PENDING'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCheckMediaJob}
                  style={{ ...btnSecondary, padding: '4px 10px', fontSize: 11 }}
                >
                  {kloelT(`Verificar status`)}
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={handleProcessMedia}
              disabled={processingMedia}
              style={{ ...btnPrimary, opacity: processingMedia ? 0.5 : 1 }}
            >
              {processingMedia ? 'Processando...' : 'Processar Midia'}
            </button>
          </div>
        </Card>
      )}
    </SectionPage>
  );
}
