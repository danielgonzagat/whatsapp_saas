import { KloelLoadingState } from '@/components/kloel/KloelBrand';

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
        traceColor="#FFFFFF"
        label="Kloel"
        hint="inicializando a plataforma"
        minHeight={320}
      />
    </div>
  );
}
