import { SORA } from './utils';

interface THProps {
  children: React.ReactNode;
}

export function TH({ children }: THProps) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        color: 'var(--app-text-tertiary)',
        letterSpacing: '.06em',
        textTransform: 'uppercase',
        fontFamily: SORA,
      }}
    >
      {children}
    </span>
  );
}
