'use client';

export function CosmicDivider() {
  return (
    <hr
      style={{
        height: 1,
        border: 'none',
        background:
          'linear-gradient(90deg, transparent 0%, #1E1E34 20%, rgba(78, 122, 224, 0.12) 50%, #1E1E34 80%, transparent 100%)',
        opacity: 0.5,
      }}
    />
  );
}

export default CosmicDivider;
