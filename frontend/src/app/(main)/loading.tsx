import { KloelLoadingState } from '@/components/kloel/KloelBrand';

export default function Loading() {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'stretch',
        padding: '24px 24px 40px',
      }}
    >
      <div
        style={{
          width: '100%',
          border: '1px solid #19191C',
          borderRadius: 24,
          background:
            'radial-gradient(circle at top, rgba(232, 93, 48, 0.12), transparent 42%), #0A0A0C',
        }}
      >
        <KloelLoadingState
          size={104}
          label="Kloel"
          hint="carregando o modulo"
          minHeight="calc(100vh - 120px)"
        />
      </div>
    </div>
  );
}
