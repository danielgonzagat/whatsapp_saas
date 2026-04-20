import { kloelT } from '@/lib/i18n/t';
import { KloelLoadingState } from '@/components/kloel/KloelBrand';

/** Root loading. */
export default function RootLoading() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background:
          'radial-gradient(circle at top, rgba(232, 93, 48, 0.14), transparent 38%), #0A0A0C',
        padding: 24,
      }}
    >
      <KloelLoadingState
        size={118}
        traceColor={kloelT(`#FFFFFF`)}
        label={kloelT(`Kloel`)}
        hint={kloelT(`inicializando a plataforma`)}
        minHeight={320}
      />
    </div>
  );
}
