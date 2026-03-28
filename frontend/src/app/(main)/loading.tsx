export default function Loading() {
  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      background: '#0A0A0C',
    }}>
      {/* Sidebar skeleton */}
      <div style={{ width: 240, background: '#111113', borderRight: '1px solid #222226' }} />
      {/* Content skeleton */}
      <div style={{ flex: 1, padding: 32 }}>
        <div style={{ width: 200, height: 24, background: '#111113', borderRadius: 6, marginBottom: 24 }} />
        <div style={{ width: '100%', height: 120, background: '#111113', borderRadius: 6, marginBottom: 16 }} />
        <div style={{ width: '60%', height: 80, background: '#111113', borderRadius: 6 }} />
      </div>
    </div>
  );
}
