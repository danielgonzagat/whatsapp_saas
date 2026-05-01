

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

