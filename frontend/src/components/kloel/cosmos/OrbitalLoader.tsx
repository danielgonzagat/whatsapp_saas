'use client';

export function OrbitalLoader({ size = 20 }: { size?: number }) {
  return (
    <div style={{ width: size, height: size, position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          border: '2px solid transparent',
          borderTopColor: '#E85D30',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }}
      />
    </div>
  );
}

export default OrbitalLoader;
