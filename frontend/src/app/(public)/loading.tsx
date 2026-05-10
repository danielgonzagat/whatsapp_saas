/** Public loading. */
import { colors } from '@/lib/design-tokens';

export default function PublicLoading() {
  return (
    <div
      aria-hidden="true"
      style={{
        minHeight: '100vh',
        background: colors.background.void,
      }}
    />
  );
}
