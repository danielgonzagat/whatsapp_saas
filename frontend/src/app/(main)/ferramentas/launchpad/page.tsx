'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
/** Dynamic. */
export const dynamic = 'force-dynamic';

import { Card } from '@/components/kloel/Card';
import { SectionPage } from '@/components/kloel/SectionPage';
import { launchApi } from '@/lib/api/launch';
import { useRouter } from 'next/navigation';
import { useState, useId } from 'react';

const SORA = "'Sora', sans-serif";
const MONO = "'JetBrains Mono', monospace";
const EMBER = colors.ember.primary;

interface Launcher {
  id: string;
  name: string;
  slug?: string;
  description?: string;
  createdAt: string;
}

function LauncherRow({
  launcher,
  onAddGroup,
}: {
  launcher: Launcher;
  onAddGroup: (id: string) => void;
}) {
  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://kloel.com';
  const joinUrl = launcher.slug ? `${SITE_URL}/launch/join/${launcher.slug}` : null;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '14px 16px',
        borderBottom: '1px solid colors.border.space',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--app-text-primary)',
            fontFamily: SORA,
          }}
        >
          {launcher.name}
        </div>
        {launcher.description && (
          <div
            style={{
              fontSize: 12,
              color: 'var(--app-text-secondary)',
              marginTop: 2,
              fontFamily: SORA,
            }}
          >
            {launcher.description}
          </div>
        )}
        {joinUrl && (
          <div
            style={{
              fontSize: 11,
              color: EMBER,
              marginTop: 4,
              fontFamily: MONO,
              wordBreak: 'break-all',
            }}
          >
            {joinUrl}
          </div>
        )}
      </div>
      <div
        style={{
          fontSize: 11,
          color: 'var(--app-text-tertiary)',
          fontFamily: SORA,
          whiteSpace: 'nowrap',
        }}
      >
        {new Date(launcher.createdAt).toLocaleDateString('pt-BR')}
      </div>
      <button
        type="button"
        onClick={() => onAddGroup(launcher.id)}
        style={{
          padding: '6px 14px',
          background: 'var(--app-bg-card)',
          border: '1px solid var(--app-border-primary)',
          borderRadius: 6,
          color: 'var(--app-text-primary)',
          fontSize: 12,
          fontFamily: SORA,
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          transition: 'border-color 150ms ease',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = `${EMBER}66`;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = colors.border.space;
        }}
      >
        {kloelT(`+ Grupo`)}
      </button>
    </div>
  );
}

function NewLauncherModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const fid = useId();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim()) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await launchApi.createLauncher({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      if (res.error) {
        throw new Error(res.error);
      }
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao criar launcher');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar modal"
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
        }}
      />
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 440,
          background: 'var(--app-bg-card)',
          border: '1px solid var(--app-border-primary)',
          borderRadius: 6,
          padding: 28,
        }}
      >
        <h2
          style={{
            fontFamily: SORA,
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--app-text-primary)',
            margin: '0 0 4px',
          }}
        >
          {kloelT(`Novo Launcher`)}
        </h2>
        <p
          style={{
            fontFamily: SORA,
            fontSize: 13,
            color: 'var(--app-text-secondary)',
            margin: '0 0 24px',
          }}
        >
          {kloelT(`Crie um launcher para gerenciar grupos de WhatsApp.`)}
        </p>

        <label
          style={{
            fontFamily: SORA,
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--app-text-secondary)',
            display: 'block',
            marginBottom: 6,
          }}
          htmlFor={`${fid}-nome`}
        >
          {kloelT(`Nome *`)}
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={kloelT(`Ex: Lancamento Produto X`)}
          style={{
            width: '100%',
            padding: '10px 14px',
            background: 'var(--app-bg-primary)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            color: 'var(--app-text-primary)',
            fontFamily: SORA,
            fontSize: 13,
            outline: 'none',
            marginBottom: 16,
            boxSizing: 'border-box' as const,
          }}
          id={`${fid}-nome`}
        />

        <label
          style={{
            fontFamily: SORA,
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--app-text-secondary)',
            display: 'block',
            marginBottom: 6,
          }}
          htmlFor={`${fid}-desc`}
        >
          {kloelT(`Descricao (opcional)`)}
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={kloelT(`Descricao do lancamento`)}
          rows={3}
          style={{
            width: '100%',
            padding: '10px 14px',
            background: 'var(--app-bg-primary)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            color: 'var(--app-text-primary)',
            fontFamily: SORA,
            fontSize: 13,
            outline: 'none',
            marginBottom: 16,
            boxSizing: 'border-box' as const,
            resize: 'vertical',
          }}
          id={`${fid}-desc`}
        />

        {error && (
          <div
            style={{
              marginBottom: 16,
              padding: '10px 14px',
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 6,
              color:
                '#EF4444' /* PULSE_VISUAL_OK: error/danger red, non-Monitor status indicator */ /* PULSE_VISUAL_OK: error/danger red, non-Monitor status indicator */,
              fontFamily: SORA,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '9px 18px',
              background: 'none',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 6,
              color: 'var(--app-text-secondary)',
              fontFamily: SORA,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {kloelT(`Cancelar`)}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || !name.trim()}
            style={{
              padding: '9px 22px',
              background: EMBER,
              border: 'none',
              borderRadius: 6,
              color:
                '#fff' /* PULSE_VISUAL_OK: universal white shorthand */ /* PULSE_VISUAL_OK: universal white shorthand */,
              fontFamily: SORA,
              fontSize: 13,
              fontWeight: 600,
              cursor: loading ? 'wait' : 'pointer',
              opacity: !name.trim() ? 0.5 : 1,
            }}
          >
            {loading ? 'Criando...' : 'Criar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddGroupModal({
  launcherId,
  onClose,
  onAdded,
}: {
  launcherId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const fid = useId();
  const [groupLink, setGroupLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!groupLink.trim()) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await launchApi.addGroups(launcherId, { groupLink: groupLink.trim() });
      if (res.error) {
        throw new Error(res.error);
      }
      onAdded();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao adicionar grupo');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar modal"
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
        }}
      />
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 440,
          background: 'var(--app-bg-card)',
          border: '1px solid var(--app-border-primary)',
          borderRadius: 6,
          padding: 28,
        }}
      >
        <h2
          style={{
            fontFamily: SORA,
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--app-text-primary)',
            margin: '0 0 4px',
          }}
        >
          {kloelT(`Adicionar Grupo`)}
        </h2>
        <p
          style={{
            fontFamily: SORA,
            fontSize: 13,
            color: 'var(--app-text-secondary)',
            margin: '0 0 24px',
          }}
        >
          {kloelT(`Cole o link de convite do grupo WhatsApp.`)}
        </p>

        <label
          style={{
            fontFamily: SORA,
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--app-text-secondary)',
            display: 'block',
            marginBottom: 6,
          }}
          htmlFor={`${fid}-link`}
        >
          {kloelT(`Link do grupo *`)}
        </label>
        <input
          type="url"
          value={groupLink}
          onChange={(e) => setGroupLink(e.target.value)}
          placeholder="https://chat.whatsapp.com/..."
          style={{
            width: '100%',
            padding: '10px 14px',
            background: 'var(--app-bg-primary)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            color: 'var(--app-text-primary)',
            fontFamily: SORA,
            fontSize: 13,
            outline: 'none',
            marginBottom: 16,
            boxSizing: 'border-box' as const,
          }}
          id={`${fid}-link`}
        />

        {error && (
          <div
            style={{
              marginBottom: 16,
              padding: '10px 14px',
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 6,
              color:
                '#EF4444' /* PULSE_VISUAL_OK: error/danger red, non-Monitor status indicator */ /* PULSE_VISUAL_OK: error/danger red, non-Monitor status indicator */,
              fontFamily: SORA,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '9px 18px',
              background: 'none',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 6,
              color: 'var(--app-text-secondary)',
              fontFamily: SORA,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {kloelT(`Cancelar`)}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || !groupLink.trim()}
            style={{
              padding: '9px 22px',
              background: EMBER,
              border: 'none',
              borderRadius: 6,
              color:
                '#fff' /* PULSE_VISUAL_OK: universal white shorthand */ /* PULSE_VISUAL_OK: universal white shorthand */,
              fontFamily: SORA,
              fontSize: 13,
              fontWeight: 600,
              cursor: loading ? 'wait' : 'pointer',
              opacity: !groupLink.trim() ? 0.5 : 1,
            }}
          >
            {loading ? 'Adicionando...' : 'Adicionar'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Launchpad page. */
export default function LaunchpadPage() {
  const router = useRouter();
  const [launchers, _setLaunchers] = useState<Launcher[]>([]);
  const isLoading = false;
  const error = null;
  const mutate = () => {
    /* no list endpoint yet */
  };

  const [showNewModal, setShowNewModal] = useState(false);
  const [addGroupFor, setAddGroupFor] = useState<string | null>(null);

  return (
    <SectionPage
      title={kloelT(`Launchpad`)}
      icon={kloelT(`&#128640;`)}
      description={kloelT(`Gerencie lancamentos com grupos WhatsApp automatizados`)}
      back={() => router.push('/ferramentas/gerencie')}
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => setShowNewModal(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 18px',
            background: EMBER,
            border: 'none',
            borderRadius: 6,
            color:
              '#fff' /* PULSE_VISUAL_OK: universal white shorthand */ /* PULSE_VISUAL_OK: universal white shorthand */,
            fontFamily: SORA,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {kloelT(`+ Novo Launcher`)}
        </button>
      </div>

      {isLoading ? (
        <Card>
          <div
            style={{
              padding: 32,
              textAlign: 'center',
              color: 'var(--app-text-secondary)',
              fontFamily: SORA,
            }}
          >
            {kloelT(`Carregando launchers...`)}
          </div>
        </Card>
      ) : error ? (
        <Card>
          <div
            style={{
              padding: 32,
              textAlign: 'center',
              color:
                '#EF4444' /* PULSE_VISUAL_OK: error/danger red, non-Monitor status indicator */ /* PULSE_VISUAL_OK: error/danger red, non-Monitor status indicator */,
              fontFamily: SORA,
            }}
          >
            {kloelT(`Erro ao carregar launchers`)}
          </div>
        </Card>
      ) : launchers.length === 0 ? (
        <Card>
          <div style={{ padding: 48, textAlign: 'center' }}>
            <div
              style={{
                fontSize: 14,
                color: 'var(--app-text-tertiary)',
                fontFamily: SORA,
                marginBottom: 8,
              }}
            >
              {kloelT(`Nenhum launcher criado`)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--app-text-tertiary)', fontFamily: SORA }}>
              {kloelT(`Crie um launcher para gerenciar grupos de WhatsApp em lancamentos.`)}
            </div>
          </div>
        </Card>
      ) : (
        <Card>
          {launchers.map((launcher) => (
            <LauncherRow
              key={launcher.id}
              launcher={launcher}
              onAddGroup={(id) => setAddGroupFor(id)}
            />
          ))}
        </Card>
      )}

      {showNewModal && (
        <NewLauncherModal onClose={() => setShowNewModal(false)} onCreated={() => mutate()} />
      )}

      {addGroupFor && (
        <AddGroupModal
          launcherId={addGroupFor}
          onClose={() => setAddGroupFor(null)}
          onAdded={() => mutate()}
        />
      )}
    </SectionPage>
  );
}
