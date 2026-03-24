'use client';

import { useState } from 'react';
import { useWhatsAppSession } from '@/hooks/useWhatsAppSession';
import { useAutopilotStatus, useAutopilotConfig, useAutopilotMutations } from '@/hooks/useAutopilot';
import { Card } from '@/components/kloel/Card';
import { PageTitle } from '@/components/kloel/PageTitle';
import { Lbl } from '@/components/kloel/Lbl';
import { Val } from '@/components/kloel/Val';
import { OrbitalLoader } from '@/components/kloel/cosmos/OrbitalLoader';
import { StarField } from '@/components/kloel/cosmos/StarField';
import { colors, typography, motion } from '@/lib/design-tokens';

function ToggleSwitch({ checked, onChange, label, description }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '14px 0',
        borderBottom: `1px solid ${colors.border.void}`,
      }}
    >
      <div>
        <div style={{ fontFamily: typography.fontFamily.display, fontSize: 14, fontWeight: 600, color: colors.text.starlight }}>{label}</div>
        <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 12, color: colors.text.dust, marginTop: 2 }}>{description}</div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        style={{
          width: 44,
          height: 24,
          borderRadius: 12,
          border: 'none',
          cursor: 'pointer',
          background: checked ? colors.accent.webb : colors.background.stellar,
          position: 'relative',
          transition: `background ${motion.duration.normal} ${motion.easing.gravity}`,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: colors.text.starlight,
            position: 'absolute',
            top: 3,
            left: checked ? 23 : 3,
            transition: `left ${motion.duration.normal} ${motion.easing.gravity}`,
          }}
        />
      </button>
    </div>
  );
}

