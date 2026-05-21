'use client';
import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { Card } from '@/components/kloel/Card';
import type { VoiceProfile } from '@/lib/api/media';

export function VoiceProfilesTab({
  voiceProfiles,
  voiceLoading,
  voiceError,
  newVoiceName,
  newVoiceId,
  newVoiceProvider,
  creatingVoice,
  genText,
  genProfileId,
  generating,
  genResult,
  genError,
  onNewVoiceNameChange,
  onNewVoiceIdChange,
  onNewVoiceProviderChange,
  onCreateVoice,
  onGenTextChange,
  onGenProfileIdChange,
  onGenerate,
}: {
  voiceProfiles: VoiceProfile[];
  voiceLoading: boolean;
  voiceError: string | null;
  newVoiceName: string;
  newVoiceId: string;
  newVoiceProvider: string;
  creatingVoice: boolean;
  genText: string;
  genProfileId: string;
  generating: boolean;
  genResult: string | null;
  genError: string | null;
  onNewVoiceNameChange: (v: string) => void;
  onNewVoiceIdChange: (v: string) => void;
  onNewVoiceProviderChange: (v: string) => void;
  onCreateVoice: () => void;
  onGenTextChange: (v: string) => void;
  onGenProfileIdChange: (v: string) => void;
  onGenerate: () => void;
}) {
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
              onChange={(e) => onNewVoiceNameChange(e.target.value)}
              placeholder={kloelT(`Nome do perfil`)}
              style={inputStyle}
            />
            <input
              aria-label="Voice ID do ElevenLabs"
              type="text"
              value={newVoiceId}
              onChange={(e) => onNewVoiceIdChange(e.target.value)}
              placeholder={kloelT(`Voice ID (ex: ElevenLabs voice ID)`)}
              style={inputStyle}
            />
            <select
              value={newVoiceProvider}
              onChange={(e) => onNewVoiceProviderChange(e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="elevenlabs">{kloelT(`ElevenLabs`)}</option>
              <option value="openai">{kloelT(`OpenAI TTS`)}</option>
              <option value="google">{kloelT(`Google TTS`)}</option>
            </select>
            {voiceError && (
              <div
                style={{
                  color: colors.semantic.error,
                  fontSize: 12,
                }}
              >
                {voiceError}
              </div>
            )}
            <button
              type="button"
              onClick={onCreateVoice}
              disabled={creatingVoice || !newVoiceName.trim()}
              style={{
                background: 'var(--app-accent)',
                color: 'var(--app-text-on-accent)',
                border: 'none',
                borderRadius: 6,
                padding: '9px 20px',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: "'Sora', sans-serif",
                whiteSpace: 'nowrap',
                opacity: creatingVoice || !newVoiceName.trim() ? 0.5 : 1,
              }}
            >
              {creatingVoice ? 'Criando...' : 'Criar Perfil'}
            </button>
          </div>
        </div>
      </Card>

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
                    onClick={() => onGenProfileIdChange(p.id)}
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      color: genProfileId === p.id ? colors.ember.primary : 'var(--app-text-primary)',
                      border: '1px solid var(--app-border-primary)',
                      borderRadius: 6,
                      padding: '4px 10px',
                      cursor: 'pointer',
                      fontSize: 11,
                      fontFamily: "'Sora', sans-serif",
                      whiteSpace: 'nowrap',
                      borderColor: genProfileId === p.id ? colors.ember.primary : undefined,
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
              onChange={(e) => onGenTextChange(e.target.value)}
              placeholder={kloelT(`Texto para converter em audio...`)}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
            {genError && (
              <div
                style={{
                  color: colors.semantic.error,
                  fontSize: 12,
                }}
              >
                {genError}
              </div>
            )}
            {genResult && (
              <div
                style={{
                  background: 'rgba(16,185,129,0.08)',
                  border: '1px solid rgba(16,185,129,0.2)',
                  borderRadius: 6,
                  padding: '10px 14px',
                }}
              >
                <p
                  style={{
                    color: colors.semantic.success,
                    fontSize: 12,
                    marginBottom: 4,
                  }}
                >
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
              onClick={onGenerate}
              disabled={generating || !genText.trim()}
              style={{
                background: 'var(--app-accent)',
                color: 'var(--app-text-on-accent)',
                border: 'none',
                borderRadius: 6,
                padding: '9px 20px',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: "'Sora', sans-serif",
                whiteSpace: 'nowrap',
                opacity: generating || !genText.trim() ? 0.5 : 1,
              }}
            >
              {generating ? 'Gerando...' : 'Gerar Audio'}
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
