import { KLOEL_THEME } from '@/lib/kloel-theme';

interface Props {
  proof: string[];
  accentColor: string;
}

export function ProofCards({ proof, accentColor }: Props) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 10,
        margin: '22px 0',
      }}
    >
      {proof.map((item) => (
        <div
          key={item}
          style={{
            border: `1px solid ${KLOEL_THEME.borderPrimary}`,
            background: KLOEL_THEME.bgCard,
            borderRadius: 6,
            padding: 14,
            borderLeft: `3px solid ${accentColor}`,
          }}
        >
          {item}
        </div>
      ))}
    </div>
  );
}