export default function WhatsAppPage() {
  const {
    connected,
    qrCode,
    loading,
    connecting,
    error,
    isPaused,
    statusMessage,
    connect,
    disconnect,
    reset,
    pauseAutonomy,
    resumeAutonomy,
  } = useWhatsAppSession({ enabled: true });

  const { status: autopilotStatus } = useAutopilotStatus();
  const { config: autopilotConfig } = useAutopilotConfig();
  const { toggle: toggleAutopilot, updateConfig } = useAutopilotMutations();

  const [autoReply, setAutoReply] = useState(true);
  const [autoFollowup, setAutoFollowup] = useState(true);
  const [autoClassify, setAutoClassify] = useState(false);

  const handleAutopilotToggle = async (enabled: boolean) => {
    try {
      await toggleAutopilot(enabled);
    } catch (e) {
      console.error('Failed to toggle autopilot', e);
    }
  };

  return (
    <div style={{ padding: 32, position: 'relative', minHeight: '100vh', background: colors.background.void }}>
      <StarField density={35} />
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 960 }}>
        <PageTitle
          title="WhatsApp"
          sub="Conecte seu WhatsApp e configure a automacao inteligente"
        />

        {/* Two-column layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {/* Left: Connection Panel */}
          <Card style={{ padding: 28 }}>
            <Lbl>Status da Conexao</Lbl>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, marginBottom: 16 }}>
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: connected ? colors.state.success : connecting ? colors.state.warning : colors.state.error,
                  boxShadow: connected ? '0 0 8px rgba(45, 212, 160, 0.4)' : 'none',
                }}
              />
              <Val size={16} color={connected ? colors.state.success : colors.text.moonlight}>
                {connected ? 'Conectado' : connecting ? 'Conectando...' : 'Desconectado'}
              </Val>
            </div>

            {statusMessage && (
              <div style={{
                fontFamily: typography.fontFamily.sans,
                fontSize: 13,
                color: colors.text.moonlight,
                marginBottom: 16,
                padding: '10px 14px',
                background: colors.background.nebula,
                borderRadius: 8,
                border: `1px solid ${colors.border.void}`,
              }}>
                {statusMessage}
              </div>
            )}

            {error && (
              <div style={{
                fontFamily: typography.fontFamily.sans,
                fontSize: 13,
                color: colors.state.error,
                marginBottom: 16,
                padding: '10px 14px',
                background: 'rgba(224, 82, 82, 0.08)',
                borderRadius: 8,
                border: '1px solid rgba(224, 82, 82, 0.2)',
              }}>
                {error}
              </div>
            )}

            {/* QR Code */}
            {!connected && qrCode && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: 20,
                marginBottom: 16,
              }}>
                <div style={{
                  background: '#FFFFFF',
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 12,
                }}>
                  <img
                    src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                    alt="QR Code WhatsApp"
                    style={{ width: 220, height: 220 }}
                  />
                </div>
                <div style={{
                  fontFamily: typography.fontFamily.sans,
                  fontSize: 12,
                  color: colors.text.dust,
                  textAlign: 'center',
                }}>
                  Escaneie o QR Code com o WhatsApp do seu celular
                </div>
              </div>
            )}

            {!connected && !qrCode && !connecting && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: 32,
                marginBottom: 16,
              }}>
                <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.3 }}>&#128241;</div>
                <div style={{
                  fontFamily: typography.fontFamily.sans,
                  fontSize: 13,
                  color: colors.text.dust,
                  textAlign: 'center',
                }}>
                  Clique em &quot;Conectar&quot; para gerar o QR Code
                </div>
              </div>
            )}

            {connecting && !qrCode && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
                <OrbitalLoader size={40} />
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 10 }}>
              {!connected ? (
                <button
                  onClick={connect}
                  disabled={loading || connecting}
                  style={{
                    flex: 1,
                    padding: '12px 20px',
                    background: colors.accent.webb,
                    border: 'none',
                    borderRadius: 10,
                    color: '#fff',
                    fontFamily: typography.fontFamily.display,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.6 : 1,
                    transition: `all ${motion.duration.normal} ${motion.easing.gravity}`,
                  }}
                >
                  {loading ? 'Iniciando...' : connecting ? 'Aguardando...' : 'Conectar WhatsApp'}
                </button>
              ) : (
                <>
                  <button
                    onClick={disconnect}
                    disabled={loading}
                    style={{
                      flex: 1,
                      padding: '12px 20px',
                      background: 'rgba(224, 82, 82, 0.1)',
                      border: `1px solid rgba(224, 82, 82, 0.3)`,
                      borderRadius: 10,
                      color: colors.state.error,
                      fontFamily: typography.fontFamily.display,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Desconectar
                  </button>
                  <button
                    onClick={reset}
                    disabled={loading}
                    style={{
                      padding: '12px 20px',
                      background: colors.background.nebula,
                      border: `1px solid ${colors.border.space}`,
                      borderRadius: 10,
                      color: colors.text.moonlight,
                      fontFamily: typography.fontFamily.display,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Resetar
                  </button>
                </>
              )}
            </div>
          </Card>

          {/* Right: Automation Toggles */}
          <Card style={{ padding: 28 }}>
            <Lbl>Automacoes</Lbl>
            <div style={{ marginTop: 8 }}>
              <ToggleSwitch
                checked={!isPaused && connected}
                onChange={(v) => v ? resumeAutonomy() : pauseAutonomy()}
                label="IA Autonoma"
                description="A IA responde e agenda automaticamente"
              />
              <ToggleSwitch
                checked={autoReply}
                onChange={setAutoReply}
                label="Resposta Automatica"
                description="Responda leads automaticamente 24/7"
              />
              <ToggleSwitch
                checked={autoFollowup}
                onChange={setAutoFollowup}
                label="Follow-up Inteligente"
                description="Agendar follow-ups automaticos para leads frios"
              />
              <ToggleSwitch
                checked={autoClassify}
                onChange={setAutoClassify}
                label="Classificacao de Leads"
                description="Classifique leads por interesse automaticamente"
              />
            </div>

            {/* Autopilot Status */}
            <div style={{ marginTop: 24 }}>
              <Lbl>Status do Autopilot</Lbl>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 8,
                padding: '12px 14px',
                background: colors.background.nebula,
                borderRadius: 8,
                border: `1px solid ${colors.border.void}`,
              }}>
                <div style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: (autopilotStatus as any)?.enabled ? colors.state.success : colors.text.dust,
                }} />
                <span style={{
                  fontFamily: typography.fontFamily.sans,
                  fontSize: 13,
                  color: (autopilotStatus as any)?.enabled ? colors.state.success : colors.text.moonlight,
                }}>
                  {(autopilotStatus as any)?.enabled ? 'Ativo' : 'Inativo'}
                </span>
                <span style={{ marginLeft: 'auto', fontFamily: typography.fontFamily.sans, fontSize: 12, color: colors.text.dust }}>
                  {(autopilotStatus as any)?.mode || '--'}
                </span>
              </div>
            </div>

            {connected && (
              <div style={{ marginTop: 24 }}>
                <Lbl>Sessao</Lbl>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  marginTop: 8,
                  fontFamily: typography.fontFamily.sans,
                  fontSize: 13,
                  color: colors.text.moonlight,
                }}>
                  <div>IA: {isPaused ? 'Pausada' : 'Ativa'}</div>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
