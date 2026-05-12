'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
/** Dynamic. */
export const dynamic = 'force-dynamic';

import { Card } from '@/components/kloel/Card';
import { SectionPage } from '@/components/kloel/SectionPage';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { NewLauncherModal } from './NewLauncherModal';
import { AddGroupModal } from './AddGroupModal';

const SORA = "'Sora', sans-serif";
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
        borderBottom: '1px solid var(--border-space)',
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
              fontFamily: "'JetBrains Mono', monospace",
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
      icon={kloelT(`&rgb(18, 134, 64);`)}
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
            color: colors.text.silver,
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
              color: colors.semantic.error,
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
